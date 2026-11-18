export const APP_MODE: 'demo' | 'live' = process.env.APP_MODE === 'live' ? 'live' : 'demo';
export const isDemo = APP_MODE === 'demo';
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_');
/** Simulated payments are only ever available in demo mode with no Stripe key. */
export const demoPaymentsEnabled = () => isDemo && !stripeConfigured();
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export function assertLiveEnv() {
  if (!isDemo) {
    const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
      .filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`APP_MODE=live but missing env vars: ${missing.join(', ')}`);
  }
}
