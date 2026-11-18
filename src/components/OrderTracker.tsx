'use client';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { customerSteps, STATUS_LABEL } from '@/lib/order-state';
import type { Fulfilment, OrderStatus } from '@/lib/types';

export function OrderTracker({ status, fulfilment, live }: { status: OrderStatus; fulfilment: Fulfilment; live: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!live) return; const t = setInterval(() => router.refresh(), 8000); return () => clearInterval(t); }, [live, router]);
  const steps = customerSteps(fulfilment);
  const idx = steps.indexOf(status);
  if (['rejected', 'cancelled', 'payment_failed', 'pending_payment'].includes(status)) return null;
  return (
    <ol aria-label="Order progress" className="grid gap-3 sm:grid-cols-5">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === idx ? 'step' : undefined} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
          <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors', i <= idx ? 'bg-gold text-navy' : 'bg-navy-100 text-muted', i === idx && 'ring-4 ring-gold/30')}>{i < idx ? '✓' : i + 1}</span>
          <span className={clsx('text-sm', i <= idx ? 'font-semibold text-navy' : 'text-muted')}>{STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}
