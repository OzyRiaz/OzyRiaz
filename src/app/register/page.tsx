import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Container, Field, Input } from '@/components/ui';
import { registerAction } from '@/lib/auth/actions';
export const metadata: Metadata = { title: 'Create account' };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next ?? '/';
  return (
    <Container className="max-w-md py-12">
      <h1 className="font-display text-3xl font-semibold text-navy">Create your account</h1>
      <Card className="mt-5 p-6">
        <ActionForm action={registerAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Full name"><Input name="full_name" autoComplete="name" required /></Field>
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Password" hint="At least 8 characters"><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
          <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 accent-[#132c39]" required />
            <span>I accept the <Link href="/legal/terms" className="underline" target="_blank">Terms</Link> and have read the <Link href="/legal/privacy" className="underline" target="_blank">Privacy Policy</Link>.</span></label>
          <Submit className="w-full" pendingText="Creating account…">Create account</Submit>
        </ActionForm>
        <p className="mt-4 text-center text-sm text-muted">Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-navy underline">Sign in</Link></p>
        <p className="mt-2 text-center text-xs text-muted">Own a restaurant? <Link href="/partner" className="underline">Apply to join FeastQuarter</Link></p>
      </Card>
    </Container>
  );
}
