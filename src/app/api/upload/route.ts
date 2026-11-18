import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isDemo } from '@/lib/config';
import { adminClient } from '@/lib/db/supabase';

export const runtime = 'nodejs';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 2 * 1024 * 1024;

/** Restaurant staff image upload. Live: Supabase Storage (public bucket, path scoped by restaurant). Demo: inline data URL. */
export async function POST(req: Request) {
  const s = await getSession();
  const fd = await req.formData();
  const restaurantId = String(fd.get('restaurantId') ?? '');
  const file = fd.get('file');
  if (!s || !s.restaurantIds.includes(restaurantId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use a JPG, PNG or WebP image' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  // Verify magic bytes, don't trust the declared MIME type.
  const sig = buf.subarray(0, 12);
  const ok = (ext === 'jpg' && sig[0] === 0xff && sig[1] === 0xd8) || (ext === 'png' && sig[0] === 0x89 && sig[1] === 0x50) || (ext === 'webp' && sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP');
  if (!ok) return NextResponse.json({ error: 'File content does not match its type' }, { status: 400 });
  if (isDemo) return NextResponse.json({ url: `data:${file.type};base64,${buf.toString('base64')}` });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'menu-images';
  const path = `${restaurantId}/${randomUUID()}.${ext}`;
  const { error } = await adminClient().storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  return NextResponse.json({ url: adminClient().storage.from(bucket).getPublicUrl(path).data.publicUrl });
}
