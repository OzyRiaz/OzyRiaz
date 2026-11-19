'use client';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
/** Native share sheet where available (phones), otherwise copies the link. */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [done, setDone] = useState(false);
  async function go() {
    try { if (navigator.share) { await navigator.share({ title, url }); return; } await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* cancelled */ }
  }
  return <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"><Share2 size={14} />{done ? 'Link copied' : 'Share'}</button>;
}
