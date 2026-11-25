import { randomBytes } from 'node:crypto';
import { appUrl, demoPaymentsEnabled, isDemo, PAYMENTS_OFF_MESSAGE, stripeConfigured } from '../config';
import { DuplicateError, getDb } from '../db';
import { fmt } from '../money';
import { canTransition, labelFor, STATUS_LABEL } from '../order-state';
import type { BasketLineInput } from '../pricing';
import { getStripe } from '../stripe';
import type { Fulfilment, Order, OrderStatus, Profile, Promotion, Restaurant, Session, Transaction } from '../types';
import { allocateRefund, remainingComponents } from '../refunds';
import { getSettings } from './settings';
import { notify, sendSms } from './notify';
import { buildQuote, QuoteError } from './quote';
import { isOpenNow } from '../hours';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const reference = () => 'FQ-' + Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

export class OrderError extends Error {}

export interface CreateOrderInput {
  user: Session;
  restaurantId: string;
  lines: BasketLineInput[];
  fulfilment: Fulfilment;
  address?: { line1: string; line2?: string | null; city: string; postcode: string } | null;
  note?: string | null;
  phone?: string | null;
  promoCode?: string | null;
  tipPence?: number | null;
  source?: string | null; // campaign attribution (from ?src= / utm_source)
  campaign?: string | null;
  idempotencyKey: string;
}

