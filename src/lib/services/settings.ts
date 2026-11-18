import { getDb } from '../db';
import { DEFAULT_SETTINGS } from '../demo-data';
import type { PlatformSettings } from '../types';

export async function getSettings(): Promise<PlatformSettings> {
  const db = await getDb();
  return (await db.get<PlatformSettings>('platform_settings', { id: 'main' })) ?? (DEFAULT_SETTINGS as PlatformSettings);
}
