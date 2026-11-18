import { bps } from './money';
import type { Fulfilment, MemberOffer, MenuItem, OrderLine, PlatformSettings, Promotion } from './types';

export interface BasketLineInput { itemId: string; qty: number; optionChoiceIds: string[]; note?: string | null }

export class PricingError extends Error {}

/** Price one basket line from authoritative menu data. Client prices are never trusted. */
export function priceLine(item: MenuItem, input: BasketLineInput): OrderLine {
  if (!item.available) throw new PricingError(`${item.name} is currently unavailable`);
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 50) throw new PricingError('Invalid quantity');
  const chosen = new Set(input.optionChoiceIds);
  const options: OrderLine['options'] = [];
  let extras = 0;
  for (const g of item.option_groups) {
    const picked = g.choices.filter((c) => chosen.has(c.id));
    if (picked.length < g.min) throw new PricingError(`Choose ${g.min > 1 ? `at least ${g.min}` : 'an option'} for "${g.name}" on ${item.name}`);
    if (picked.length > g.max) throw new PricingError(`Too many choices for "${g.name}" on ${item.name}`);
    for (const c of picked) { options.push({ group: g.name, choice: c.name, price_pence: c.price_pence }); extras += c.price_pence; }
  }
  const known = new Set(item.option_groups.flatMap((g) => g.choices.map((c) => c.id)));
  for (const id of chosen) if (!known.has(id)) throw new PricingError('Unknown option selected');
  return {
    item_id: item.id, name: item.name, qty: input.qty, unit_price_pence: item.price_pence + extras,
    options, note: input.note?.slice(0, 200) ?? null, allergens: item.allergens,
  };
}

export interface DiscountCandidate { label: string; amountPence: number; fundedBy: 'restaurant' | 'platform'; promoCode?: string }

export function memberDiscount(subtotal: number, offer: MemberOffer, settings: PlatformSettings): DiscountCandidate | null {
  if (!offer.enabled || offer.percent <= 0 || subtotal < offer.min_spend_pence) return null;
  const pct = Math.min(offer.percent, settings.member_discount_max_percent);
  const amountPence = Math.round((subtotal * pct) / 100);
  if (amountPence <= 0) return null;
  return { label: `FeastQuarter Plus member offer (${pct}% off)`, amountPence, fundedBy: settings.member_discount_funding };
}

export function promoDiscount(subtotal: number, promo: Promotion, restaurantId: string, now = new Date()): DiscountCandidate | { error: string } {
  if (!promo.active) return { error: 'This code is no longer active' };
  if (promo.starts_at && new Date(promo.starts_at) > now) return { error: 'This code is not valid yet' };
  if (promo.ends_at && new Date(promo.ends_at) < now) return { error: 'This code has expired' };
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return { error: 'This code has been fully redeemed' };
  if (promo.restaurant_id && promo.restaurant_id !== restaurantId) return { error: 'This code is not valid for this restaurant' };
  if (subtotal < promo.min_spend_pence) return { error: `Spend a minimum of £${(promo.min_spend_pence / 100).toFixed(2)} to use this code` };
  const raw = promo.kind === 'percent' ? Math.round((subtotal * promo.value) / 100) : promo.value;
  const amountPence = Math.min(raw, subtotal);
  return { label: `Code ${promo.code}`, amountPence, fundedBy: promo.funded_by, promoCode: promo.code };
}

/** One discount per order: the one that saves the customer most. Discounts never stack. */
export function chooseDiscount(cands: DiscountCandidate[]): DiscountCandidate | null {
  return cands.filter((c) => c.amountPence > 0).sort((a, b) => b.amountPence - a.amountPence)[0] ?? null;
}

export interface Totals {
  subtotal_pence: number;
  delivery_fee_pence: number;
  discount_pence: number;
  discount_label: string | null;
  discount_funded_by_restaurant_pence: number;
  discount_funded_by_platform_pence: number;
  promo_code: string | null;
  total_pence: number;
  commission_bps: number;
  commission_pence: number;
  application_fee_pence: number;
  restaurant_net_pence: number;
}

/**
 * Commission model (documented in README):
 *  - Commission applies to FOOD only (not the delivery fee), at 8% delivery / 5% collection (admin-configurable).
 *  - Restaurant-funded discounts reduce the commission base (restaurant earns, and pays commission on, what it actually charges for food).
 *  - Platform-funded discounts are paid out of FeastQuarter's commission, so they can never exceed it
 *    (Stripe application fees cannot be negative). Excess is not applied.
 *  - Customer total = subtotal + delivery - discounts. Stripe application_fee = commission - platform-funded discount.
 */
export function computeTotals(args: {
  subtotal: number; deliveryFee: number; fulfilment: Fulfilment; settings: PlatformSettings; discount: DiscountCandidate | null;
}): Totals {
  const { subtotal, deliveryFee, fulfilment, settings, discount } = args;
  const rate = fulfilment === 'delivery' ? settings.commission_delivery_bps : settings.commission_collection_bps;
  const fee = fulfilment === 'delivery' ? deliveryFee : 0;
  let restaurantFunded = 0, platformFunded = 0;
  const wanted = discount ? Math.min(discount.amountPence, subtotal) : 0;
  if (discount && wanted > 0) {
    if (discount.fundedBy === 'restaurant') restaurantFunded = wanted;
    else {
      const commission = bps(subtotal, rate);
      platformFunded = Math.min(wanted, commission);
    }
  }
  const commissionBase = subtotal - restaurantFunded;
  const commission = bps(commissionBase, rate);
  platformFunded = Math.min(platformFunded, commission);
  const applied = restaurantFunded + platformFunded;
  const total = subtotal + fee - applied;
  const application_fee_pence = commission - platformFunded;
  return {
    subtotal_pence: subtotal,
    delivery_fee_pence: fee,
    discount_pence: applied,
    discount_label: applied > 0 ? discount!.label : null,
    discount_funded_by_restaurant_pence: restaurantFunded,
    discount_funded_by_platform_pence: platformFunded,
    promo_code: applied > 0 ? discount!.promoCode ?? null : null,
    total_pence: total,
    commission_bps: rate,
    commission_pence: commission,
    application_fee_pence,
    restaurant_net_pence: total - application_fee_pence,
  };
}
