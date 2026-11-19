import type { Order } from './types';

/**
 * Pure refund allocation. Splits a refund into the four things the customer paid for and works out who bears it.
 *
 *  - FeastQuarter's 99p service fee is never held by the restaurant, so refunding it never touches the restaurant.
 *  - Commission is only ever charged on food, so a food refund hands back a matching share of commission.
 *  - Restaurant share = what must be reversed from the restaurant's transfer = amount − service fee − commission returned.
 *  - Stripe does NOT return its own processing fee on refunds; FeastQuarter absorbs it (recorded elsewhere).
 */
export interface RefundBreakdown {
  amount_pence: number;
  food_pence: number;
  delivery_pence: number;
  tip_pence: number;
  service_fee_pence: number;
  commission_returned_pence: number;
  restaurant_share_pence: number; // reversed from the restaurant's connected account
  platform_share_pence: number;   // borne by FeastQuarter (service fee + commission handed back)
}

type OrderForRefund = Pick<Order, 'subtotal_pence' | 'discount_pence' | 'delivery_fee_pence' | 'tip_pence' | 'service_fee_pence' | 'total_pence' | 'application_fee_pence' | 'refunded_pence' | 'refunded_food_pence' | 'refunded_delivery_pence' | 'refunded_tip_pence' | 'refunded_service_fee_pence' | 'commission_refunded_pence'>;

const n = (v: number | undefined | null) => v ?? 0;

/** The commission FeastQuarter actually collected on this order (application fee less the service fee). */
export const effectiveCommission = (o: Pick<Order, 'application_fee_pence' | 'service_fee_pence'>) => Math.max(0, o.application_fee_pence - n(o.service_fee_pence));

export function remainingComponents(o: OrderForRefund) {
  const foodPaid = Math.max(0, o.subtotal_pence - n(o.discount_pence)); // discounts come off the food
  return {
    food: Math.max(0, foodPaid - n(o.refunded_food_pence)),
    delivery: Math.max(0, o.delivery_fee_pence - n(o.refunded_delivery_pence)),
    tip: Math.max(0, n(o.tip_pence) - n(o.refunded_tip_pence)),
    service: Math.max(0, n(o.service_fee_pence) - n(o.refunded_service_fee_pence)),
    foodPaid,
  };
}

export interface AllocateOpts {
  /** 'all' = every remaining component. 'all_but_service_fee' = everything except the 99p (customer-requested cancellation policy). 'amount' = a specific sum. */
  mode: 'all' | 'all_but_service_fee' | 'amount';
  amountPence?: number;
  /** For mode 'amount': whether the service fee may be consumed once food, delivery and tip are exhausted (default false = service fee only via an explicit full refund). */
  includeServiceFee?: boolean;
}

export function allocateRefund(o: OrderForRefund, opts: AllocateOpts): RefundBreakdown {
  const rem = remainingComponents(o);
  let food = 0, delivery = 0, tip = 0, service = 0;
  if (opts.mode === 'all') { food = rem.food; delivery = rem.delivery; tip = rem.tip; service = rem.service; }
  else if (opts.mode === 'all_but_service_fee') { food = rem.food; delivery = rem.delivery; tip = rem.tip; }
  else {
    let left = Math.max(0, Math.trunc(opts.amountPence ?? 0));
    const take = (avail: number) => { const t = Math.min(left, avail); left -= t; return t; };
    food = take(rem.food); delivery = take(rem.delivery); tip = take(rem.tip);
    if (opts.includeServiceFee) service = take(rem.service);
    if (left > 0) throw new RangeError('Refund is larger than the refundable remainder');
  }
  // Commission handed back is proportional to the food refunded; the final food refund returns whatever is left (no rounding drift).
  const commissionTotal = effectiveCommission(o);
  const commissionLeft = Math.max(0, commissionTotal - n(o.commission_refunded_pence));
  let commissionReturned = 0;
  if (food > 0 && rem.foodPaid > 0) {
    commissionReturned = food >= rem.food ? commissionLeft : Math.min(commissionLeft, Math.round((commissionTotal * food) / rem.foodPaid));
  }
  const amount = food + delivery + tip + service;
  const platform = service + commissionReturned;
  return { amount_pence: amount, food_pence: food, delivery_pence: delivery, tip_pence: tip, service_fee_pence: service, commission_returned_pence: commissionReturned, restaurant_share_pence: amount - platform, platform_share_pence: platform };
}
