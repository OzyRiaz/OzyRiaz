import Stripe from 'stripe';
import { stripeConfigured } from './config';

let s: Stripe | null = null;
export function getStripe(): Stripe {
  if (!stripeConfigured()) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
  return (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { appInfo: { name: 'FeastQuarter', version: '0.1.0' } }));
}
/** Test seam */
export const __setStripeForTests = (x: unknown) => { s = x as Stripe | null; };
