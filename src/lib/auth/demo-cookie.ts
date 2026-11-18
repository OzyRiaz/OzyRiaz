import { createHmac, timingSafeEqual } from 'node:crypto';

// Internal cookie name kept as-is (demo mode only); not user-visible.
export const DEMO_COOKIE = 'bdf_demo_session';
const secret = () => process.env.DEMO_SESSION_SECRET || 'dev-only-demo-secret';

export function signDemo(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 7 * 864e5 })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyDemo(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e > Date.now() ? u : null;
  } catch { return null; }
}
