import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { processStripeEvent } from '@/lib/services/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. Order/membership state changes ONLY happen here (or in demo mode via the simulated route).
 * 1) Verify the signature against the RAW body. 2) Process each event id exactly once. 3) 5xx on failure so Stripe retries.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) return NextResponse.json({ error: 'Webhook not configured or signature missing' }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  try {
    const { duplicate } = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate });
  } catch (e) {
    console.error('stripe webhook failed', event.id, event.type, (e as Error).message);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
