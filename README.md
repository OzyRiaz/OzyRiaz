# FeastQuarter — *Your City. Your Food. Your Way.*

Local food ordering marketplace. Launching in Bradford; Leeds, Manchester and other UK cities are configuration (`src/lib/cities.ts`), not code. Restaurants deliver with their own drivers.
**8%** commission on delivery food orders, **5%** on collection, **no joining or monthly fees**, optional **FeastQuarter Plus** at **£4.99/month**.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres/Auth/Storage) · Stripe Connect · Netlify.

## Honest status

| Area | Status |
|---|---|
| Customer app, restaurant dashboard, admin portal | Built; click-through tested in **demo mode** |
| Pricing, commission, webhook idempotency, order/membership/refund logic | 49 automated tests passing |
| Stripe (Checkout, Connect, subscriptions, webhooks, refunds) | Code written against the Stripe SDK and tested with a **mocked** Stripe. **Not yet run against real Stripe test mode** — do this first (below) |
| Supabase (schema, RLS, auth, storage) | Migrations + adapter written. **Not yet run against a live Supabase project** |
| Email | Adapter for Resend. **Nothing is sent until `RESEND_API_KEY` is set**; unsent messages are logged as `skipped` in Admin → Reports. SMS/push not implemented |
| Legal pages | **Placeholders needing solicitor review** |
| Photography | Illustrated placeholders; restaurants upload their own images |

## Quick start (demo mode — no accounts needed)

```bash
npm install
cp .env.example .env.local     # APP_MODE=demo is the default
npm run dev                    # http://localhost:3000
npm test
```
Demo mode uses fictional restaurants, an in-memory database (resets on restart) and a **simulated payment page** (the same server function the real webhook calls). Sign in with the one-click demo accounts on `/login`.
Never use demo mode for real customers.

**Testing on a phone (same Wi-Fi):** `npm run dev` only reliably works from the computer itself. For a phone run `npm run phone` (builds, then serves on your network), and open the `http://<computer-ip>:3000` address on the phone. Windows may ask to allow Node.js through the firewall.

## Going live (test mode first)

1. **Supabase**: create a project; run `supabase/migrations/0001_schema.sql` then `0002_rls.sql`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only). Create the first admin by registering normally, then in the SQL editor: `update profiles set role='admin' where email='you@example.com';`
2. **Stripe** (test mode): enable Connect (Express, UK). Set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
   Webhook endpoint `https://<site>/api/stripe/webhook`, tick **"Listen to events on Connected accounts"** as well, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created|updated|deleted`, `account.updated`, `charge.refunded`, `charge.dispute.created|closed`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`. Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Set `APP_MODE=live`. The app refuses to start without the required variables.
4. **Verify before launch**: onboard a test restaurant, place a test order (card `4242 4242 4242 4242`), confirm the application fee and transfer in the Stripe dashboard, reject an order (refund), subscribe/cancel membership, replay webhooks.
5. **Email**: verify a domain at Resend; set `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`.

### Netlify
Connect the GitHub repo; `netlify.toml` is ready (`@netlify/plugin-nextjs`). Set the env vars from `.env.example`, plus `CRON_SECRET` (≥16 chars) so the scheduled function `netlify/functions/daily-summary.mts` (07:00 UTC) can trigger the admin daily summary. Use separate Netlify contexts / Supabase / Stripe projects for demo/staging vs live.

## How money works
- **Food orders**: Stripe Checkout *destination charge* — funds go to the restaurant's connected account, FeastQuarter takes `application_fee_amount`. Delivery fees belong to the restaurant.
- **Commission** applies to the **food subtotal only** (after restaurant-funded discounts), rate stored on each order (changing rates affects new orders only).
- **Discounts**: one per order (the larger of member offer / promo code). Restaurant-funded reduce the restaurant's take. Platform-funded come out of FeastQuarter's commission and are **capped at it** (Stripe fees can't be negative).
- **Membership**: Checkout subscription on the **platform** account. No free-delivery promise.
- **Paid = webhook only.** The success page never marks anything paid. Events are recorded by id (idempotent); failures roll the record back so Stripe retries. Orders carry a unique idempotency key (no duplicate orders). Amount mismatches are refused.
- **Admin stats** keep GMV, commission revenue, subscription revenue and platform revenue separate.

## Security notes
Role-based guards on every server action; restaurant data is always scoped by the session's restaurant id (tested). RLS in `0002_rls.sql` for direct DB access. Service-role key is server-only. Uploads validated by magic bytes. CSV export neutralises formula injection. Security headers in `next.config.mjs`. **Not yet done**: rate limiting, CAPTCHA, a formal security review/pen test.

## Known gaps / next steps
Run live Stripe + Supabase verification · legal review · VAT handling · rate limiting · SMS/push order alerts · restaurant order-acceptance timeouts · richer option editor · automated browser tests in CI · real photography.

## Layout
`src/lib` pure domain logic (`pricing.ts`, `postcode.ts`, `order-state.ts`) and `services/` (orders, quote, membership, stripe-webhook, connect, reports, notify) over a tiny `Db` adapter (`db/memory.ts` demo, `db/supabase.ts` live). Add a city in `src/lib/cities.ts`.

## Brand & domain (FeastQuarter)

- Brand constants live in `src/lib/brand.ts` (name, tagline, **FeastQuarter Plus**, colours, domain). Logo mark: `src/components/Logo.tsx`; generated assets in `public/brand/` (favicon, app icons, Open Graph card, 1080px social profile image, email logo, horizontal logos).
- **Domain `feastquarter.co.uk` is prepared but NOT assumed to be owned or connected.** The site's real URL always comes from `NEXT_PUBLIC_APP_URL`. When the domain is bought: add it in Netlify (Domain management), set DNS as Netlify instructs, set `NEXT_PUBLIC_APP_URL=https://feastquarter.co.uk`, update Supabase Auth → URL Configuration (Site URL + redirect URLs), add the new Stripe webhook endpoint URL (or update the existing one), verify the domain with your email provider and set `EMAIL_FROM` (e.g. `FeastQuarter <orders@feastquarter.co.uk>`).
- Identifiers deliberately **not** renamed (renaming would lose data or break integrations): browser storage keys `bdfeast.*` and cookies `bdf_pc` / `bdf_demo_session` (internal, invisible; renaming would empty saved baskets/postcodes), all database tables/columns, env var names, Stripe IDs (`STRIPE_MEMBERSHIP_PRICE_ID`, accounts, customers, subscriptions) and the Supabase project. Existing orders keep their `BDF-` references; new orders use `FQ-`.
- Existing live databases: run `supabase/migrations/0003_rebrand.sql` (data-only, idempotent) to update stored membership benefit text. If a Stripe Product for the membership already exists, rename its display name to "FeastQuarter Plus" in the Stripe dashboard — the Price/Product IDs stay the same, so existing subscriptions are untouched.
