'use client';
import { useState } from 'react';
import { Photo } from './FoodArt';

export function ImageUpload({ name, restaurantId, initial, cuisine }: { name: string; restaurantId: string; initial?: string | null; cuisine?: string }) {
  const [url, setUrl] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setErr('');
    const fd = new FormData(); fd.set('file', f); fd.set('restaurantId', restaurantId);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? 'Upload failed'); else setUrl(j.url);
    } catch { setErr('Upload failed — check your connection'); }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-3">
      <Photo src={url || null} cuisine={cuisine} alt="Preview" size="sm" className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="min-w-0 text-sm">
        <input type="hidden" name={name} value={url} />
        <label className="inline-block cursor-pointer rounded-lg border border-navy/25 px-3 py-1.5 font-semibold text-navy hover:bg-navy-100">{busy ? 'Uploading…' : url ? 'Change image' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="sr-only" disabled={busy} /></label>
        {url && <button type="button" onClick={() => setUrl('')} className="ml-2 text-muted hover:text-danger">Remove</button>}
        <p className="mt-1 text-xs text-muted">JPG/PNG/WebP, up to 2 MB.</p>
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      </div>
    </div>
  );
}
