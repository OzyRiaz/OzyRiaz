import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
/** GDPR data portability: everything we hold about the signed-in customer. */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const db = await getDb();
  const [profile, addresses, orders, membership] = await Promise.all([
    db.get('profiles', { id: s.userId }), db.select('addresses', { user_id: s.userId }), db.select('orders', { customer_id: s.userId }), db.get('memberships', { user_id: s.userId }),
  ]);
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), profile, addresses, orders, membership }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="bd-feast-my-data.json"', 'Cache-Control': 'no-store' },
  });
}
