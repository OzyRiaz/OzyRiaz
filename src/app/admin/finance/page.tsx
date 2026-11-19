import type { Metadata } from 'next';
import { Badge, Card } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import type { Transaction } from '@/lib/types';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Field, Input, Select, Notice } from '@/components/ui';
import { addExpenseAction, reconcileFeesAction, recoverDisputeAction } from '../actions';
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
  const db = await getDb();
  const tx = await db.select<Transaction>('transactions', {}, { order: ['created_at', 'desc'], limit: 300 });
  const expenses = await db.select<{ id: string; kind: string; amount_pence: number; incurred_on: string; note: string }>('platform_expenses', {}, { order: ['incurred_on', 'desc'], limit: 50 });
  return (
    <div className="space-y-7"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-navy">Finance</h2><a href="/api/admin/export/transactions" className="text-sm font-semibold text-navy underline">Export all transactions CSV</a></div>
      <Card className="p-5"><h3 className="font-display text-xl font-semibold text-navy">Stripe costs borne by FeastQuarter</h3>
        <div className="mt-2"><Notice tone="navy">Per-charge processing fees are read automatically from Stripe. Other Stripe costs (Connect active-account fees, payout fees, etc.) are billed separately on Stripe invoices — enter them here so net contribution is not overstated.</Notice></div>
        <form action={reconcileFeesAction} className="mt-3"><button className="rounded-xl border border-navy/25 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy-100">Reconcile actual Stripe fees now</button></form>
        <ul className="mt-3 divide-y divide-line text-sm">{expenses.length === 0 && <li className="py-2 text-muted">No other costs recorded.</li>}{expenses.map((e) => <li key={e.id} className="flex justify-between py-2"><span>{new Date(e.incurred_on).toLocaleDateString('en-GB')} · {e.kind.replace(/_/g, ' ')} <span className="text-muted">{e.note}</span></span><span className="font-medium">{fmt(e.amount_pence)}</span></li>)}</ul>
        <ActionForm action={addExpenseAction} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-4">
          <Field label="Type"><Select name="kind"><option value="stripe_connect_account">Connect account fee</option><option value="stripe_payout">Payout fee</option><option value="stripe_other">Other Stripe</option><option value="other">Other</option></Select></Field>
          <Field label="Amount (£)"><Input name="amount" inputMode="decimal" required /></Field><Field label="Date"><Input name="incurred_on" type="date" required /></Field><Field label="Note"><Input name="note" maxLength={200} /></Field>
          <div className="sm:col-span-4"><Submit variant="outline">Record cost</Submit></div></ActionForm></Card>
      <Table title="Failed payments" rows={tx.filter((t) => t.kind === 'payment_failed')} empty="No failed payments." />
      <Table title="Disputes" rows={tx.filter((t) => t.kind === 'dispute')} empty="No disputes. Respond to disputes in the Stripe dashboard before the evidence deadline." />
      {tx.some((t) => t.kind === 'dispute' && t.status === 'open' && t.order_id) && (
        <Card className="p-5"><h3 className="font-display text-lg font-semibold text-navy">Recover a disputed amount from the restaurant (optional)</h3>
          <p className="mt-1 text-sm text-muted">Stripe debits disputed amounts and fees from FeastQuarter. Recovering from the restaurant (transfer reversal) depends on your signed agreement — it never happens automatically. Capped at the restaurant&apos;s allocation.</p>
          {tx.filter((t) => t.kind === 'dispute' && t.status === 'open' && t.order_id).map((t) => <ActionForm key={t.id} action={recoverDisputeAction} className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="order" value={t.order_id!} /><span className="text-xs text-muted">{t.note}</span><Input name="amount" inputMode="decimal" placeholder="£ to recover" required className="w-32" /><Submit size="sm" variant="danger">Reverse transfer</Submit></ActionForm>)}</Card>)}
      <Table title="Refunds" rows={tx.filter((t) => t.kind === 'refund')} empty="No refunds." />
      <Table title="Recent transactions" rows={tx.slice(0, 50)} empty="No transactions yet." />
    </div>
  );
}
