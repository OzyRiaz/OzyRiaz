'use client';
import { useState } from 'react';
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { window.prompt('Copy this link:', text); } }} className="rounded-lg border border-navy/25 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy-100">{done ? 'Copied ✓' : label}</button>;
}
