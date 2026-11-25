# FeastQuarter — *Your City. Your Food. Your Way.*

Multi-restaurant food-ordering marketplace. Launching with ~5 independent takeaways in **Bradford**; Leeds, Manchester and other UK cities are **database configuration** (Admin → Locations), not code.
Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres/Auth/Storage) · Stripe Connect · Netlify.

> Guides: [`HOSTING.md`](./HOSTING.md) (put it online in test mode) · [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) (company, bank, tax, legal) · briefings for the [solicitor](./docs/SOLICITOR_BRIEF.md) and [accountant](./docs/ACCOUNTANT_BRIEF.md).
>
> Status, honestly: see [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) for what is verified, what is mocked, and what blocks launch. **Do not take real payments until its blockers are closed.**

## Launch commercial model
- **Flat 10% commission on the food subtotal**, for delivery **and** collection. `commission_bps = 1000`.
- The 10% **includes standard Stripe card processing**: FeastQuarter pays Stripe's fees. Restaurants pay no separate card fee.
- **Fixed 99p FeastQuarter customer service fee** on every delivery **and** collection order (`customer_service_fee_pence = 99`). Paid by the customer, included in the checkout total, shown in the basket, menu page, checkout, order page, confirmation email and refund notices. It belongs to FeastQuarter, is **never commissionable** and **never transferred to the restaurant**. No card surcharge. Plus does not waive it.
- **Delivery fees and tips are never commissionable** and go to the restaurant.
- No joining fee, no monthly fee, no mandatory equipment. Restaurants deliver with their own drivers (or customers collect).
- **FeastQuarter Plus (£4.99/month) is OFF** behind a feature flag (`platform_settings.feature_plus_enabled`, Admin → Settings). Code and records are preserved; nothing is promoted or purchasable until the owner authorises it.

| Example | Customer pays | Commission (10% food) | Service fee | Restaurant allocation | FeastQuarter gross | Illustrative Stripe fee* | FeastQuarter contribution* |
|---|---|---|---|---|---|---|---|
| Delivery: £25.00 food + £3.00 delivery | £28.99 | £2.50 | £0.99 | £25.50 | £3.49 | £0.63 | £2.86 |
| Collection: £25.00 food | £25.99 | £2.50 | £0.99 | £22.50 | £3.49 | £0.59 | £2.90 |

\*1.5% + 20p is **only an example** used in tests. Real fees are read from Stripe's balance transactions (`services/reconcile.ts`). Contribution is before other Stripe Connect charges (entered in Admin → Finance), refunds, disputes, tax and running costs. Orders whose actual fee hasn't been reconciled yet are shown as **estimated** and flagged.

Rules (all in `src/lib/pricing.ts`, integer pence, server-side, covered by tests):
- The rate in force is **stored on every order**; changing it affects new orders only. Every commission/VAT/feature change is written to `settings_audit` (who, old, new, why). Admin-only.
- Restaurant-funded discounts reduce the commission base. Platform-funded discounts/promo codes come out of FeastQuarter's commission and are capped at it (a Stripe application fee can't be negative); they're tracked separately (`discount_funded_by_platform_pence`).
- One discount per order (the largest).
- **One Stripe application fee = commission + service fee.** The 99p is its own visible Checkout line item; the Checkout session is idempotent per order so retries never add it twice. `application_fee_amount` is never transferred to the restaurant.
- **Refunds are allocated exactly, not pro rata** (`src/lib/refunds.ts`): food → delivery → tip (→ service fee only when asked or on a full/declined refund). Stripe refunds the customer from the platform balance, then **only the restaurant's share** is pulled back with `transfers.createReversal` (`amount − service fee − commission returned`). Commission shrinks in proportion to food refunded; the last food refund returns the exact remainder (no rounding drift). Declined / timed-out / unfulfillable orders refund food + delivery + tip + 99p. Customers can cancel a paid order themselves until the restaurant accepts it (order page → Cancel this order). Customer-requested cancellations follow the admin setting `service_fee_refund_on_customer_cancel` (default: refunded). If a reversal fails (e.g. restaurant balance too low) the customer refund still stands and the shortfall is recorded for recovery. Every refund writes an `order_refunds` audit row (CSV: Admin → Reports → Refund audit). Stripe does not return its own processing fee on refunds; FeastQuarter absorbs it.
- Settings `customer_service_fee_pence` and `commission_bps` are admin-only, validated, audited, prospective (each order stores the fee, rate and refund components it was charged at).
- VAT: while `platform_vat_registered=false` no VAT is added to the commission or the 99p and no VAT invoice figures are produced. Service-fee VAT mode (`none`/`inclusive`/`exclusive`) is plumbing only; `exclusive` would raise the customer price and needs explicit approval. Service-fee income counts toward the VAT-threshold monitor.

