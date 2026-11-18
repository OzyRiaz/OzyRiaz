import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Photo } from '@/components/FoodArt';
import { Badge, Card, Input, LinkButton } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { getMenu } from '@/lib/services/restaurants';
import type { Restaurant } from '@/lib/types';
import { addCategoryAction, deleteItemAction, toggleItemAction } from '../actions';
export const metadata: Metadata = { title: 'Menu — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function MenuAdmin() {
  const s = await requireSession('/dashboard');
  const rid = s.restaurantIds[0];
  const r = (await (await getDb()).get<Restaurant>('restaurants', { id: rid }))!;
  const menu = await getMenu(rid);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl font-semibold text-navy">Menu</h2>{menu.length > 0 && <LinkButton href="/dashboard/menu/new">Add item</LinkButton>}</div>
      <Card className="p-4"><ActionForm action={addCategoryAction} className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm font-semibold text-navy">New category<Input name="name" placeholder="e.g. Starters" className="mt-1 font-normal" /></label><Submit variant="outline">Add category</Submit></ActionForm></Card>
      {menu.map((c) => (
        <section key={c.id}><h3 className="mb-2 font-display text-lg font-semibold text-navy">{c.name}</h3>
          <Card className="divide-y divide-line">
            {c.items.length === 0 && <p className="p-4 text-sm text-muted">No items yet.</p>}
            {c.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 p-3">
                <Photo src={it.image_url} cuisine={r.cuisines[0]} alt="" size="sm" className="h-14 w-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy">{it.name} <span className="font-normal text-muted">· {fmt(it.price_pence)}</span></p><p className="truncate text-xs text-muted">{it.allergens.length ? `Contains: ${it.allergens.join(', ')}` : 'No declared allergens'}{it.option_groups.length ? ` · ${it.option_groups.length} option group(s)` : ''}</p></div>
                <form action={toggleItemAction}><input type="hidden" name="id" value={it.id} /><button aria-pressed={it.available} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${it.available ? 'bg-emerald-50 text-ok' : 'bg-neutral-200 text-muted'}`}>{it.available ? 'Available' : 'Sold out'}</button></form>
                <Link href={`/dashboard/menu/${it.id}`} className="text-sm font-semibold text-navy underline">Edit</Link>
                <form action={deleteItemAction}><input type="hidden" name="id" value={it.id} /><button className="text-sm text-danger hover:underline" aria-label={`Delete ${it.name}`}>Delete</button></form>
              </div>
            ))}
          </Card></section>
      ))}
      {menu.length === 0 && <p className="text-sm text-muted">Add your first category above, then add items.</p>}
    </div>
  );
}
