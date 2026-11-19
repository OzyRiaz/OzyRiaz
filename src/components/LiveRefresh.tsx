'use client';
import { Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Keeps the order board fresh (polling) and alerts staff to new orders: tab-title count, vibration where supported,
 * and an audible chime IF sound has been enabled with the button (browsers only allow audio after a tap).
 * This is polling, not a push channel: if the tablet sleeps or loses signal the board updates when it wakes — see escalation.
 */
export function LiveRefresh({ everyMs = 6000, pending = 0 }: { everyMs?: number; pending?: number }) {
  const router = useRouter();
  const [sound, setSound] = useState(false);
  const prev = useRef(pending);
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => { try { setSound(localStorage.getItem('fq.sound') === '1'); } catch { /* ignore */ } }, []);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, everyMs); return () => clearInterval(t); }, [router, everyMs]);
  useEffect(() => { const base = document.title.replace(/^\(\d+\) /, ''); document.title = pending > 0 ? `(${pending}) ${base}` : base; return () => { document.title = base; }; }, [pending]);

  function chime() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current ??= new AC();
      const c = ctx.current; const now = c.currentTime;
      [880, 1175, 880, 1175].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.0001, now + i * 0.22); g.gain.exponentialRampToValueAtTime(0.4, now + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.2); o.start(now + i * 0.22); o.stop(now + i * 0.22 + 0.21); });
    } catch { /* audio unsupported or blocked */ }
  }
  useEffect(() => {
    if (pending > prev.current) { if (sound) chime(); try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ } }
    prev.current = pending;
  }, [pending, sound]);

  function toggle() { const next = !sound; setSound(next); try { localStorage.setItem('fq.sound', next ? '1' : '0'); } catch { /* ignore */ } if (next) chime(); }
  return (
    <div className="flex items-center gap-3">
      <button onClick={toggle} aria-pressed={sound} className="inline-flex items-center gap-1.5 rounded-lg border border-navy/25 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy-100">
        {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}{sound ? 'New-order sound ON' : 'Turn on new-order sound'}
      </button>
      <span className="sr-only" aria-live="polite">{pending > 0 ? `${pending} order${pending === 1 ? '' : 's'} waiting` : ''}</span>
    </div>
  );
}