## Stripe Connect — verified against current Stripe docs
Destination charges with `application_fee_amount` (Checkout), one Express connected account per restaurant.
- **Fee liability:** "Your account balance is debited for the cost of the Stripe fees, refunds, and chargebacks" — so FeastQuarter bears processing, matching the commission model.
- **Disputes:** Stripe debits the disputed amount and fees from FeastQuarter's balance. Recovering from the restaurant (transfer reversal) is a *contract decision*; Admin → Finance has an explicit, capped, admin-only action. Nothing reverses automatically.
- **`on_behalf_of`:** only *required* when platform and restaurant are in different regions (UK↔UK: not required). Using it makes the restaurant the settlement merchant (its statement descriptor and the connected account's fee structure/settlement timing). **Default is OFF** so customers see FeastQuarter on their statement; enable with `STRIPE_USE_ON_BEHALF_OF=true` only after review.
- **Not yet verified here:** whether Stripe returns processing fees on refunds (Stripe generally does not) — confirm in your Stripe pricing terms; it is a cost FeastQuarter would absorb.
- Test mode only. All Stripe behaviour in the automated tests is **mocked**; a real end-to-end test in the Stripe sandbox is still required (checklist in PRODUCTION_READINESS.md).

### Webhooks — you need TWO endpoints
Stripe signs "Your account" and "Connected accounts" endpoints with different secrets. Both point at `https://<site>/api/stripe/webhook`:
1. **Your account** → `STRIPE_WEBHOOK_SECRET`: `checkout.session.completed`, `checkout.session.async_payment_succeeded|failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.updated`, `charge.refunded`, `charge.dispute.created|closed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created|updated|deleted`.
2. **Connected accounts** → `STRIPE_CONNECT_WEBHOOK_SECRET`: `account.updated`, `payout.created|updated|paid|failed|canceled`.
Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (add `--forward-connect-to` for Connect events). Orders are marked paid **only** by verified events (idempotent by event id); the success page never marks anything paid.

## Operations
- **Restaurant dashboard:** Online/Offline switch, live order board (polling every few seconds, tab-title count, vibration, optional chime — browsers require a tap to enable sound), accept with **preparation time**, decline with reason (auto full refund), status flow to Delivered/Collected, menus, delivery areas/fees, hours, member offers, earnings & payouts, QR code + referral link, staff, VAT/food-safety details.
- **Unanswered orders:** after `ORDER_ESCALATE_MINUTES` the restaurant is reminded (email, optional SMS) and admins alerted; after `ORDER_TIMEOUT_MINUTES` the order is declined, **refunded in full**, the customer told, and the restaurant set offline. Runs every 5 min via `netlify/functions/order-timeouts.mts` → `/api/cron/order-timeouts` (needs `CRON_SECRET`).
- **Restaurant money view:** estimated earnings are shown **separately** from Stripe-confirmed balances (live `balance.retrieve` on the connected account) and payouts (recorded only from verified `payout.*` events). Weekly payouts can be set per restaurant by an admin where Stripe allows; instant bank payments are never promised.
- **Admin:** activity and money breakdown (gross customer payments are never shown as revenue), by-city and top-restaurant views, VAT threshold monitor, settings + audit log, locations, promotions (incl. city-scoped), finance (failed payments, disputes, refunds, other Stripe costs), courier status, exports, notification outbox, support/refund requests.
- **Daily summary** (`netlify/functions/daily-summary.mts`, 07:00 UTC) also reconciles Stripe fees and reports the VAT threshold position.

## Notifications — what is and isn't live
In place: transactional email via Resend (each attempt logged in Admin → Reports as sent/failed/**skipped**), live order tracking (in-app), restaurant dashboard alerts, optional SMS backup via Twilio (**off by default; chargeable; mocked in tests**). **Not implemented:** browser/device push notifications (needs VAPID keys, a push-capable service worker and subscription storage; behaviour also differs by device). Nothing is described as live until configured and tested.

## Delivery & couriers
Launch = restaurant-owned drivers + collection. `src/lib/couriers/` defines a provider-independent interface (availability, quote, pickup ETA, booking, tracking, cancellation, failed delivery, cost reporting). **All providers are disabled** and refuse without any network call; no pricing/availability is assumed; no subsidy unless `COURIER_SUBSIDY_AUTHORISED=true`. A real adapter needs a commercial agreement, credentials and owner approval.

## Local development (demo mode — no accounts needed)
```bash
npm install
cp .env.example .env.local     # APP_MODE=demo is the default
npm run dev                    # http://localhost:3000
npm test && npm run typecheck && npm run build
```
Demo mode: fictional restaurants, in-memory data, simulated payment page (same server function the webhook calls). Demo restaurants are **never** listed or orderable in live mode. Phone testing: `npm run phone`.

## Going live (test mode first)
1. **Supabase:** run `supabase/migrations/0001…0009` in order (new project: paste `supabase/setup-all.sql` once). Existing project: run only the migrations you haven't (they are additive and idempotent). First admin: register, then `update profiles set role='admin' where email='you@example.com';`.
2. **Stripe (test):** Connect enabled; keys; two webhook endpoints (above); `npm run live:check`.
3. **Netlify:** connect the repo, set env vars from `.env.example` (incl. `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`). Scheduled functions in `netlify/functions/`.
4. **Domain `feastquarter.co.uk`** is intended but not assumed owned: set `NEXT_PUBLIC_APP_URL`, Supabase Auth URLs, Stripe webhook URLs and `EMAIL_FROM` after it is connected.
5. Work through `PRODUCTION_READINESS.md`. Live Stripe keys require the owner's explicit authorisation.

## Architecture notes
`src/lib` pure domain logic (`pricing.ts`, `postcode.ts`, `order-state.ts`) · `services/` (orders, quote, reconcile, payouts, operations, vat, settings, cities, membership, stripe-webhook, reports, notify, disputes) over a thin `Db` adapter (`db/memory.ts` demo, `db/supabase.ts` live; service-role key server-side only, RLS for direct access in `0002_rls.sql` + later migrations).
Legacy identifiers kept for compatibility: `bdfeast.*` localStorage keys, `bdf_pc` / `bdf_demo_session` cookies, `STRIPE_MEMBERSHIP_PRICE_ID`, deprecated `commission_delivery_bps/collection_bps` columns (aligned to 1000, unused by code), existing `BDF-` order references.
