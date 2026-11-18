import type { Metadata } from 'next';
import { Badge, Card } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import type { Transaction } from '@/lib/types';
export const metadata: Metadata = { title: 'Finance — Admin' };
export const dynamic = 'force-dynamic';

function Table({ title, rows, empty }: { title: string; rows: Transaction[]; empty: string }) {
  return (
    <section><h3 className="mb-2 font-display text-xl font-semibold text-navy">{title}</h3>
      <Card className="overflow-x-auto">{rows.length === 0 ? <p className="p-5 text-sm text-muted">{empty}</p> : (
        <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">{title}</caption><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Date</th><th>Kind</th><th>Status</th><th className="text-right">Amount</th><th className="p-3">Reference / note</th></tr></thead>
          <tbody className="divide-y divide-line">{rows.map((t) => <tr key={t.id}><td className="p-3">{new Date(t.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{t.kind.replace('_', ' ')}</td><td><Badge tone={t.status === 'succeeded' || t.status === 'closed' ? 'green' : t.status === 'failed' ? 'red' : 'gold'}>{t.status}</Badge></td><td className="text-right font-medium">{fmt(t.amount_pence)}</td><td className="p-3 text-xs text-muted">{t.stripe_ref} {t.note}</td></tr>)}</tbody></table>)}</Card></section>
  );
}
export default async function Finance() {
  const tx = await (await getDb()).select<Transaction>('transactions', {}, { order: ['created_at', 'desc'], limit: 300 });
  return (
    <div className="space-y-7"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-navy">Finance</h2><a href="/api/admin/export/transactions" className="text-sm font-semibold text-navy underline">Export all transactions CSV</a></div>
      <Table title="Failed payments" rows={tx.filter((t) => t.kind === 'payment_failed')} empty="No failed payments." />
      <Table title="Disputes" rows={tx.filter((t) => t.kind === 'dispute')} empty="No disputes. Respond to disputes in the Stripe dashboard before the evidence deadline." />
      <Table title="Refunds" rows={tx.filter((t) => t.kind === 'refund')} empty="No refunds." />
      <Table title="Recent transactions" rows={tx.slice(0, 50)} empty="No transactions yet." />
    </div>
  );
}
