'use client';
import clsx from 'clsx';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/form';
import { btn } from './ui';

export function Submit({ children, variant = 'primary', className, pendingText = 'Please wait…', size = 'md' }: { children: ReactNode; variant?: 'primary' | 'gold' | 'outline' | 'danger' | 'ghost'; className?: string; pendingText?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={btn(variant, size, className)}>
      {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? pendingText : children}
    </button>
  );
}

/** Form wired to a server action with inline error/success feedback and pending state. */
export function ActionForm({ action, children, className }: { action: (s: FormState, fd: FormData) => Promise<FormState>; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} noValidate={false}>
      {children}
      <div aria-live="polite" className="mt-3 empty:hidden">
        {state?.error && <p role="alert" className={clsx('rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger')}>{state.error}</p>}
        {state?.ok && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-ok">{state.ok}</p>}
      </div>
    </form>
  );
}
