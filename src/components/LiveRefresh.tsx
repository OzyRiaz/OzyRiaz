'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Polls the server for fresh data and shows the pending count in the tab title so a busy kitchen notices new orders. */
export function LiveRefresh({ everyMs = 10000, pending = 0 }: { everyMs?: number; pending?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, everyMs); return () => clearInterval(t); }, [router, everyMs]);
  useEffect(() => { const base = document.title.replace(/^\(\d+\) /, ''); document.title = pending > 0 ? `(${pending}) ${base}` : base; return () => { document.title = base; }; }, [pending]);
  return <span className="sr-only" aria-live="polite">{pending > 0 ? `${pending} order${pending === 1 ? '' : 's'} waiting` : ''}</span>;
}
