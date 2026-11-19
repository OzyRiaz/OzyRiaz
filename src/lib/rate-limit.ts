import { headers } from 'next/headers';

/**
 * Best-effort in-memory rate limiter (fixed window). On serverless hosting each instance has its own memory, so this slows
 * casual abuse and scripted retries but is NOT a distributed guarantee. Supabase Auth also rate-limits sign-ins server-side.
 * Before wide launch consider an edge/WAF rule or a shared store (e.g. Upstash/Supabase table).
 */
const buckets = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key);
  if (!b || now >= b.reset) { buckets.set(key, { n: 1, reset: now + windowMs }); if (buckets.size > 5000) for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k); return { ok: true, retryAfterSec: 0 }; }
  b.n++;
  return b.n > max ? { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfterSec: 0 };
}
export const __resetRateLimits = () => buckets.clear();

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
}
export const TOO_MANY = (s: number) => `Too many attempts. Please wait ${s > 60 ? Math.ceil(s / 60) + ' minutes' : s + ' seconds'} and try again.`;
