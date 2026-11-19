import { demoPaymentsEnabled, stripeConfigured } from '../config';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import type { Order } from '../types';

interface FeeDetail { type: string; amount: number }
interface BalanceTxn { fee: number; currency: string; fee_details?: FeeDetail[] }

/**
 * Standard card-processing cost from a Stripe balance transaction.
 * We sum fee_details of type "stripe_fee". Any other fee types are returned separately so they are never hidden.
 * Destination charges debit this from FeastQuarter's own balance (Stripe docs), which is why the 10% commission "includes" it.
 */
export function extractProcessingFee(bt: BalanceTxn): { processing: number; other: number; otherTypes: string[] } {
  if (bt.currency !== 'gbp') throw new Error(`Unexpected balance transaction currency ${bt.currency}`);
  const details = bt.fee_details ?? [];
  if (!details.length) return { processing: bt.fee, other: 0, otherTypes: [] };
  const processing = details.filter((d) => d.type === 'stripe_fee').reduce((s, d) => s + d.amount, 0);
  const others = details.filter((d) => d.type !== 'stripe_fee');
  return { processing, other: others.reduce((s, d) => s + d.amount, 0), otherTypes: [...new Set(others.map((d) => d.type))] };
}

/** Reads the ACTUAL fee from Stripe for one paid order. Idempotent. Never throws for "not ready yet". */
export async function recordStripeFee(orderId: string): Promise<{ status: 'recorded' | 'already' | 'pending' | 'skipped'; fee?: number }> {
  const db = await getDb();
  const order = await db.get<Order>('orders', { id: orderId });
  if (!order || !order.stripe_payment_intent_id || order.payment_status === 'unpaid' || order.payment_status === 'failed') return { status: 'skipped' };
  if (order.stripe_fee_pence !== null && order.stripe_fee_pence !== undefined) return { status: 'already', fee: order.stripe_fee_pence };
  if (order.stripe_payment_intent_id.startsWith('pi_demo') || demoPaymentsEnabled() || !stripeConfigured()) return { status: 'skipped' };
  const pi = await getStripe().paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ['latest_charge.balance_transaction'] });
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const bt = charge && typeof charge.balance_transaction === 'object' ? (charge.balance_transaction as unknown as BalanceTxn) : null;
  if (!bt) return { status: 'pending' }; // balance transaction not available yet; the scheduled reconcile retries
  const { processing, other, otherTypes } = extractProcessingFee(bt);
  const existing = await db.get('transactions', { order_id: order.id, kind: 'stripe_fee' });
  await db.update('orders', { id: order.id }, { stripe_fee_pence: processing });
  if (!existing) await db.insert('transactions', { kind: 'stripe_fee', order_id: order.id, user_id: null, restaurant_id: order.restaurant_id, amount_pence: -processing, status: 'succeeded', stripe_ref: order.stripe_payment_intent_id, note: `Actual Stripe processing fee${other ? `; other fee types NOT included: ${otherTypes.join(', ')} (${other}p)` : ''}` });
  return { status: 'recorded', fee: processing };
}

export async function recordStripeFeeForPaymentIntent(paymentIntentId: string) {
  const o = await (await getDb()).get<Order>('orders', { stripe_payment_intent_id: paymentIntentId });
  return o ? recordStripeFee(o.id) : { status: 'skipped' as const };
}

/** Back-fills every paid order that still has no actual fee. Called by the daily cron and the admin "Reconcile now" button. */
export async function reconcileStripeFees(limit = 100) {
  const db = await getDb();
  const todo = (await db.select<Order>('orders')).filter((o) => ['paid', 'partially_refunded', 'refunded', 'disputed'].includes(o.payment_status) && (o.stripe_fee_pence === null || o.stripe_fee_pence === undefined)).slice(0, limit);
  const out = { checked: todo.length, recorded: 0, pending: 0, skipped: 0, failed: 0 };
  for (const o of todo) {
    try { const r = await recordStripeFee(o.id); if (r.status === 'recorded') out.recorded++; else if (r.status === 'pending') out.pending++; else out.skipped++; } catch { out.failed++; }
  }
  return out;
}
