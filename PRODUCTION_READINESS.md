# FeastQuarter — Production readiness (honest status)

**Verdict: NOT ready for live payments or the first five restaurants yet.** The software is built and heavily unit-tested, but the critical end-to-end flow has only been run in *demo mode* and against *mocked* Stripe. Closing the blockers below is required first.
Legend: ✅ implemented & automatically tested · 🔧 implemented, needs external configuration/verification · ⛔ not implemented / blocked.

## 1. Blockers before the first five restaurants can trade
| # | Blocker | Owner |
|---|---|---|
| 1 | **Real end-to-end test in Stripe sandbox + Supabase**: onboard test restaurant → order → webhook marks paid → application fee = 10% food → accept → payout; refund (full/partial) incl. fee refund; decline→refund; dispute event; subscription off. *Never done against real Stripe in this codebase's tests (all mocked).* | Dev + you |
| 2 | **Merge the laptop's uncommitted Stripe "Accounts v2" onboarding change** (`src/lib/services/connect.ts`) — it exists only on your laptop; commit/push it, then re-run the sandbox test. | You/laptop Claude Code |
| 3 | **Apply migrations 0004–0007 to the live Supabase project** (additive, idempotent) and run `npm run live:check`. | You |
| 4 | **Legal/commercial:** solicitor-reviewed customer terms, restaurant partner agreement (commission, refunds, disputes, drivers), privacy policy, allergen position, complaints process. Current pages are **placeholders**. | Solicitor |
| 5 | **Tax:** accountant sign-off on VAT treatment of the 10% commission and of the marketplace model (see §3). | Accountant |
| 6 | **Business entity + business bank + Stripe account activation** (live mode, KYC/KYB, Connect platform review). Live keys need your explicit authorisation. | You |
| 7 | **Hosting env:** Netlify env vars incl. `CRON_SECRET`; two Stripe webhook endpoints; verified email domain (Resend) so order emails really send. | You/Dev |
| 8 | **Supabase backups:** free plan has no point-in-time recovery. Choose a paid plan or scheduled exports and test a restore before launch. | You |
| 9 | **Restaurant verification process** (food business registration, hygiene rating, ID) run by a human before each approval — the app enforces that the details are on file, not that they're true. | You |
| 10 | Replace/rotate the Supabase secret key that appeared in screenshots (Project Settings → API Keys). | You |

## 2. Feature status
### ✅ Implemented and tested (automated)
- Flat **10% commission** (delivery = collection), food-only; delivery fee & tips excluded; your £25/£3 and £25 examples; rounding; rate stored per order; admin-only, audited changes; historical orders unchanged. No joining/monthly/equipment/card fees for restaurants. **Fixed 99p customer service fee** on delivery and collection (Examples A £28.99 / B £25.99 tested), stored per order, in the single application fee, never transferred to the restaurant, admin-configurable and audited.
- Restaurant- vs platform-funded discounts, promo codes (incl. city-scoped), member discount only when the Plus flag is on; invariants `total = restaurant allocation + application fee`, fee ≥ 0.
- Exact refund allocation (food/delivery/tip/service fee), restaurant-share-only transfer reversal, `order_refunds` audit trail, service-fee refund on decline/timeout/fail, configurable customer-cancel policy (all mocked Stripe), declined-order refunds, duplicate-webhook and duplicate-order protection, amount-mismatch refusal, failed-payment handling, dispute recording, optional transfer-reversal recovery (mocked).
- Actual Stripe fee reconciliation from balance transactions (mocked), estimated-vs-actual separation, other-Stripe-costs ledger, net contribution, accountant-style breakdown (food, delivery, tips, gross, refunds, restaurant allocation, commission, VAT, processing, taxable revenue).
- VAT configuration (`platform_vat_registered=false`, no VAT on commission while unregistered; inclusive/exclusive plumbing), rolling 12-month threshold monitor with watch/urgent/exceeded alerts.
- FeastQuarter Plus feature flag (OFF), membership records preserved, nothing auto-cancelled.
- Online/Offline, preparation time, duplicate-accept prevention, tenant isolation, unanswered-order escalation → auto-decline → full refund → restaurant offline, status labels (Delivered/Collected/Ready for collection).
- Payout records from verified `payout.*` events; live-balance reads (mocked); weekly-payout setter (mocked).
- Multi-city: DB-driven cities, a Leeds restaurant joins via the same system and goes live when its city is activated; collection never offered across cities.
- Courier abstraction: all providers disabled, zero network calls, no subsidy unless authorised.
- Rate limiting (best-effort), SMS backup (off by default; mocked), secret-exposure and admin-guard static checks, demo restaurants blocked in live mode.
- Reorder, refund requests, QR codes, referral/campaign attribution, share links, tips, price-transparency note.

### 🔧 Implemented, awaiting external configuration/verification
Stripe Connect onboarding/Checkout/webhooks in the real sandbox · Supabase migrations on the live project · Resend email (until `RESEND_API_KEY` is set every email is logged **skipped**) · optional Twilio SMS (chargeable; needs your approval) · Netlify scheduled functions (`CRON_SECRET`) · `feastquarter.co.uk` (not assumed owned) · weekly payout schedule (Stripe may refuse for some account types).

