import type { Metadata } from 'next';
import { Card, Notice } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { orderingUrl, qrSvg, referralUrl } from '@/lib/services/share';
import type { Order, Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Promote — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Promote() {
  const s = await requireSession('/dashboard');
  const db = await getDb();
  const r = (await db.get<Restaurant>('restaurants', { id: s.restaurantIds[0] }))!;
  const orders = (await db.select<Order>('orders', { restaurant_id: r.id })).filter((o) => o.payment_status !== 'unpaid');
  const bySrc = new Map<string, number>(); orders.forEach((o) => { const k = o.source ?? 'direct / search'; bySrc.set(k, (bySrc.get(k) ?? 0) + 1); });
  const url = orderingUrl(r, 'qr');
  const svg = await qrSvg(url);
  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <Card className="p-6"><h2 className="font-display text-2xl font-semibold text-navy">Your ordering link & QR code</h2>
        <p className="mt-1 text-sm text-muted">Print the QR code for your window, menus and bags. Customers scan it and land on your page.</p>
        <div className="mx-auto mt-4 w-56 rounded-xl border border-line bg-white p-2" role="img" aria-label="QR code for your FeastQuarter page" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 break-all rounded-lg bg-navy-100 px-3 py-2 text-xs text-navy">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={url} label="Copy link" /><a download={`feastquarter-${r.slug}-qr.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} className="rounded-lg border border-navy/25 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy-100">Download QR (SVG)</a></div>
        {r.status !== 'approved' && <div className="mt-3"><Notice tone="gold">Your page isn&apos;t live yet. The link works once your application is approved.</Notice></div>}</Card>
      <div className="space-y-5">
        <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Where your orders come from</h3>
          <ul className="mt-2 divide-y divide-line text-sm">{bySrc.size === 0 && <li className="py-2 text-muted">No paid orders yet.</li>}{[...bySrc].map(([k, n]) => <li key={k} className="flex justify-between py-2"><span>{k}</span><strong className="text-navy">{n}</strong></li>)}</ul>
          <p className="mt-2 text-xs text-muted">Add <code>?src=flyer</code> (or any word) to your link to track a campaign.</p></Card>
        <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Refer another restaurant</h3>
          <p className="mt-1 text-sm text-muted">Share this link with another takeaway owner. Their application is attributed to you. We never contact anyone on your behalf.</p>
          <p className="mt-2 break-all rounded-lg bg-navy-100 px-3 py-2 text-xs text-navy">{referralUrl(r)}</p><div className="mt-3"><CopyButton text={referralUrl(r)} label="Copy referral link" /></div></Card>
      </div>
    </div>
  );
}
