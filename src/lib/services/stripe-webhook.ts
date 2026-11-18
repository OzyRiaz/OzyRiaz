import type Stripe from 'stripe';
import { DuplicateError, getDb } from '../db';
import { fmt } from '../money';
import type { Membership, Order, Profile, Restaurant } from '../types';
import { activateMembership, endMembership } from './membership';
import { notify } from './notify';
import { markOrderPaid, markPaymentFailed, reconcileRefund } from './orders';

const periodEnd = (sub: any): Date | null => {
  const s = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  return s ? new Date(s * 1000) : null;
};
const idOf = (x: unknown): string | null => (typeof x === 'string' ? x : (x as { id?: string } | null)?.id ?? null);

/**
 * Process a signature-VERIFIED Stripe event exactly once.
 * The event id is recorded first (unique key); duplicates are acknowledged and skipped.
 * If handling throws, the record is removed so Stripe's retry can process it again.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
  const db = await getDb();
  try {
    await db.insert('stripe_events', { id: event.id, type: event.type, received_at: new Date().toISOString() });
  } catch (e) {
    if (e instanceof DuplicateError) return { duplicate: true };
    throw e;
  }
  try {
    await handle(event);
  } catch (e) {
    await db.delete('stripe_events', { id: event.id });
    throw e;
  }
  return { duplicate: false };
}

async function handle(event: Stripe.Event) {
  const db = await getDb();
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.kind === 'order' && s.metadata.order_id) {
        if (s.payment_status === 'paid') await markOrderPaid(s.metadata.order_id, { paymentIntentId: idOf(s.payment_intent), amountPence: s.amount_total ?? undefined, source: 'stripe' });
        // payment_status "unpaid" = async method pending; wait for async_payment_succeeded/failed.
      } else if (s.metadata?.kind === 'membership' && s.metadata.user_id && s.mode === 'subscription') {
        await activateMembership(s.metadata.user_id, { customerId: idOf(s.customer), subscriptionId: idOf(s.subscription) });
      }
      return;
    }
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.order_id) await markPaymentFailed(s.metadata.order_id, 'Payment method declined', idOf(s.payment_intent));
      return;
    }
    case 'checkout.session.expired': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.order_id) await db.update('orders', { id: s.metadata.order_id, status: 'pending_payment' }, { status: 'cancelled' });
      return;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.order_id) await markPaymentFailed(pi.metadata.order_id, pi.last_payment_error?.message ?? 'Card declined', pi.id);
      return;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const m = await membershipFor(idOf(inv.customer));
      if (!m) return;
      const end = (inv.lines?.data ?? []).map((l) => l.period?.end).filter(Boolean).sort().pop();
      await activateMembership(m.user_id, { customerId: idOf(inv.customer), periodEnd: end ? new Date(end * 1000) : null });
      await db.insert('transactions', { kind: 'membership_payment', order_id: null, user_id: m.user_id, restaurant_id: null, amount_pence: inv.amount_paid, status: 'succeeded', stripe_ref: inv.id ?? null, note: 'BD Feast Plus' });
      return;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const m = await membershipFor(idOf(inv.customer));
      if (!m) return;
      await db.update('memberships', { user_id: m.user_id }, { status: 'past_due' });
      await db.insert('transactions', { kind: 'payment_failed', order_id: null, user_id: m.user_id, restaurant_id: null, amount_pence: inv.amount_due, status: 'failed', stripe_ref: inv.id ?? null, note: 'Membership renewal failed' });
      const u = await db.get<Profile>('profiles', { id: m.user_id });
      await notify({ kind: 'membership_payment_failed', to: u?.email, subject: 'BD Feast Plus payment failed', body: `We couldn't take your BD Feast Plus payment of ${fmt(inv.amount_due)}. Please update your payment method to keep your benefits.` });
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.user_id ?? (await membershipFor(idOf(sub.customer)))?.user_id;
      if (!uid) return;
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : sub.status === 'incomplete' ? 'incomplete' : 'cancelled';
      const m = await db.get<Membership>('memberships', { user_id: uid });
      const patch = { status, stripe_subscription_id: sub.id, stripe_customer_id: idOf(sub.customer), cancel_at_period_end: !!sub.cancel_at_period_end, current_period_end: periodEnd(sub)?.toISOString() ?? m?.current_period_end ?? null };
      if (m) await db.update('memberships', { user_id: uid }, patch); else await db.insert('memberships', { user_id: uid, ...patch });
      return;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.user_id ?? (await membershipFor(idOf(sub.customer)))?.user_id;
      if (!uid) return;
      await endMembership(uid);
      const u = await db.get<Profile>('profiles', { id: uid });
      await notify({ kind: 'membership_cancellation', to: u?.email, subject: 'Your BD Feast Plus membership has ended', body: 'Your BD Feast Plus membership has ended. You can rejoin any time from your account.' });
      return;
    }
    case 'account.updated': {
      const a = event.data.object as Stripe.Account;
      const r = await db.get<Restaurant>('restaurants', { stripe_account_id: a.id });
      if (!r) return;
      await db.update('restaurants', { id: r.id }, { stripe_details_submitted: a.details_submitted, stripe_charges_enabled: a.charges_enabled, stripe_payouts_enabled: a.payouts_enabled });
      if (a.charges_enabled && !r.stripe_charges_enabled) {
        await notify({ kind: 'restaurant_onboarding', to: r.email, subject: 'Your BD Feast payments are enabled', body: `${r.name} can now take paid orders on BD Feast. Payouts: ${a.payouts_enabled ? 'enabled' : 'pending Stripe verification'}.` });
      }
      return;
    }
    case 'charge.refunded': {
      const c = event.data.object as Stripe.Charge;
      const pi = idOf(c.payment_intent);
      if (pi) await reconcileRefund(pi, c.amount_refunded, c.id);
      return;
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const d = event.data.object as Stripe.Dispute;
      const pi = idOf(d.payment_intent);
      const order = pi ? await db.get<Order>('orders', { stripe_payment_intent_id: pi }) : null;
      const closed = event.type === 'charge.dispute.closed';
      if (order) {
        if (!closed) await db.update('orders', { id: order.id }, { payment_status: 'disputed' });
        else if (d.status === 'won') await db.update('orders', { id: order.id }, { payment_status: order.refunded_pence ? 'partially_refunded' : 'paid' });
      }
      await db.insert('transactions', { kind: 'dispute', order_id: order?.id ?? null, user_id: order?.customer_id ?? null, restaurant_id: order?.restaurant_id ?? null, amount_pence: -d.amount, status: closed ? 'closed' : 'open', stripe_ref: d.id, note: `Dispute ${closed ? `closed (${d.status})` : 'opened'}: ${d.reason}` });
      if (!closed && process.env.ADMIN_NOTIFY_EMAIL) await notify({ kind: 'dispute_opened', to: process.env.ADMIN_NOTIFY_EMAIL, subject: 'Payment dispute opened', body: `Dispute ${d.id} for ${fmt(d.amount)} (${d.reason}). Evidence is due in the Stripe dashboard.` });
      return;
    }
    default:
      return; // unhandled event types are acknowledged
  }
}

async function membershipFor(customerId: string | null) {
  if (!customerId) return null;
  return (await getDb()).get<Membership>('memberships', { stripe_customer_id: customerId });
}
