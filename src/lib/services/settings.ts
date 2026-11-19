import { getDb } from '../db';
import type { Db } from '../db/types';
import { DEFAULT_SETTINGS } from '../demo-data';
import type { PlatformSettings } from '../types';

export async function getSettings(): Promise<PlatformSettings> {
  const db = await getDb();
  return { ...(DEFAULT_SETTINGS as unknown as PlatformSettings), ...((await db.get<PlatformSettings>('platform_settings', { id: 'main' })) ?? {}) };
}

export const plusEnabled = async () => (await getSettings()).feature_plus_enabled === true;

export class SettingsError extends Error {}

const AUDITED: (keyof PlatformSettings)[] = ['commission_bps', 'platform_vat_registered', 'vat_threshold_pence', 'vat_rate_bps', 'commission_vat_mode', 'feature_plus_enabled', 'membership_price_pence', 'member_discount_funding', 'member_discount_max_percent'];

/**
 * Admin-only settings change. Every changed audited field is written to settings_audit (who, old, new, why).
 * Commission changes apply to NEW orders only: each order stores the rate it was placed at.
 */
export async function applySettingsChange(adminId: string, patch: Partial<PlatformSettings>, reason: string, dbArg?: Db) {
  const db = dbArg ?? (await getDb());
  if (patch.commission_bps !== undefined && (!Number.isInteger(patch.commission_bps) || patch.commission_bps < 0 || patch.commission_bps > 3000))
    throw new SettingsError('Commission must be a whole number of basis points between 0 and 3000 (0–30%)');
  if (patch.vat_rate_bps !== undefined && (!Number.isInteger(patch.vat_rate_bps) || patch.vat_rate_bps < 0 || patch.vat_rate_bps > 3000)) throw new SettingsError('Invalid VAT rate');
  const current = (await db.get<PlatformSettings>('platform_settings', { id: 'main' })) ?? ({ ...DEFAULT_SETTINGS } as unknown as PlatformSettings);
  const changed = (Object.keys(patch) as (keyof PlatformSettings)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
  const audited = changed.filter((k) => AUDITED.includes(k));
  if (audited.length && reason.trim().length < 3) throw new SettingsError('Please give a reason for this change (it is recorded in the audit log)');
  for (const k of audited) {
    await db.insert('settings_audit', { changed_by: adminId, field: k, old_value: JSON.stringify(current[k] ?? null), new_value: JSON.stringify(patch[k]), reason: reason.trim().slice(0, 300) });
  }
  if (changed.length) {
    const exists = await db.get('platform_settings', { id: 'main' });
    if (exists) await db.update('platform_settings', { id: 'main' }, patch);
    else await db.insert('platform_settings', { ...DEFAULT_SETTINGS, ...patch });
  }
  return { changed };
}
