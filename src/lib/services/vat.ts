import { getDb } from '../db';
import type { Membership, Order, Transaction } from '../types';
import { getSettings } from './settings';

export type VatLevel = 'ok' | 'watch' | 'urgent' | 'exceeded';
export interface VatStatus { registered: boolean; income_pence: number; threshold_pence: number; pct: number; level: VatLevel; headroom_pence: number; message: string }

/** FeastQuarter's own taxable income (excluding any VAT): commission actually kept (net of refunds) + membership payments. NOT customer food payments. */
export async function taxablePlatformIncome(from: Date, to = new Date()): Promise<number> {
  const db = await getDb();
  const inR = (iso: string | null) => !!iso && new Date(iso) >= from && new Date(iso) <= to;
  const orders = (await db.select<Order>('orders')).filter((o) => ['paid', 'partially_refunded', 'refunded', 'disputed'].includes(o.payment_status) && inR(o.paid_at));
  const fees = orders.reduce((s, o) => s + Math.round(((o.application_fee_pence - (o.commission_vat_pence ?? 0)) * (o.total_pence - o.refunded_pence)) / Math.max(o.total_pence, 1)), 0);
  const subs = (await db.select<Transaction>('transactions', { kind: 'membership_payment' })).filter((t) => inR(t.created_at)).reduce((s, t) => s + t.amount_pence, 0);
  return fees + subs;
}

/**
 * Monitors the rolling 12-month taxable turnover against the (configurable) UK VAT registration threshold.
 * Levels: watch ≥70%, urgent ≥90%, exceeded ≥100%. This is a monitoring aid, not tax advice: HMRC also applies a
 * forward-looking 30-day test and the threshold may change — confirm with an accountant.
 */
export async function vatStatus(now = new Date()): Promise<VatStatus> {
  const s = await getSettings();
  const from = new Date(now.getTime() - 365 * 864e5);
  const income = await taxablePlatformIncome(from, now);
  const pct = s.vat_threshold_pence > 0 ? income / s.vat_threshold_pence : 0;
  const level: VatLevel = pct >= 1 ? 'exceeded' : pct >= 0.9 ? 'urgent' : pct >= 0.7 ? 'watch' : 'ok';
  const msg = s.platform_vat_registered ? 'FeastQuarter is marked as VAT registered.' : {
    ok: 'Well below the VAT registration threshold.', watch: 'Approaching the VAT registration threshold — speak to your accountant.',
    urgent: 'Very close to the VAT registration threshold — take advice now.', exceeded: 'Rolling 12-month taxable income exceeds the configured threshold — you may be required to register. Take advice immediately.',
  }[level];
  return { registered: s.platform_vat_registered, income_pence: income, threshold_pence: s.vat_threshold_pence, pct, level, headroom_pence: Math.max(0, s.vat_threshold_pence - income), message: msg };
}
export type { Membership };
