import { __setDbForTests } from '@/lib/db';
import { createMemoryDb, memStore } from '@/lib/db/memory';
import { ensureDemoSeed, DEMO_ACCOUNTS } from '@/lib/demo-data';
import type { MenuItem, Profile, Restaurant, Session } from '@/lib/types';

export async function freshDb() {
  memStore().clear();
  const db = createMemoryDb();
  await ensureDemoSeed(db);
  __setDbForTests(db);
  return db;
}

export async function sessionFor(email: string): Promise<Session> {
  const db = createMemoryDb();
  const p = (await db.get<Profile>('profiles', { email }))!;
  const staff = await db.select<{ restaurant_id: string }>('restaurant_staff', { user_id: p.id });
  return { userId: p.id, email: p.email, name: p.full_name, role: p.role, restaurantIds: staff.map((s) => s.restaurant_id) };
}

export const customer = () => sessionFor(DEMO_ACCOUNTS.customer);
export const member = () => sessionFor(DEMO_ACCOUNTS.member);
export const owner = () => sessionFor(DEMO_ACCOUNTS.owner);
export const owner2 = () => sessionFor(DEMO_ACCOUNTS.owner2);

export async function karahi() {
  const db = createMemoryDb();
  const r = (await db.get<Restaurant>('restaurants', { slug: 'karahi-lane-demo' }))!;
  const items = await db.select<MenuItem>('menu_items', { restaurant_id: r.id });
  return { r, items, byName: (n: string) => items.find((i) => i.name === n)! };
}
