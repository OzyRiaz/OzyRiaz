import { randomBytes } from 'node:crypto';
import { appUrl, demoPaymentsEnabled, isDemo } from '../config';
import { DuplicateError, getDb } from '../db';
import { fmt } from '../money';
import { canTransition, STATUS_LABEL } from '../order-state';
import type { BasketLineInput } from '../pricing';
import { getStripe } from '../stripe';
import type { Fulfilment, Order, OrderStatus, Profile, Promotion, Restaurant, Session, Transaction } from '../types';
import { notify } from './notify';
import { buildQuote, QuoteError } from './quote';
import { isOpenNow } from '../hours';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const reference = () => 'BDF-' + Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

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
    postcode: input.address?.postcode, promoCode: input.promoCode, userId: input.user.userId,
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
      history: [{ status: 'pending_payment', at: now }], paid_at: null,
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
  if (!restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) throw new OrderError('Restaurant payments are not enabled');
  const stripe = getStripe();
  const line_items = order.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency: 'gbp', unit_amount: l.unit_price_pence,
      product_data: { name: l.name, ...(l.options.length ? { description: l.options.map((o) => o.choice).join(', ') } : {}) },
    },
  }));
  if (order.delivery_fee_pence > 0) line_items.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: order.delivery_fee_pence, product_data: { name: 'Delivery fee (set by restaurant)' } } });
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
      // Destination charge: money lands with the restaurant's connected account; BD Feast keeps the application fee.
      ...(order.application_fee_pence > 0 ? { application_fee_amount: order.application_fee_pence } : {}),
      transfer_data: { destination: restaurant.stripe_account_id },
      on_behalf_of: restaurant.stripe_account_id,
      description: `BD Feast order ${order.reference} — ${restaurant.name}`,
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
  await db.insert('transactions', { kind: 'application_fee', order_id: order.id, user_id: null, restaurant_id: order.restaurant_id, amount_pence: order.application_fee_pence, status: 'succeeded', stripe_ref: ref, note: `${order.commission_bps / 100}% ${order.fulfilment} commission` });
  if (order.promo_code) {
    const promo = await db.get<Promotion>('promotions', { code: order.promo_code });
    if (promo) await db.update('promotions', { id: promo.id }, { used_count: promo.used_count + 1 });
  }
  const [customer, restaurant] = await Promise.all([db.get<Profile>('profiles', { id: order.customer_id }), db.get<Restaurant>('restaurants', { id: order.restaurant_id })]);
  await notify({ kind: 'order_confirmation', to: customer?.email, subject: `Order ${order.reference} confirmed`, body: `Thanks ${customer?.full_name ?? ''}! Your order from ${restaurant?.name} (${fmt(order.total_pence)}) has been paid and sent to the restaurant. Track it: ${appUrl()}/orders/${order.id}` });
  await notify({ kind: 'restaurant_new_order', to: restaurant?.email, subject: `New BD Feast order ${order.reference}`, body: `New ${order.fulfilment} order worth ${fmt(order.total_pence)}. Open your dashboard to accept or reject: ${appUrl()}/dashboard` });
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

export async function updateOrderStatus(orderId: string, to: OrderStatus, actor: Session, opts: { reason?: string } = {}): Promise<Order> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order) throw new OrderError('Order not found');
  if (!actor.restaurantIds.includes(order.restaurant_id)) throw new OrderError('You do not have access to this order'); // tenant isolation
  if (order.payment_status !== 'paid') throw new OrderError('This order has not been paid');
  if (!canTransition(order.status, to, order.fulfilment)) throw new OrderError(`Cannot move an order from "${STATUS_LABEL[order.status]}" to "${STATUS_LABEL[to]}"`);
  if (to === 'rejected' && !opts.reason?.trim()) throw new OrderError('Please give the customer a reason');
  const now = new Date().toISOString();
  const [updated] = await db.update<Order>('orders', { id: order.id, status: order.status }, {
    status: to, rejection_reason: to === 'rejected' ? opts.reason!.trim().slice(0, 300) : order.rejection_reason, history: [...order.history, { status: to, at: now, by: actor.userId }],
  });
  if (!updated) throw new OrderError('Order was updated by someone else — refresh and try again');
  if (to === 'rejected') await refundOrder(order.id, order.total_pence - order.refunded_pence, 'Restaurant rejected the order', actor.userId);
  const customer = await db.get<Profile>('profiles', { id: order.customer_id });
  await notify({ kind: 'order_status', to: customer?.email, subject: `Order ${order.reference}: ${STATUS_LABEL[to]}`, body: `Your order status is now "${STATUS_LABEL[to]}".${to === 'rejected' ? ` Reason: ${opts.reason}. You will be refunded in full.` : ''} ${appUrl()}/orders/${order.id}` });
  return updated;
}

/** Refund (full or partial). Reverses the restaurant transfer and refunds the proportional application fee. */
export async function refundOrder(orderId: string, amountPence: number, reason: string, actorId: string | null): Promise<Order> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order) throw new OrderError('Order not found');
  if (order.payment_status === 'unpaid' || order.payment_status === 'failed') throw new OrderError('Order has not been paid');
  const remaining = order.total_pence - order.refunded_pence;
  if (amountPence <= 0 || amountPence > remaining) throw new OrderError(`Refund must be between 1p and ${fmt(remaining)}`);
  let ref = `re_demo_${Date.now()}`;
  if (order.stripe_payment_intent_id && !order.stripe_payment_intent_id.startsWith('pi_demo') && !demoPaymentsEnabled()) {
    const r = await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id, amount: amountPence, reverse_transfer: true, refund_application_fee: true,
      metadata: { order_id: order.id, reason: reason.slice(0, 200) },
    }, { idempotencyKey: `refund:${order.id}:${order.refunded_pence}:${amountPence}` });
    ref = r.id;
  }
  const refunded = order.refunded_pence + amountPence;
  const [u] = await db.update<Order>('orders', { id: order.id }, { refunded_pence: refunded, payment_status: refunded >= order.total_pence ? 'refunded' : 'partially_refunded' });
  await db.insert('transactions', { kind: 'refund', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: -amountPence, status: 'succeeded', stripe_ref: ref, note: `${reason}${actorId ? ` (by ${actorId})` : ''}` });
  const c = await db.get<Profile>('profiles', { id: order.customer_id });
  await notify({ kind: 'refund', to: c?.email, subject: `Refund for order ${order.reference}`, body: `We've refunded ${fmt(amountPence)} to your original payment method. It can take 5–10 working days to appear.` });
  return u;
}

/** Reconcile refunds issued directly in the Stripe dashboard (charge.refunded webhook). */
export async function reconcileRefund(paymentIntentId: string, totalRefundedPence: number, ref: string) {
  const db = await getDb();
  const order = await db.get<Order>('orders', { stripe_payment_intent_id: paymentIntentId });
  if (!order || totalRefundedPence <= order.refunded_pence) return;
  const delta = totalRefundedPence - order.refunded_pence;
  await db.update('orders', { id: order.id }, { refunded_pence: totalRefundedPence, payment_status: totalRefundedPence >= order.total_pence ? 'refunded' : 'partially_refunded' });
  await db.insert('transactions', { kind: 'refund', order_id: order.id, user_id: order.customer_id, restaurant_id: order.restaurant_id, amount_pence: -delta, status: 'succeeded', stripe_ref: ref, note: 'Refund issued in Stripe' });
}

export const listOrdersFor = async (where: Record<string, unknown>, limit = 100) =>
  (await getDb()).select<Order>('orders', where, { order: ['created_at', 'desc'], limit });

export type { Transaction };
