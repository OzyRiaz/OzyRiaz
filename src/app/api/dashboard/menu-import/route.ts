import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { aiAvailable } from '@/lib/menu-import/ai';
import { LIMITS } from '@/lib/menu-import/schema';
import { MenuImportError, previewMenuImport, MAX_FILE_BYTES } from '@/lib/services/menu-import';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Draft only: nothing is saved here. The restaurant always comes from the signed-in session. */
export async function POST(req: Request) {
  const s = await getSession();
  const rid = s?.restaurantIds[0];
  if (!s || s.role !== 'restaurant' || !rid) return NextResponse.json({ error: 'Please sign in as a restaurant owner.' }, { status: 403 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: 'That upload did not work. Please try again.' }, { status: 400 }); }
  const file = fd.get('file');
  const text = String(fd.get('text') ?? '').slice(0, LIMITS.maxTextChars);
  try {
    let f: { mimeType: string; bytes: Buffer } | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'That file is too big (limit 4.5 MB). Use a smaller photo, or a screenshot.' }, { status: 413 });
      f = { mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) };
    }
    const menu = await previewMenuImport({ restaurantId: rid, userId: s.userId, text, file: f, useAi: fd.get('useAi') === '1' });
    return NextResponse.json({ menu });
  } catch (e) {
    if (e instanceof MenuImportError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Something went wrong reading that menu. Please paste the text instead.' }, { status: 500 });
  }
}

/** Lets the page know whether photo/PDF reading is switched on (no secrets). */
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== 'restaurant') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ ai: aiAvailable() });
}
