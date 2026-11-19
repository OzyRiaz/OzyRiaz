import { getDb } from '../db';
import { chooseDiscount, computeTotals, memberDiscount, priceLine, promoDiscount, PricingError, type BasketLineInput, type DiscountCandidate, type Totals } from '../pricing';
import { parsePostcode, postcodeInServedCity } from '../postcode';
import { isOpenNow } from '../hours';
import type { DeliveryArea, Fulfilment, MenuItem, OrderLine, Promotion, Restaurant } from '../types';
import { isDemo } from '../config';
import { availabilityFor } from './restaurants';
import { getSettings } from './settings';
import { getActiveMembership } from './membership';

export interface QuoteInput {
  restaurantId: string;
  lines: BasketLineInput[];
  fulfilment: Fulfilment;
  postcode?: string | null; // required for delivery
  promoCode?: string | null;
  tipPence?: number | null; // customer tip: never commissionable
  userId?: string | null;
}
export interface Quote extends Totals {
  restaurant: Restaurant;
  lines: OrderLine[];
  isMember: boolean;
  promoError?: string;
  memberHint?: string;
  open: boolean;
}

export class QuoteError extends Error {}

/** Single source of truth for basket pricing. Used by the basket UI, checkout and tests. */
export async function buildQuote(input: QuoteInput): Promise<Quote> {
  const db = await getDb();
  const restaurant = await db.get<Restaurant>('restaurants', { id: input.restaurantId });
  if (!restaurant || restaurant.status !== 'approved') throw new QuoteError('This restaurant is not currently taking orders');
  if (restaurant.is_demo && !isDemo) throw new QuoteError('This is a demonstration restaurant and cannot take real orders');
  if (restaurant.accepting_orders === false) throw new QuoteError(`${restaurant.name} is offline and not taking new orders right now`);
  if (!input.lines.length) throw new QuoteError('Your basket is empty');
  const items = await db.select<MenuItem>('menu_items', { restaurant_id: restaurant.id });
  const byId = new Map(items.map((i) => [i.id, i]));
  let lines: OrderLine[];
  try {
    lines = input.lines.map((l) => {
      const it = byId.get(l.itemId);
      if (!it) throw new PricingError('An item in your basket is no longer on the menu');
      return priceLine(it, l);
    });
  } catch (e) { throw new QuoteError((e as Error).message); }
  const subtotal = lines.reduce((s, l) => s + l.unit_price_pence * l.qty, 0);

  let deliveryFee = 0;
  let minOrder = restaurant.min_order_pence;
  if (input.fulfilment === 'delivery') {
    if (!restaurant.delivery_enabled) throw new QuoteError('This restaurant does not offer delivery');
    const pc = parsePostcode(input.postcode ?? '');
    if (!pc) throw new QuoteError('Enter a valid UK postcode for delivery');
    if (!postcodeInServedCity(pc)) throw new QuoteError('FeastQuarter is not available in your area yet');
    const areas = await db.select<DeliveryArea>('delivery_areas', { restaurant_id: restaurant.id });
    const { area } = availabilityFor(restaurant, areas, pc.normalised);
    if (!area) throw new QuoteError('This restaurant does not deliver to your postcode. Try collection instead.');
    deliveryFee = area.fee_pence;
    minOrder = Math.max(minOrder, area.min_order_pence ?? 0);
  } else if (!restaurant.collection_enabled) throw new QuoteError('This restaurant does not offer collection');
  if (subtotal < minOrder) throw new QuoteError(`Minimum order is £${(minOrder / 100).toFixed(2)} (food total before fees)`);

  const settings = await getSettings();
  const membership = input.userId ? await getActiveMembership(input.userId) : null;
  const cands: DiscountCandidate[] = [];
  let memberHint: string | undefined;
  const md = memberDiscount(subtotal, restaurant.member_offer, settings);
  if (md) {
    if (membership) cands.push(md);
    else memberHint = `FeastQuarter Plus members save ${fmtPct(restaurant.member_offer.percent, settings.member_discount_max_percent)} at this restaurant`;
  }
  let promoError: string | undefined;
  if (input.promoCode?.trim()) {
    const promo = await db.get<Promotion>('promotions', { code: input.promoCode.trim().toUpperCase() });
    if (!promo) promoError = 'That code is not recognised';
    else {
      const r = promoDiscount(subtotal, promo, restaurant.id);
      if ('error' in r) promoError = r.error; else cands.push(r);
    }
  }
  const tip = input.tipPence ?? 0;
  if (!Number.isInteger(tip) || tip < 0 || tip > 10000) throw new QuoteError('Tip must be between £0 and £100');
  const totals = computeTotals({ subtotal, deliveryFee, fulfilment: input.fulfilment, settings, discount: chooseDiscount(cands), tip });
  return { ...totals, restaurant, lines, isMember: !!membership, promoError, memberHint, open: isOpenNow(restaurant.opening_hours) };
}

const fmtPct = (p: number, max: number) => `${Math.min(p, max)}%`;
