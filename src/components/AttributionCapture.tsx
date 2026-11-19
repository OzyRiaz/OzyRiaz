'use client';
import { useEffect } from 'react';

/** Remembers campaign attribution (?src= / utm_source / utm_campaign / ref) for 30 days so a later order can be attributed. No personal data. */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const src = (q.get('src') ?? q.get('utm_source') ?? q.get('ref') ?? '').slice(0, 40);
      const campaign = (q.get('utm_campaign') ?? '').slice(0, 60);
      if (src || campaign) document.cookie = `fq_attr=${encodeURIComponent(JSON.stringify({ src, campaign }))}; path=/; max-age=2592000; samesite=lax`;
    } catch { /* ignore */ }
  }, []);
  return null;
}
