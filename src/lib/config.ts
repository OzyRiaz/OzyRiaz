export const APP_MODE: 'demo' | 'live' = process.env.APP_MODE === 'live' ? 'live' : 'demo';
export const isDemo = APP_MODE === 'demo';
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

/** Placeholder values such as "sk_test_..." from .env.example do NOT count as a configured key. */
export const stripeConfigured = () => /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.test(process.env.STRIPE_SECRET_KEY ?? '');
/** Simulated payments are only ever available in demo mode with no Stripe key. */
export const demoPaymentsEnabled = () => isDemo && !stripeConfigured();
export const PAYMENTS_OFF_MESSAGE = 'Card payments are not switched on yet on this site. Please check back soon.';
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export function assertLiveEnv() {
  if (!isDemo) {
    // Only the database is required to start. Stripe is optional until payments are switched on: checkout, membership
    // and restaurant payout onboarding show a clear "not switched on yet" message while it is missing.
    const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`APP_MODE=live but missing env vars: ${missing.join(', ')}`);
  }
}
