import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { isDemo } from '../config';
import { getDb } from '../db';
import type { Profile, RestaurantStaff, Role, Session } from '../types';
import { DEMO_COOKIE, verifyDemo } from './demo-cookie';

export async function sessionForUser(userId: string): Promise<Session | null> {
  const db = await getDb();
  const p = await db.get<Profile>('profiles', { id: userId });
  if (!p || p.suspended || p.deleted_at) return null;
  const staff = await db.select<RestaurantStaff>('restaurant_staff', { user_id: p.id });
  return { userId: p.id, email: p.email, name: p.full_name, role: p.role, restaurantIds: staff.map((s) => s.restaurant_id) };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  if (isDemo) return sessionForUser0(verifyDemo(jar.get(DEMO_COOKIE)?.value));
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: () => { /* refreshed in middleware */ } },
  });
  // getUser() validates the JWT with Supabase Auth (never trust getSession() on the server).
  const { data } = await supabase.auth.getUser();
  return sessionForUser0(data.user?.id ?? null);
}
const sessionForUser0 = (id: string | null) => (id ? sessionForUser(id) : Promise.resolve(null));

export async function requireSession(next = '/'): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireRole(role: Role, next = '/'): Promise<Session> {
  const s = await requireSession(next);
  if (s.role !== role) redirect('/?denied=1');
  return s;
}

/** Restaurant dashboard guard: user must be staff of the given restaurant. Admins are NOT implicitly staff. */
export async function requireRestaurant(restaurantId: string): Promise<Session> {
  const s = await requireSession('/dashboard');
  if (!s.restaurantIds.includes(restaurantId)) redirect('/dashboard?denied=1');
  return s;
}

export const canManageRestaurant = (s: Session | null, restaurantId: string) => !!s && s.restaurantIds.includes(restaurantId);
