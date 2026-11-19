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
  if (!settings.feature_plus_enabled) return null; // FeastQuarter Plus is feature-flagged OFF at launch
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
  tip_pence: number;
  total_pence: number;
  commission_bps: number;
  commission_pence: number;
  commission_vat_pence: number;
  application_fee_pence: number;
  restaurant_net_pence: number;
}

/**
 * VAT on FeastQuarter's own fee. ZERO unless FeastQuarter is registered AND a mode is configured.
 * (This is plumbing for a future registration; it does not establish the legal VAT treatment.)
 *  - inclusive: the fee already contains VAT, so VAT is extracted from it and the fee is unchanged.
 *  - exclusive: VAT is added on top of the fee, so the restaurant allocation falls by the VAT amount.
 */
export function commissionVat(feePence: number, s: Pick<PlatformSettings, 'platform_vat_registered' | 'commission_vat_mode' | 'vat_rate_bps'>): { vat: number; extra: number } {
  if (!s.platform_vat_registered || s.commission_vat_mode === 'none' || feePence <= 0) return { vat: 0, extra: 0 };
  if (s.commission_vat_mode === 'inclusive') return { vat: Math.round((feePence * s.vat_rate_bps) / (10000 + s.vat_rate_bps)), extra: 0 };
  const vat = bps(feePence, s.vat_rate_bps);
  return { vat, extra: vat };
}

/**
 * Money model (verified against Stripe destination-charge behaviour; documented in README):
 *  - Commission = commission_bps (flat, default 10%) of the FOOD subtotal only, for delivery AND collection.
 *    It INCLUDES standard card processing: FeastQuarter pays Stripe's fee out of its own balance.
 *  - Delivery fees and tips are NEVER commissionable. They go to the restaurant.
 *  - Restaurant-funded discounts reduce the commission base (commission is on food actually charged).
 *  - Platform-funded discounts come out of FeastQuarter's commission and can never exceed it
 *    (a Stripe application fee cannot be negative); any excess is not applied.
 *  - Customer total = food + delivery fee + tip - discounts.
 *  - Stripe application_fee_amount = commission - platform-funded discount (+ VAT if exclusive mode).
 *  - Restaurant allocation = total - application fee.
 * All values are integer pence computed server-side. The rate in force is stored on each order.
 */
export function computeTotals(args: {
  subtotal: number; deliveryFee: number; fulfilment: Fulfilment; settings: PlatformSettings; discount: DiscountCandidate | null; tip?: number;
}): Totals {
  const { subtotal, deliveryFee, fulfilment, settings, discount } = args;
  const rate = settings.commission_bps;
  const fee = fulfilment === 'delivery' ? deliveryFee : 0;
  const tip = Math.max(0, Math.trunc(args.tip ?? 0));
  let restaurantFunded = 0, platformFunded = 0;
  const wanted = discount ? Math.min(discount.amountPence, subtotal) : 0;
  if (discount && wanted > 0) {
    if (discount.fundedBy === 'restaurant') restaurantFunded = wanted;
    else platformFunded = Math.min(wanted, bps(subtotal, rate));
  }
  const commission = bps(subtotal - restaurantFunded, rate);
  platformFunded = Math.min(platformFunded, commission);
  const applied = restaurantFunded + platformFunded;
  const feeCollected = commission - platformFunded;
  const { vat, extra } = commissionVat(feeCollected, settings);
  const total = subtotal + fee + tip - applied;
  const application_fee_pence = feeCollected + extra;
  return {
    subtotal_pence: subtotal,
    delivery_fee_pence: fee,
    discount_pence: applied,
    discount_label: applied > 0 ? discount!.label : null,
    discount_funded_by_restaurant_pence: restaurantFunded,
    discount_funded_by_platform_pence: platformFunded,
    promo_code: applied > 0 ? discount!.promoCode ?? null : null,
    tip_pence: tip,
    total_pence: total,
    commission_bps: rate,
    commission_pence: commission,
    commission_vat_pence: vat,
    application_fee_pence,
    restaurant_net_pence: total - application_fee_pence,
  };
}
