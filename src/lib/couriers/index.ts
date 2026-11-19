import { gophr, uberDirect } from './providers';
import { CourierDisabledError, type CourierProvider } from './types';

export * from './types';
const REGISTRY: CourierProvider[] = [gophr, uberDirect];

export const listCouriers = () => REGISTRY.map((p) => ({ id: p.id, name: p.name, enabled: p.isEnabled(), reason: p.isEnabled() ? '' : p.disabledReason() }));
export function getCourier(id: string): CourierProvider {
  const p = REGISTRY.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown courier provider "${id}"`);
  if (!p.isEnabled()) throw new CourierDisabledError(id);
  return p;
}

/**
 * What the customer pays for a courier delivery. The customer pays the quoted provider cost. FeastQuarter only subsidises
 * if an admin has expressly authorised it (COURIER_SUBSIDY_AUTHORISED=true AND a positive subsidy), capped at the quote.
 */
export function courierPricing(quoteCostPence: number, subsidyPence = 0, authorised = process.env.COURIER_SUBSIDY_AUTHORISED === 'true') {
  const subsidy = authorised ? Math.min(Math.max(0, Math.trunc(subsidyPence)), quoteCostPence) : 0;
  return { customer_fee_pence: quoteCostPence - subsidy, subsidy_pence: subsidy, provider_cost_pence: quoteCostPence };
}