/** Creates an UNPAID order. It only becomes payable/visible to the restaurant once the Stripe webhook confirms payment. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = await getDb();
  const prior = await db.get<Order>('orders', { idempotency_key: input.idempotencyKey });
  if (prior) {
    if (prior.customer_id !== input.user.userId) throw new OrderError('Invalid order reference');
    return prior; // duplicate submit → same order
  }
  const customer = await db.get<Profile>('profiles', { id: input.user.userId });
  if (!customer || customer.suspended || customer.deleted_at) throw new OrderError('Your account cannot place orders');
  const quote = await buildQuote({
    restaurantId: input.restaurantId, lines: input.lines, fulfilment: input.fulfilment,
    postcode: input.address?.postcode, promoCode: input.promoCode, tipPence: input.tipPence, userId: input.user.userId,
  });
  if (input.promoCode && quote.promoError) throw new QuoteError(quote.promoError);
  if ((!isDemo || process.env.ENFORCE_OPENING_HOURS === 'true') && !isOpenNow(quote.restaurant.opening_hours)) throw new OrderError(`${quote.restaurant.name} is closed right now`);
  if (!quote.restaurant.stripe_charges_enabled || !quote.restaurant.stripe_account_id) throw new OrderError('This restaurant has not finished payment setup yet and cannot take orders');
  if (input.fulfilment === 'delivery' && !input.address) throw new OrderError('A delivery address is required');
  const now = new Date().toISOString();
  const { restaurant: _r, lines, isMember: _m, promoError: _p, memberHint: _h, open: _o, ...totals } = quote;
  try {
    return await db.insert<Order>('orders', {
      reference: reference(), customer_id: input.user.userId, restaurant_id: input.restaurantId, idempotency_key: input.idempotencyKey,
      fulfilment: input.fulfilment, status: 'pending_payment', payment_status: 'unpaid', lines, ...totals,
      delivery_address: input.fulfilment === 'delivery' ? input.address : null,
      customer_note: input.note?.slice(0, 500) ?? null, contact_phone: input.phone ?? null,
      stripe_session_id: null, stripe_payment_intent_id: null, rejection_reason: null, refunded_pence: 0,
      refunded_food_pence: 0, refunded_delivery_pence: 0, refunded_tip_pence: 0, refunded_service_fee_pence: 0, commission_refunded_pence: 0, restaurant_refunded_pence: 0, stripe_transfer_id: null,
      history: [{ status: 'pending_payment', at: now }], paid_at: null, stripe_fee_pence: null, ready_in_minutes: null, accepted_at: null, escalated_at: null, source: input.source ?? null, campaign: input.campaign ?? null,
    });
  } catch (e) {
    if (e instanceof DuplicateError) { // lost a race with a concurrent identical submit
      const again = await db.get<Order>('orders', { idempotency_key: input.idempotencyKey });
      if (again && again.customer_id === input.user.userId) return again;
    }
    throw e;
  }
}

/** Returns a URL to send the customer to for payment. */
export async function createPaymentSession(order: Order, customerEmail: string): Promise<{ url: string }> {
  const db = await getDb();
  if (order.payment_status === 'paid') throw new OrderError('This order is already paid');
  const restaurant = (await db.get<Restaurant>('restaurants', { id: order.restaurant_id }))!;
  if (demoPaymentsEnabled()) return { url: `/checkout/demo?order=${order.id}` };
  if (!stripeConfigured()) throw new OrderError(PAYMENTS_OFF_MESSAGE);
  if (!restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) throw new OrderError('Restaurant payments are not enabled');
  const stripe = getStripe();
  const line_items = order.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency: 'gbp', unit_amount: l.unit_price_pence,
      product_data: { name: l.name, ...(l.options.length ? { description: l.options.map((o) => o.choice).join(', ') } : {}) },
    },
  }));
  if (order.tip_pence > 0) line_items.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: order.tip_pence, product_data: { name: 'Tip (goes to the restaurant and its team)' } } });
  if (order.delivery_fee_pence > 0) line_items.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: order.delivery_fee_pence, product_data: { name: 'Delivery fee (set by restaurant)' } } });
  // FeastQuarter customer service fee: one line, shown once. Session creation is idempotent per order, so retries never add it twice.
  if ((order.service_fee_pence ?? 0) + (order.service_fee_vat_pence ?? 0) > 0 && (order.service_fee_pence ?? 0) > 0) line_items.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: order.service_fee_pence, product_data: { name: 'FeastQuarter service fee' } } });
  const discounts = order.discount_pence > 0
    ? [{ coupon: (await stripe.coupons.create({ amount_off: order.discount_pence, currency: 'gbp', duration: 'once', name: (order.discount_label ?? 'Discount').slice(0, 40) })).id }]
    : undefined;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.id,
    customer_email: customerEmail,
    line_items,
    discounts,
    payment_intent_data: {
      // Destination charge: money lands with the restaurant's connected account; FeastQuarter keeps the application fee.
      ...(order.application_fee_pence > 0 ? { application_fee_amount: order.application_fee_pence } : {}),
      transfer_data: { destination: restaurant.stripe_account_id },
      // Default OFF: FeastQuarter is the settlement merchant (customers see FeastQuarter on their statement).
      // on_behalf_of is only REQUIRED when platform and restaurant are in different regions (Stripe docs). Platform pays Stripe fees either way.
      ...(process.env.STRIPE_USE_ON_BEHALF_OF === 'true' ? { on_behalf_of: restaurant.stripe_account_id } : {}),
      description: `FeastQuarter order ${order.reference} — ${restaurant.name}`,
      metadata: { order_id: order.id, reference: order.reference },
    },
    metadata: { kind: 'order', order_id: order.id },
    success_url: `${appUrl()}/checkout/success?order=${order.id}`,
    cancel_url: `${appUrl()}/basket?cancelled=1`,
  }, { idempotencyKey: `order-session-${order.id}` });
  await db.update('orders', { id: order.id }, { stripe_session_id: session.id });
  return { url: session.url! };
}

/**
 * Idempotent: safe to call many times (webhook retries, duplicate events).
 * Called ONLY from verified webhooks (or the demo-pay route in demo mode) — never from a browser redirect.
 */
