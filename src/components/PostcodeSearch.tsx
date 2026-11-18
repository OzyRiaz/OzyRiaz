'use client';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function PostcodeSearch({ initial = '', dark = false, target = '/restaurants' }: { initial?: string; dark?: boolean; target?: string }) {
  const router = useRouter();
  const [pc, setPc] = useState(initial);
  const [err, setErr] = useState('');
  useEffect(() => { if (!initial) { try { setPc(localStorage.getItem('bdfeast.postcode') ?? ''); } catch { /* ignore */ } } }, [initial]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = pc.trim().toUpperCase();
    if (!/^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/.test(v)) { setErr('Enter a UK postcode, e.g. BD5 0AA'); return; }
    setErr('');
    try { localStorage.setItem('bdfeast.postcode', v); } catch { /* ignore */ }
    document.cookie = `bdf_pc=${encodeURIComponent(v)}; path=/; max-age=2592000; samesite=lax`;
    router.push(`${target}?postcode=${encodeURIComponent(v)}`);
  }
  return (
    <form onSubmit={submit} className="w-full" role="search" aria-label="Find restaurants by postcode">
      <div className={`flex items-center gap-2 rounded-2xl p-1.5 shadow-lift ${dark ? 'bg-white' : 'bg-white border border-line'}`}>
        <MapPin className="ml-3 hidden shrink-0 text-gold-600 sm:block" size={22} aria-hidden />
        <label htmlFor="pc" className="sr-only">Your postcode</label>
        <input id="pc" value={pc} onChange={(e) => setPc(e.target.value)} placeholder="Enter your postcode, e.g. BD5 0AA" autoComplete="postal-code" aria-invalid={!!err} aria-describedby={err ? 'pc-err' : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-ink placeholder:text-muted/70 focus:outline-none" />
        <button className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-700 active:scale-95">Find food</button>
      </div>
      {err && <p id="pc-err" role="alert" className="mt-2 text-sm font-medium text-gold">{err}</p>}
    </form>
  );
}
