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
  // Stripe uses a DIFFERENT signing secret for "Connected accounts" endpoints (account.updated, payout.*) than for
  // "Your account" endpoints (checkout, charges, subscriptions). Accept either; the event is only trusted if one verifies.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((x): x is string => !!x);
  const sig = req.headers.get('stripe-signature');
  if (!secrets.length || !sig) return NextResponse.json({ error: 'Webhook not configured or signature missing' }, { status: 400 });
  const raw = await req.text();
  let event;
  for (const secret of secrets) { try { event = getStripe().webhooks.constructEvent(raw, sig, secret); break; } catch { /* try the next secret */ } }
  if (!event) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  try {
    const { duplicate } = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate });
  } catch (e) {
    console.error('stripe webhook failed', event.id, event.type, (e as Error).message);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