export async function markOrderPaid(orderId: string, p: { paymentIntentId?: string | null; amountPence?: number; source: 'stripe' | 'demo' }): Promise<{ changed: boolean; order: Order }> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order) throw new OrderError(`Order ${orderId} not found`);
  if (order.payment_status === 'paid' || order.payment_status === 'refunded' || order.payment_status === 'partially_refunded') return { changed: false, order };
  if (p.amountPence !== undefined && p.amountPence !== order.total_pence) {
    await db.insert('transactions', { kind: 'payment_failed', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: p.amountPence, status: 'failed', stripe_ref: p.paymentIntentId ?? null, note: `Amount mismatch: paid ${p.amountPence}, expected ${order.total_pence}. Needs manual review.` });
    throw new OrderError('Paid amount does not match order total');
  }
  const now = new Date().toISOString();
  // Conditional write: only the first caller flips the order. Others see changed=false.
  const claimed = await db.update<Order>('orders', { id: order.id, payment_status: order.payment_status }, {
    payment_status: 'paid', status: 'awaiting_restaurant', paid_at: now, stripe_payment_intent_id: p.paymentIntentId ?? order.stripe_payment_intent_id,
    history: [...order.history, { status: 'awaiting_restaurant', at: now, by: p.source }],
  });
  if (!claimed.length || (claimed[0].paid_at !== now)) return { changed: false, order: claimed[0] ?? order };
  const ref = p.paymentIntentId ?? null;
  await db.insert('transactions', { kind: 'order_payment', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: order.total_pence, status: 'succeeded', stripe_ref: ref, note: p.source === 'demo' ? 'Simulated demo payment' : null });
  await db.insert('transactions', { kind: 'application_fee', order_id: order.id, user_id: null, restaurant_id: order.restaurant_id, amount_pence: order.application_fee_pence, status: 'succeeded', stripe_ref: ref, note: `${order.commission_bps / 100}% ${order.fulfilment} commission${order.service_fee_pence ? ` + ${fmt(order.service_fee_pence)} service fee` : ''}` });
  if (order.promo_code) {
    const promo = await db.get<Promotion>('promotions', { code: order.promo_code });
    if (promo) await db.update('promotions', { id: promo.id }, { used_count: promo.used_count + 1 });
  }
  const [customer, restaurant] = await Promise.all([db.get<Profile>('profiles', { id: order.customer_id }), db.get<Restaurant>('restaurants', { id: order.restaurant_id })]);
  await notify({ kind: 'order_confirmation', to: customer?.email, subject: `Order ${order.reference} confirmed`, body: `Thanks ${customer?.full_name ?? ''}! Your order from ${restaurant?.name} (${fmt(order.total_pence)}${order.service_fee_pence ? `, including the ${fmt(order.service_fee_pence)} FeastQuarter service fee` : ''}) has been paid and sent to the restaurant. Track it: ${appUrl()}/orders/${order.id}` });
  void sendSms('restaurant_new_order', restaurant?.phone, `FeastQuarter: new ${order.fulfilment} order ${order.reference} (${fmt(order.total_pence - (order.service_fee_pence ?? 0))}). Open your dashboard to accept.`);
  await notify({ kind: 'restaurant_new_order', to: restaurant?.email, subject: `New FeastQuarter order ${order.reference}`, body: `New ${order.fulfilment} order worth ${fmt(order.total_pence - (order.service_fee_pence ?? 0))}. Open your dashboard to accept or reject: ${appUrl()}/dashboard` });
  return { changed: true, order: claimed[0] };
}

export async function markPaymentFailed(orderId: string, reason: string, ref?: string | null) {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order || order.payment_status === 'paid') return; // never downgrade a paid order
  const now = new Date().toISOString();
  const already = order.status === 'payment_failed';
  await db.update('orders', { id: order.id }, { payment_status: 'failed', status: 'payment_failed', history: already ? order.history : [...order.history, { status: 'payment_failed', at: now }] });
  if (already) return;
  await db.insert('transactions', { kind: 'payment_failed', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: order.total_pence, status: 'failed', stripe_ref: ref ?? null, note: reason });
  const c = await db.get<Profile>('profiles', { id: order.customer_id });
  await notify({ kind: 'payment_failed', to: c?.email, subject: `Payment failed for order ${order.reference}`, body: `Your payment for order ${order.reference} did not go through (${reason}). No food order has been sent to the restaurant. You can try again from your basket.` });
}

