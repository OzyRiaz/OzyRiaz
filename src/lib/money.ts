/** All money is integer pence (GBP). Never use floats for currency. */
export const fmt = (pence: number): string =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

/** Basis points → rounded pence. 800 bps = 8%. Rounds half up. */
export const bps = (amountPence: number, rateBps: number): number => Math.round((amountPence * rateBps) / 10000);

/**
 * ILLUSTRATIVE standard card processing estimate (1.5% + 20p) used only for planning and tests.
 * Real fees are read from Stripe's balance transactions (see services/reconcile.ts).
 */
export const estimateProcessingFee = (totalPence: number): number => bps(totalPence, 150) + 20;

export const pctLabel = (rateBps: number): string => `${(rateBps / 100).toFixed(rateBps % 100 === 0 ? 0 : 1)}%`;

export const parsePounds = (v: string): number | null => {
  const n = Number(v.replace(/[£,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
