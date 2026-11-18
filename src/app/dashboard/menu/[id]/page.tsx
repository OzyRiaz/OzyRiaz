import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { ItemForm } from '@/components/ItemForm';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { optionsToText } from '@/lib/menu-options';
import type { MenuCategory, MenuItem, Restaurant } from '@/lib/types';

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession('/dashboard');
  const rid = s.restaurantIds[0];
  const db = await getDb();
  const id = (await params).id;
  const item = id === 'new' ? undefined : await db.get<MenuItem>('menu_items', { id, restaurant_id: rid }); // scoped: other restaurants' items 404
  if (id !== 'new' && !item) notFound();
  const [cats, r] = await Promise.all([db.select<MenuCategory>('menu_categories', { restaurant_id: rid }, { order: ['sort', 'asc'] }), db.get<Restaurant>('restaurants', { id: rid })]);
  return <Card className="max-w-3xl p-6"><h2 className="mb-4 font-display text-2xl font-semibold text-navy">{item ? 'Edit item' : 'New item'}</h2><ItemForm item={item ?? undefined} categories={cats} restaurantId={rid} optionsText={item ? optionsToText(item.option_groups) : ''} cuisine={r!.cuisines[0]} /></Card>;
}