export async function updateOrderStatus(orderId: string, to: OrderStatus, actor: Session, opts: { reason?: string; readyInMinutes?: number } = {}): Promise<Order> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order) throw new OrderError('Order not found');
  if (!actor.restaurantIds.includes(order.restaurant_id)) throw new OrderError('You do not have access to this order'); // tenant isolation
  if (order.payment_status !== 'paid') throw new OrderError('This order has not been paid');
  if (!canTransition(order.status, to, order.fulfilment)) throw new OrderError(`Cannot move an order from "${STATUS_LABEL[order.status]}" to "${STATUS_LABEL[to]}"`);
  if (to === 'rejected' && !opts.reason?.trim()) throw new OrderError('Please give the customer a reason');
  const now = new Date().toISOString();
  if (opts.readyInMinutes !== undefined && (!Number.isInteger(opts.readyInMinutes) || opts.readyInMinutes < 5 || opts.readyInMinutes > 180)) throw new OrderError('Preparation time must be between 5 and 180 minutes');
  const restaurantRow = to === 'accepted' ? await db.get<Restaurant>('restaurants', { id: order.restaurant_id }) : null;
  const [updated] = await db.update<Order>('orders', { id: order.id, status: order.status }, {
    ...(to === 'accepted' ? { accepted_at: now, ready_in_minutes: opts.readyInMinutes ?? restaurantRow?.prep_minutes ?? 30 } : {}),
    status: to, rejection_reason: to === 'rejected' ? opts.reason!.trim().slice(0, 300) : order.rejection_reason, history: [...order.history, { status: to, at: now, by: actor.userId }],
  });
  if (!updated) throw new OrderError('Order was updated by someone else — refresh and try again');
  if (to === 'rejected') await refundOrder(order.id, order.total_pence - order.refunded_pence, 'Restaurant rejected the order', actor.userId, { kind: 'declined' });
  const customer = await db.get<Profile>('profiles', { id: order.customer_id });
  const msg: Partial<Record<OrderStatus, string>> = {
    accepted: `The restaurant has accepted your order and expects it to be ready in about ${updated.ready_in_minutes ?? 30} minutes.`,
    preparing: 'Your order is being prepared.',
    ready: order.fulfilment === 'collection' ? 'Your order is ready for collection.' : 'Your order is ready and will be out for delivery shortly.',
    out_for_delivery: 'Your order is out for delivery with the restaurant\'s driver.',
    completed: order.fulfilment === 'delivery' ? 'Your order has been delivered. Enjoy!' : 'Your order has been collected. Enjoy!',
    rejected: `The restaurant couldn't accept your order. Reason: ${opts.reason}. You will be refunded in full.`,
  };
  await notify({ kind: `order_${to}`, to: customer?.email, subject: `Order ${order.reference}: ${labelFor(to, order.fulfilment)}`, body: `${msg[to] ?? `Your order status is now "${labelFor(to, order.fulfilment)}".`} Track it: ${appUrl()}/orders/${order.id}` });
  return updated;
}

/**
 * Customer cancels their own PAID order, only while the restaurant has not yet accepted it.
 * The status flip is a conditional write, so a restaurant accepting at the same moment wins or loses cleanly (never both).
 * The refund follows the admin setting `service_fee_refund_on_customer_cancel` (default: the 99p is refunded too).
 */
export async function cancelOrderByCustomer(orderId: string, customerId: string): Promise<Order> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order || order.customer_id !== customerId) throw new OrderError('Order not found');
  if (order.payment_status !== 'paid' || order.status !== 'awaiting_restaurant') throw new OrderError('This order can only be cancelled before the restaurant accepts it. Please contact the restaurant or request a refund instead.');
  const now = new Date().toISOString();
  const [claimed] = await db.update<Order>('orders', { id: order.id, status: 'awaiting_restaurant', payment_status: 'paid' }, { status: 'cancelled', rejection_reason: 'Cancelled by the customer', history: [...order.history, { status: 'cancelled', at: now, by: 'customer' }] });
  if (!claimed) throw new OrderError('The restaurant has just accepted this order, so it can no longer be cancelled here. Please contact the restaurant.');
  try {
    await refundOrder(order.id, order.total_pence - order.refunded_pence, 'Cancelled by the customer before acceptance', customerId, { kind: 'customer_cancel' });
  } catch (e) {
    await db.update('orders', { id: order.id, status: 'cancelled' }, { status: 'awaiting_restaurant', rejection_reason: null, history: order.history }); // refund failed: put the order back, nothing lost
    throw e;
  }
  const restaurant = await db.get<Restaurant>('restaurants', { id: order.restaurant_id });
  await notify({ kind: 'order_cancelled_customer', to: restaurant?.email, subject: `Order ${order.reference} was cancelled by the customer`, body: `The customer cancelled order ${order.reference} before you accepted it. No action is needed; it has been refunded and removed from your queue.` });
  return (await db.get<Order>('orders', { id: order.id }))!;
}

export type RefundKind = 'full' | 'partial' | 'declined' | 'customer_cancel' | 'timeout';

/**
 * Refund (full or partial) with an EXACT allocation between the customer's food, delivery, tip and the FeastQuarter service fee.
 *  - Refunded from the platform; then only the RESTAURANT'S share is reversed from its transfer (never the service fee, never the commission handed back).
 *  - Restaurant declined / timed out / could not fulfil => everything incl. the 99p is refunded (amount == remaining refunds all).
 *  - Customer-requested cancellation => follows the `service_fee_refund_on_customer_cancel` setting.
 *  - A partial amount is applied to food, then delivery, then tip; the service fee only with `includeServiceFee`. Commission shrinks with food.
 * Every refund writes an auditable order_refunds row.
 */
