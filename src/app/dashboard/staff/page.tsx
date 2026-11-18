import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Field, Input, Select } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { Profile, RestaurantStaff } from '@/lib/types';
import { addStaffAction, removeStaffAction } from '../actions';
export const metadata: Metadata = { title: 'Staff — Dashboard' };

export default async function Staff() {
  const s = await requireSession('/dashboard');
  const db = await getDb();
  const staff = await db.select<RestaurantStaff>('restaurant_staff', { restaurant_id: s.restaurantIds[0] });
  const people = new Map((await db.select<Profile>('profiles')).map((p) => [p.id, p]));
  return (
    <div className="max-w-2xl space-y-5">
      <Card className="p-6">
        <h2 className="font-display text-2xl font-semibold text-navy">Staff access</h2>
        <p className="mt-1 text-sm text-muted">Staff can manage orders, menu and delivery for this restaurant only. They each need their own FeastQuarter account.</p>
        <ul className="mt-3 divide-y divide-line">{staff.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><strong className="text-navy">{people.get(m.user_id)?.full_name}</strong> <span className="text-muted">{people.get(m.user_id)?.email}</span></span><span className="flex items-center gap-3"><Badge tone={m.role === 'owner' ? 'gold' : 'grey'}>{m.role}</Badge>{m.role !== 'owner' && <form action={removeStaffAction}><input type="hidden" name="id" value={m.id} /><button className="text-danger hover:underline">Remove</button></form>}</span></li>)}</ul>
      </Card>
      <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Add a team member</h3>
        <ActionForm action={addStaffAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"><Field label="Their account email"><Input name="email" type="email" required /></Field><Field label="Role"><Select name="role"><option value="staff">Staff</option><option value="manager">Manager</option></Select></Field><Submit>Add</Submit></ActionForm></Card>
    </div>
  );
}
