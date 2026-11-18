import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'gold' | 'ghost' | 'outline' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-700 shadow-card',
  gold: 'bg-gold text-navy hover:bg-gold-600 hover:text-white shadow-card',
  ghost: 'text-navy hover:bg-navy-100',
  outline: 'border border-navy/25 text-navy hover:bg-navy-100',
  danger: 'bg-danger text-white hover:bg-red-800',
};
export const btn = (v: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', extra = '') =>
  clsx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
    size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-4 py-2.5 text-sm', variants[v], extra);

export function Button({ variant, size, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return <button {...p} className={btn(variant, size, className)} />;
}
export function LinkButton({ href, variant, size, className, children }: { href: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  return <Link href={href} className={btn(variant, size, className)}>{children}</Link>;
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) =>
  <div className={clsx('rounded-2xl border border-line bg-white shadow-card', className)}>{children}</div>;

const tones = { navy: 'bg-navy text-white', gold: 'bg-gold-100 text-[#7a5a10]', green: 'bg-emerald-50 text-ok', red: 'bg-red-50 text-danger', grey: 'bg-neutral-100 text-muted', demo: 'bg-violet-50 text-violet-700' };
export const Badge = ({ tone = 'grey', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) =>
  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;

const field = 'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 shadow-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/60';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(field, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(field, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(field, p.className)} />;
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block space-y-1.5" htmlFor={htmlFor}>
      <span className="text-sm font-semibold text-navy">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Container = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;

export const PageTitle = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="font-display text-3xl font-semibold text-navy sm:text-4xl">{title}</h1>{sub && <p className="mt-1 text-muted">{sub}</p>}</div>
    {action}
  </div>
);

export const EmptyState = ({ title, body, action }: { title: string; body?: string; action?: ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
    <p className="font-display text-xl text-navy">{title}</p>
    {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'gold' }) => (
  <div className={clsx('rounded-2xl border p-4 sm:p-5', tone === 'gold' ? 'border-gold bg-gold-100' : 'border-line bg-white shadow-card')}>
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-1 font-display text-2xl font-semibold text-navy sm:text-3xl">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
  </div>
);

export const DemoBadge = () => <Badge tone="demo">Demo content</Badge>;

export function Notice({ tone = 'gold', children }: { tone?: 'gold' | 'red' | 'green' | 'navy'; children: ReactNode }) {
  const t = { gold: 'border-gold bg-gold-100 text-[#5c430a]', red: 'border-red-200 bg-red-50 text-danger', green: 'border-emerald-200 bg-emerald-50 text-ok', navy: 'border-navy/20 bg-navy-100 text-navy' }[tone];
  return <div role={tone === 'red' ? 'alert' : 'status'} className={clsx('rounded-xl border px-4 py-3 text-sm', t)}>{children}</div>;
}
