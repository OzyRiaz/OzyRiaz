import type { Metadata } from 'next';
import { Badge, Card, Notice } from '@/components/ui';
import { emailConfigured, isDemo, stripeConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import type { Notification, SupportTicket } from '@/lib/types';
export const metadata: Metadata = { title: 'Reports — Admin' };
export const dynamic = 'force-dynamic';

const EXPORTS: [string, string][] = [['orders', 'Orders'], ['transactions', 'All transactions'], ['refunds', 'Refunds'], ['restaurants', 'Restaurants'], ['customers', 'Customers']];
export default async function Reports() {
  const db = await getDb();
  const [notes, tickets] = await Promise.all([db.select<Notification>('notifications', {}, { order: ['created_at', 'desc'], limit: 30 }), db.select<SupportTicket>('support_tickets', {}, { order: ['created_at', 'desc'], limit: 20 })]);
  const row = (l: string, ok: boolean, t = 'Configured', f = 'Not configured') => <li className="flex justify-between py-2 text-sm"><span>{l}</span><Badge tone={ok ? 'green' : 'gold'}>{ok ? t : f}</Badge></li>;
  return (
    <div className="space-y-6">
      <Card className="p-6"><h2 className="font-display text-2xl font-semibold text-navy">Exports</h2><p className="mt-1 text-sm text-muted">CSV files. Cells starting with = + - @ are neutralised against spreadsheet formula injection.</p><div className="mt-3 flex flex-wrap gap-2">{EXPORTS.map(([k, l]) => <a key={k} href={`/api/admin/export/${k}`} className="rounded-xl border border-navy/25 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy-100">{l}.csv</a>)}</div></Card>
      <Card className="p-6"><h2 className="font-display text-xl font-semibold text-navy">Integration status</h2><ul className="mt-2 divide-y divide-line">{row('Mode', !isDemo, 'Live', 'Demo (in-memory data)')}{row('Stripe API keys', stripeConfigured())}{row('Stripe webhook secret', !!process.env.STRIPE_WEBHOOK_SECRET)}{row('Email provider (Resend)', emailConfigured())}{row('Daily summary recipient', !!process.env.ADMIN_NOTIFY_EMAIL)}{row('Cron secret', (process.env.CRON_SECRET ?? '').length >= 16)}</ul>
        <div className="mt-3"><Notice tone="navy">Notifications below are only <em>delivered</em> when status is “sent”. “Skipped” means no email provider is configured and nothing left the server.</Notice></div></Card>
      <Card className="overflow-x-auto"><h2 className="p-6 pb-0 font-display text-xl font-semibold text-navy">Notification outbox</h2>
        <table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">When</th><th>Kind</th><th>To</th><th>Subject</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-line">{notes.map((n) => <tr key={n.id}><td className="p-3 text-xs">{new Date(n.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{n.kind}</td><td className="text-xs">{n.to_email}</td><td>{n.subject}</td><td className="p-3"><Badge tone={n.status === 'sent' ? 'green' : n.status === 'failed' ? 'red' : 'grey'}>{n.status}</Badge></td></tr>)}</tbody></table>
        {notes.length === 0 && <p className="p-6 text-sm text-muted">Nothing yet.</p>}</Card>
      <Card className="p-6"><h2 className="font-display text-xl font-semibold text-navy">Support messages</h2><ul className="mt-2 divide-y divide-line text-sm">{tickets.map((t) => <li key={t.id} className="py-3"><strong className="text-navy">{t.subject}</strong> <span className="text-muted">— {t.email}</span><p className="mt-1 whitespace-pre-wrap text-muted">{t.message}</p></li>)}{tickets.length === 0 && <li className="py-2 text-muted">No messages.</li>}</ul></Card>
    </div>
  );
}
