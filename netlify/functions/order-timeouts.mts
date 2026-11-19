import type { Config } from '@netlify/functions';

// Every 5 minutes: remind restaurants about unanswered paid orders and auto-decline + refund the expired ones.
export default async () => {
  const base = process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base || !process.env.CRON_SECRET) { console.error('order-timeouts: URL or CRON_SECRET missing'); return; }
  const res = await fetch(`${base}/api/cron/order-timeouts`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log('order-timeouts', res.status, await res.text());
};
export const config: Config = { schedule: '*/5 * * * *' };
