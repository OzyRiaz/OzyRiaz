import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Container, Field, Input, Notice } from '@/components/ui';
import { demoLoginAction, loginAction } from '@/lib/auth/actions';
import { isDemo } from '@/lib/config';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo-data';
export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next ?? '/';
  return (
    <Container className="max-w-md py-12">
      <h1 className="font-display text-3xl font-semibold text-navy">Welcome back</h1>
      <Card className="mt-5 p-6">
        <ActionForm action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required minLength={8} /></Field>
          <Submit className="w-full" pendingText="Signing in…">Sign in</Submit>
        </ActionForm>
        <p className="mt-4 text-center text-sm text-muted">New here? <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-navy underline">Create an account</Link></p>
      </Card>
      {isDemo && (
        <Card className="mt-5 p-5">
          <Notice tone="gold"><strong>Demo mode quick sign-in.</strong> These fictional accounts only exist in demo mode. Password for typed sign-in: <code>{DEMO_PASSWORD}</code></Notice>
          <div className="mt-3 grid gap-2">
            {([['Customer', DEMO_ACCOUNTS.customer], ['Member (FeastQuarter Plus)', DEMO_ACCOUNTS.member], ['Restaurant owner (Karahi Lane)', DEMO_ACCOUNTS.owner], ['Restaurant owner (Smokehouse Grill)', DEMO_ACCOUNTS.owner2], ['Administrator', DEMO_ACCOUNTS.admin]] as const).map(([l, e]) => (
              <form key={e} action={demoLoginAction}><input type="hidden" name="email" value={e} /><input type="hidden" name="next" value={next} /><button className="w-full rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold text-navy hover:bg-navy-100">{l}<span className="block text-xs font-normal text-muted">{e}</span></button></form>
            ))}
          </div>
        </Card>
      )}
    </Container>
  );
}
