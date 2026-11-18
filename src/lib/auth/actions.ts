'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { isDemo } from '../config';
import { getDb, DuplicateError } from '../db';
import { hashPassword, verifyPassword } from '../password';
import type { Profile } from '../types';
import { DEMO_COOKIE, signDemo } from './demo-cookie';
import type { FormState } from '../form';


const creds = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address'), password: z.string().min(8, 'Password must be at least 8 characters') });
const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

const supa = async () => {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: (list) => list.forEach(({ name, value, options }) => jar.set(name, value, options)) },
  });
};

async function setDemoCookie(userId: string) {
  (await cookies()).set(DEMO_COOKIE, signDemo(userId), { httpOnly: true, sameSite: 'lax', secure: (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://'), path: '/', maxAge: 7 * 86400 });
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = creds.safeParse({ email: fd.get('email'), password: fd.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;
  if (isDemo) {
    const db = await getDb();
    const c = await db.get<{ user_id: string; password_hash: string }>('demo_credentials', { email });
    const p = c && (await db.get<Profile>('profiles', { id: c.user_id }));
    if (!c || !p || !verifyPassword(password, c.password_hash)) return { error: 'Email or password is incorrect' };
    if (p.suspended || p.deleted_at) return { error: 'This account is not active. Contact support.' };
    await setDemoCookie(p.id);
  } else {
    const { error } = await (await supa()).auth.signInWithPassword({ email, password });
    if (error) {
      if (/not confirmed/i.test(error.message)) return { error: 'Please confirm your email first: check your inbox (and spam) for the link. In Supabase you can turn off "Confirm email" while testing.' };
      if (/rate limit|too many/i.test(error.message)) return { error: 'Too many attempts. Please wait a minute and try again.' };
      return { error: 'Email or password is incorrect' };
    }
  }
  redirect(safeNext(fd.get('next')));
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = creds.extend({ full_name: z.string().trim().min(2, 'Enter your name').max(80), consent: z.literal('on', { error: 'Please accept the Terms and Privacy Policy' }) })
    .safeParse({ email: fd.get('email'), password: fd.get('password'), full_name: fd.get('full_name'), consent: fd.get('consent') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, full_name } = parsed.data;
  if (isDemo) {
    const db = await getDb();
    try {
      const p = await db.insert<Profile>('profiles', { email, full_name, phone: null, role: 'customer', suspended: false, deleted_at: null });
      await db.insert('demo_credentials', { user_id: p.id, email, password_hash: hashPassword(password) });
      await setDemoCookie(p.id);
    } catch (e) {
      if (e instanceof DuplicateError) return { error: 'An account with this email already exists' };
      throw e;
    }
  } else {
    // Role is never taken from user input: a DB trigger creates the profile as 'customer'.
    const s = await supa();
    const { data, error } = await s.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) return { error: error.message };
    // With "Confirm email" on, Supabase creates the user but returns no session until the link is clicked.
    if (!data.session) return { ok: 'Account created. Check your email to confirm it, then sign in.' };
  }
  redirect(safeNext(fd.get('next')));
}

export async function logoutAction() {
  if (isDemo) (await cookies()).delete(DEMO_COOKIE);
  else await (await supa()).auth.signOut();
  redirect('/');
}

/** Demo-only one-click sign-in for the seeded demo accounts. */
export async function demoLoginAction(fd: FormData) {
  if (!isDemo) redirect('/login');
  const db = await getDb();
  const p = await db.get<Profile>('profiles', { email: String(fd.get('email')) });
  const isDemoAcct = p && String(p.email).endsWith('@demo.feastquarter.test');
  if (!p || !isDemoAcct) redirect('/login');
  await setDemoCookie(p.id);
  redirect(safeNext(fd.get('next')) === '/' ? (p.role === 'admin' ? '/admin' : p.role === 'restaurant' ? '/dashboard' : '/') : safeNext(fd.get('next')));
}

