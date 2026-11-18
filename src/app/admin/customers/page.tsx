import type { Metadata } from 'next';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { Membership, Order, Profile } from '@/lib/types';
import { suspendUserAction } from '../actions';
export const metadata: Metadata = { title: 'Customers — Admin' };
export const dynamic = 'force-dynamic';

export default async function Customers() {
  const s = await requireRole('admin');
  const db = await getDb();
  const [users, orders, ms] = await Promise.all([db.select<Profile>('profiles', {}, { order: ['created_at', 'desc'] }), db.select<Order>('orders'), db.select<Membership>('memberships')]);
  return (
    <div className="space-y-3"><h2 className="font-display text-2xl font-semibold text-navy">Accounts</h2>
      <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">All accounts</caption>
        <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Orders</th><th>Member</th><th className="p-3 text-right">Action</th></tr></thead>
        <tbody className="divide-y divide-line">{users.map((u) => <tr key={u.id}><td className="p-3 font-semibold text-navy">{u.full_name}{u.suspended && <Badge tone="red" className="ml-2">Suspended</Badge>}{u.deleted_at && <Badge tone="grey" className="ml-2">Deleted</Badge>}</td><td>{u.email}</td><td className="capitalize">{u.role}</td><td>{orders.filter((o) => o.customer_id === u.id).length}</td><td>{ms.find((m) => m.user_id === u.id)?.status === 'active' ? '✓' : '—'}</td>
          <td className="p-3 text-right">{u.role !== 'admin' && u.id !== s.userId && !u.deleted_at && <form action={suspendUserAction}><input type="hidden" name="id" value={u.id} /><button className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${u.suspended ? 'bg-ok text-white' : 'border border-red-200 text-danger'}`}>{u.suspended ? 'Reinstate' : 'Suspend'}</button></form>}</td></tr>)}</tbody></table></Card></div>
  );
}
