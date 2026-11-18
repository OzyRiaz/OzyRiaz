import type { Config } from '@netlify/functions';

// Runs daily at 07:00 UTC and asks the app to compute + email the admin summary.
// Requires env: URL (set by Netlify) and CRON_SECRET (must match the app's CRON_SECRET).
export default async () => {
  const base = process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base || !process.env.CRON_SECRET) { console.error('daily-summary: URL or CRON_SECRET missing'); return; }
  const res = await fetch(`${base}/api/cron/daily-summary`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log('daily-summary', res.status);
};

export const config: Config = { schedule: '0 7 * * *' };
