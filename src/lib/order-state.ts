import type { Fulfilment, OrderStatus } from './types';

/** Allowed transitions made by the restaurant (after payment is confirmed by webhook). */
export function nextRestaurantStatuses(status: OrderStatus, fulfilment: Fulfilment): OrderStatus[] {
  switch (status) {
    case 'awaiting_restaurant': return ['accepted', 'rejected'];
    case 'accepted': return ['preparing', 'rejected'];
    case 'preparing': return ['ready'];
    case 'ready': return fulfilment === 'delivery' ? ['out_for_delivery'] : ['completed'];
    case 'out_for_delivery': return ['completed'];
    default: return [];
  }
}

export const canTransition = (from: OrderStatus, to: OrderStatus, f: Fulfilment) =>
  nextRestaurantStatuses(from, f).includes(to);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  payment_failed: 'Payment failed',
  awaiting_restaurant: 'Waiting for restaurant',
  accepted: 'Order accepted',
  preparing: 'Being prepared',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  rejected: 'Declined by restaurant',
  cancelled: 'Cancelled',
};

/** Customer/restaurant-facing label: completed means Delivered (delivery) or Collected (collection). */
export const labelFor = (s: OrderStatus, f: Fulfilment): string =>
  s === 'completed' ? (f === 'delivery' ? 'Delivered' : 'Collected') : s === 'ready' && f === 'collection' ? 'Ready for collection' : STATUS_LABEL[s];

export const customerSteps = (f: Fulfilment): OrderStatus[] =>
  f === 'delivery'
    ? ['awaiting_restaurant', 'accepted', 'preparing', 'out_for_delivery', 'completed']
    : ['awaiting_restaurant', 'accepted', 'preparing', 'ready', 'completed'];

/** Statuses that count as live/active for the restaurant board. */
export const ACTIVE: OrderStatus[] = ['awaiting_restaurant', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