### ⛔ Not implemented / blocked
- **Browser/device push notifications** (needs VAPID keys, push service worker, subscription storage).
- **Real-time via websockets**: dashboards poll every few seconds (fine for 5 restaurants; Supabase Realtime is the upgrade path).
- **Regional administrator permissions** (only admin/restaurant/customer roles exist).
- **Content-Security-Policy header** (not set), distributed rate limiting, CAPTCHA, penetration test.
- **Third-party courier adapters** (by design; need commercial agreements).
- **Official VAT invoices / restaurant statements** (not generated; records exist for an accountant).
- Automated **browser end-to-end tests in CI** (a manual Playwright click-through was used during development).

## 3. Tax and compliance review required (do not rely on this document)
**VAT registration threshold.** Public guidance reports £90,000 rolling-12-month taxable turnover for registration (£88,000 for deregistration), unchanged from April 2026. The threshold is a configurable setting; confirm the current figure on gov.uk. The monitor tracks *FeastQuarter's own* taxable income (commission + memberships), **not** customers' food payments. HMRC also applies a forward-looking 30-day test the monitor does not model.
Sources: [Simply Business guide](https://www.simplybusiness.co.uk/knowledge/articles/2022/03/what-is-the-vat-threshold-small-business/), [Avask 2026 summary](https://avask.com/blog/uk-vat-threshold-2026/) (commercial sites — verify with HMRC).

**Online-marketplace VAT (2027).** HMRC/HM Treasury consulted (23 June–18 August 2026) on extending "deemed supplier" rules for online marketplaces to UK-established sellers, and the consultation reportedly singles out online food delivery. One source says Budget 2026 confirmed implementation from **October 2027** with a £90,000 per-platform threshold; others still describe it as a consultation, and I found no final legislation. **If a deemed-supplier regime applied to food delivery, FeastQuarter could become responsible for VAT on restaurants' food sales — a very different position from "commission only".** This must be assessed by a VAT adviser *before* launch and monitored. The code does not assume any treatment: it keeps food sales, delivery, tips, commission, processing costs, refunds, payouts and taxable platform revenue as separate ledgers.
Sources: [Osborne Clarke](https://www.osborneclarke.com/insights/uk-government-consults-extending-vat-liability-rules-online-marketplaces), [VAT Update, 13 Jul 2026](https://www.vatupdate.com/2026/07/13/hmrc-consults-on-extending-deemed-supplier-rules-to-uk-online-marketplace-sellers/), [VAT Update, 10 Sep 2026](https://www.vatupdate.com/2026/09/10/uk-considers-marketplace-vat-liability-extension-for-domestic-sellers/), [Deloitte Budget 2026](https://taxscape.deloitte.com/measures-budget-2026/extending-vat-online-marketplace-liability-to-combat-non-compliance.aspx), [BRC response](https://brc.org.uk/news-and-events/news/finance/2026/gated/brc-response-to-the-consultation-on-extending-vat-liability-to-online-marketplaces/).

**Questions for the accountant:** principal vs agent analysis of the platform; VAT on commission when registered (inclusive vs exclusive contracts); treatment of Stripe fees; whether FeastQuarter must register or is a deemed supplier; record-keeping/invoicing; corporation/income tax on contribution.
**Questions for the solicitor:** platform's intermediary role and consumer-law duties (price transparency, cancellation rights, complaints), restaurant agreement and recovery of disputed amounts, allergen responsibility, food-business/FSA position of a delivery platform, UK GDPR (controller/processor roles, ICO fee/registration, retention, DPAs with Supabase/Stripe/Resend/Twilio, international transfers — the Supabase project is in an EU region), marketing consent (PECR), brand/trademark clearance for "FeastQuarter" and the domain.

## 4. Verification log
- Fee liability, refund/dispute mechanics and `on_behalf_of` behaviour read from Stripe's current *Create destination charges* and *Handle refunds and disputes* docs (see README).
- Automated tests: `npm test` (unit + service-level, in-memory DB, **Stripe/Resend/Twilio mocked**). Production build: `npm run build`. Typecheck: `npm run typecheck`. No separate linter is configured; TypeScript strict mode is the static check.
- Manual demo-mode click-through of customer → restaurant → admin flows (earlier phases). **No live-Stripe end-to-end test has been run from this codebase's test suite.**

## 5. Launch-day checklist (after blockers are closed)
1. `npm run live:check` all green (except the webhook line until the live URL exists).
2. Admin → Locations: Bradford active only. Admin → Settings: commission 10%, Plus OFF, VAT registered = false.
3. Approve a restaurant (human checks hygiene/food registration) → it completes Stripe onboarding → goes Online.
4. Place a £1 test order with a real card in **live** mode only after you authorise live keys; refund it; confirm payout/fee records.
5. Watch the escalation emails and the VAT monitor weekly.