export async function refundOrder(orderId: string, amountPence: number, reason: string, actorId: string | null, opts: { kind?: RefundKind; includeServiceFee?: boolean } = {}): Promise<Order> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order) throw new OrderError('Order not found');
  if (order.payment_status === 'unpaid' || order.payment_status === 'failed') throw new OrderError('Order has not been paid');
  const remaining = order.total_pence - order.refunded_pence;
  let kind: RefundKind = opts.kind ?? (amountPence === remaining ? 'full' : 'partial');
  let b;
  try {
    if (kind === 'customer_cancel') {
      const settings = await getSettings();
      b = allocateRefund(order, { mode: settings.service_fee_refund_on_customer_cancel ? 'all' : 'all_but_service_fee' });
    } else if (amountPence === remaining || kind === 'declined' || kind === 'timeout') {
      b = allocateRefund(order, { mode: 'all' });
    } else {
      b = allocateRefund(order, { mode: 'amount', amountPence, includeServiceFee: opts.includeServiceFee });
    }
  } catch {
    const rc = remainingComponents(order), exService = rc.food + rc.delivery + rc.tip;
    throw new OrderError(exService < remaining
      ? `Refund must be between 1p and ${fmt(exService)} (the ${fmt(rc.service)} FeastQuarter service fee is only refunded with the full remaining ${fmt(remaining)})`
      : `Refund must be between 1p and ${fmt(remaining)}`);
  }
  if (b.amount_pence <= 0 || b.amount_pence > remaining || (kind !== 'customer_cancel' && (amountPence <= 0 || amountPence > remaining))) throw new OrderError(`Refund must be between 1p and ${fmt(remaining)}`);
  const amount = b.amount_pence;
  const refunded = order.refunded_pence + amount;
  const next = {
    refunded_pence: refunded, payment_status: refunded >= order.total_pence ? 'refunded' : 'partially_refunded',
    refunded_food_pence: (order.refunded_food_pence ?? 0) + b.food_pence, refunded_delivery_pence: (order.refunded_delivery_pence ?? 0) + b.delivery_pence,
    refunded_tip_pence: (order.refunded_tip_pence ?? 0) + b.tip_pence, refunded_service_fee_pence: (order.refunded_service_fee_pence ?? 0) + b.service_fee_pence,
    commission_refunded_pence: (order.commission_refunded_pence ?? 0) + b.commission_returned_pence,
  };
  const before = {
    refunded_pence: order.refunded_pence, payment_status: order.payment_status,
    refunded_food_pence: order.refunded_food_pence ?? 0, refunded_delivery_pence: order.refunded_delivery_pence ?? 0, refunded_tip_pence: order.refunded_tip_pence ?? 0,
    refunded_service_fee_pence: order.refunded_service_fee_pence ?? 0, commission_refunded_pence: order.commission_refunded_pence ?? 0,
  };
  // RESERVE the refund in our own records BEFORE calling Stripe. Stripe's refund webhook can arrive before refunds.create() returns; if the order
  // still looked un-refunded it would be logged a second time. The conditional write also stops two concurrent refunds both passing the limit check.
  const claimed = await db.update<Order>('orders', { id: order.id, refunded_pence: order.refunded_pence }, next);
  if (!claimed.length) throw new OrderError('This order was just refunded or changed — refresh and check before trying again');
  let ref = `re_demo_${Date.now()}`;
  let reversalId: string | null = null, reversalError: string | null = null, transferId = order.stripe_transfer_id;
  const live = !!order.stripe_payment_intent_id && !order.stripe_payment_intent_id.startsWith('pi_demo') && !demoPaymentsEnabled();
  if (live) {
    const stripe = getStripe();
    const key = `refund:${order.id}:${order.refunded_pence}:${amount}`;
    try {
      // 1. Refund the customer from the platform balance (no automatic proportional reversal: we reverse the exact restaurant share below).
      const r = await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id!, amount, metadata: { order_id: order.id, reason: reason.slice(0, 200), service_fee_pence: String(b.service_fee_pence), restaurant_share_pence: String(b.restaurant_share_pence) } }, { idempotencyKey: key });
      ref = r.id;
    } catch (e) {
      await db.update('orders', { id: order.id }, before); // Stripe refused: release the reservation
      throw e;
    }
    // 2. Pull back only the restaurant's share of the transfer. If that fails (e.g. insufficient connected balance) the refund still stands and the shortfall is flagged for recovery.
    if (b.restaurant_share_pence > 0) {
      try {
        if (!transferId) {
          const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id!, { expand: ['latest_charge'] });
          const ch = pi.latest_charge as { transfer?: string | null } | null;
          transferId = ch && typeof ch === 'object' ? ch.transfer ?? null : null;
        }
        if (!transferId) throw new Error('No transfer found for this payment');
        const rev = await stripe.transfers.createReversal(transferId, { amount: b.restaurant_share_pence, metadata: { order_id: order.id, refund_id: ref } }, { idempotencyKey: `${key}:reversal` });
        reversalId = rev.id;
      } catch (e) { reversalError = (e as Error).message.slice(0, 300); }
    }
  }
  const restaurantBorne = reversalError ? 0 : b.restaurant_share_pence;
  const [u] = await db.update<Order>('orders', { id: order.id }, { restaurant_refunded_pence: (order.restaurant_refunded_pence ?? 0) + restaurantBorne, stripe_transfer_id: transferId ?? null });
  await db.insert('order_refunds', {
    order_id: order.id, kind, amount_pence: amount, food_pence: b.food_pence, delivery_pence: b.delivery_pence, tip_pence: b.tip_pence, service_fee_pence: b.service_fee_pence,
    commission_returned_pence: b.commission_returned_pence, restaurant_share_pence: b.restaurant_share_pence, platform_share_pence: b.platform_share_pence,
    reason: reason.slice(0, 300), actor_id: actorId, stripe_refund_id: live ? ref : null, stripe_reversal_id: reversalId, reversal_error: reversalError,
  });
  await db.insert('transactions', { kind: 'refund', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: -amount, status: 'succeeded', stripe_ref: ref, note: `${reason}${actorId ? ` (by ${actorId})` : ''}${b.service_fee_pence ? ` · incl. ${fmt(b.service_fee_pence)} service fee` : ''}${reversalError ? ' · RESTAURANT REVERSAL FAILED — needs recovery' : ''}` });
  const c = await db.get<Profile>('profiles', { id: order.customer_id });
  const parts = [b.food_pence && `food ${fmt(b.food_pence)}`, b.delivery_pence && `delivery ${fmt(b.delivery_pence)}`, b.tip_pence && `tip ${fmt(b.tip_pence)}`, b.service_fee_pence && `service fee ${fmt(b.service_fee_pence)}`].filter(Boolean).join(', ');
  await notify({ kind: 'refund', to: c?.email, subject: `Refund for order ${order.reference}`, body: `We've refunded ${fmt(amount)} (${parts}) to your original payment method. It can take 5–10 working days to appear.` });
  return u;
}
export async function reconcileRefund(paymentIntentId: string, totalRefundedPence: number, ref: string) {
  const db = await getDb();
  const order = await db.get<Order>('orders', { stripe_payment_intent_id: paymentIntentId });
  if (!order || totalRefundedPence <= order.refunded_pence) return;
  const delta = totalRefundedPence - order.refunded_pence;
  await db.update('orders', { id: order.id }, { refunded_pence: totalRefundedPence, payment_status: totalRefundedPence >= order.total_pence ? 'refunded' : 'partially_refunded' });
  await db.insert('order_refunds', { order_id: order.id, kind: 'external', amount_pence: delta, food_pence: 0, delivery_pence: 0, tip_pence: 0, service_fee_pence: 0, commission_returned_pence: 0, restaurant_share_pence: 0, platform_share_pence: delta, reason: 'Refund issued directly in Stripe — not allocated; review in Stripe', actor_id: null, stripe_refund_id: ref, stripe_reversal_id: null, reversal_error: null });
  await db.insert('transactions', { kind: 'refund', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: -delta, status: 'succeeded', stripe_ref: ref, note: 'Refund issued in Stripe (unallocated)' });
}

export const listOrdersFor = async (where: Record<string, unknown>, limit = 100) =>
  (await getDb()).select<Order>('orders', where, { order: ['created_at', 'desc'], limit });

export type { Transaction };
