import { demoPaymentsEnabled, stripeConfigured } from '../config';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import type { Order } from '../types';

export class DisputeError extends Error {}

/**
 * OPTIONAL recovery of disputed funds from the restaurant by reversing its transfer.
 * Stripe debits dispute amounts and fees from FeastQuarter's balance (destination charges); recovering from the restaurant is
 * a CONTRACT decision. This is an explicit, admin-triggered action: nothing reverses a transfer automatically.
 * The reversal is capped at the restaurant's own allocation (FeastQuarter's commission stays with FeastQuarter).
 */
export async function recoverDisputeFromRestaurant(orderId: string, amountPence: number, adminId: string) {
  const db = await getDb();
  const o = await db.get<Order>('orders', { id: orderId });
  if (!o?.stripe_payment_intent_id) throw new DisputeError('Order has no Stripe payment');
  if (o.payment_status !== 'disputed') throw new DisputeError('Order is not currently disputed');
  if (!Number.isInteger(amountPence) || amountPence <= 0 || amountPence > o.restaurant_net_pence) throw new DisputeError(`Amount must be between 1p and the restaurant allocation (${o.restaurant_net_pence}p)`);
  if (demoPaymentsEnabled() || !stripeConfigured()) throw new DisputeError('Stripe is not configured');
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id, { expand: ['latest_charge'] });
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const transferId = charge && typeof charge.transfer === 'string' ? charge.transfer : null;
  if (!transferId) throw new DisputeError('No transfer found for this payment');
  const rev = await stripe.transfers.createReversal(transferId, { amount: amountPence, metadata: { order_id: o.id, reason: 'dispute_recovery', by: adminId } }, { idempotencyKey: `dispute-recovery:${o.id}:${amountPence}` });
  await db.insert('transactions', { kind: 'dispute', order_id: o.id, user_id: null, restaurant_id: o.restaurant_id, amount_pence: amountPence, status: 'closed', stripe_ref: rev.id, note: `Dispute funds recovered from restaurant by transfer reversal (admin ${adminId})` });
  return rev.id;
}
