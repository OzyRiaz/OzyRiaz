# FeastQuarter — Hosting guide (Netlify, TEST mode)

Status: prepared, **not yet done**. Written 25 Nov 2026. Nothing here buys anything or switches anything live.

**Goal:** get the app running online at a temporary `*.netlify.app` address with Supabase and Stripe in **test mode**, so we can prove the whole flow (including the order-timeout job) away from the laptop.

**What stays OFF in this guide:** live Stripe keys, real payments, the custom domain (feastquarter.co.uk), email sending, SMS, couriers, FeastQuarter Plus.

**Never** paste a key into a chat, an email or a screenshot. Keys go only into Netlify's environment-variable screen (and your own `.env.local`). If a key is ever shown by accident, rotate it.

---

## 0. Before you start
- [ ] Netlify login (existing one is fine). Create a **separate team** for FeastQuarter (Netlify → team switcher → "Add new team"). Check Netlify's pricing page for what the free plan allows; do not upgrade without a deliberate decision.
- [ ] The GitHub login that owns the repository (`OzyRiaz/OzyRiaz`). When Netlify asks which repositories it may access, tick **only** the FeastQuarter repository.
- [ ] Supabase project `feastquarter` open (Project Settings → API) and the Stripe **sandbox** dashboard open.
- [ ] Migrations 0001–0009 applied to Supabase (they are, as of 25 Nov 2026). `npm run live:check` on your laptop will confirm.

## 1. Create the site
1. In the FeastQuarter team: **Add new project → Import an existing project → GitHub** → choose the repository.
2. **Branch to deploy:** use `claude/intelligent-gates-k45p76` for the test site (no merge needed). Later, merge to your main branch through a pull request and switch Netlify to it.
3. Build settings are read from `netlify.toml`: build command `npm run build`, Node 22, the Next.js plugin. Leave the defaults.
4. **Do not click Deploy yet** — add the environment variables first (step 2), otherwise the first build fails or starts in the wrong mode.

## 2. Environment variables (Site configuration → Environment variables)
Names only — values come from your own screens. Use "secret"/"contains secret values" where Netlify offers it so they are hidden in build logs.

| Name | Value comes from | Secret? |
|---|---|---|
| `APP_MODE` | type `live` | no |
| `NEXT_PUBLIC_APP_URL` | the site's `https://<name>.netlify.app` address (set after the first deploy, then redeploy) | no |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API (publishable/anon key) | no (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (secret key) | **yes** |
| `SUPABASE_STORAGE_BUCKET` | type `menu-images` | no |
| `STRIPE_SECRET_KEY` | Stripe **sandbox** → Developers → API keys (`sk_test_…`) | **yes** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same page (`pk_test_…`) | no |
| `STRIPE_WEBHOOK_SECRET` | step 4 below (`whsec_…`) | **yes** |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | step 4 below (`whsec_…`) | **yes** |
| `STRIPE_USE_ON_BEHALF_OF` | type `false` | no |
| `CRON_SECRET` | make your own, 16+ characters (below) | **yes** |
| `ORDER_ESCALATE_MINUTES` / `ORDER_TIMEOUT_MINUTES` / `ORDER_TIMEOUT_GOES_OFFLINE` | `5` / `12` / `true` | no |
| `COURIER_SUBSIDY_AUTHORISED` | type `false` | no |

**Leave unset for now:** `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`, `SMS_*`, `TWILIO_*`, `STRIPE_MEMBERSHIP_PRICE_ID`, `DEMO_SESSION_SECRET` (demo mode only).

**Making a CRON_SECRET** (Windows PowerShell, prints a 64-character random value — copy it straight into Netlify):
```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Only variables starting `NEXT_PUBLIC_` are visible in the browser, and only the Supabase anon key, the Stripe publishable key and the site URL use that prefix. Everything else stays on the server.

## 3. First deploy, then fix the URL
1. Deploy. When it finishes you get `https://<name>.netlify.app`.
2. Put that address into `NEXT_PUBLIC_APP_URL` and **trigger a redeploy** (environment changes only apply to new builds).
3. **Supabase → Authentication → URL Configuration:** set **Site URL** to the same address and add it to **Redirect URLs**. Without this, sign-up confirmation and password-reset links point at the wrong place.
4. Open the site. Check: home page loads, `/offline` loads, you can sign in, the demonstration restaurants are **not** orderable (live mode blocks them), the header shows no "Demonstration mode" banner.

## 4. Stripe webhooks (sandbox / test mode) — two endpoints
Both point at `https://<name>.netlify.app/api/stripe/webhook`. In the Stripe sandbox: Developers → Webhooks → Add endpoint.
1. **"Your account" events** → copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.updated`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
2. **"Connected accounts" events** (a separate endpoint, same URL) → copy its secret into `STRIPE_CONNECT_WEBHOOK_SECRET`. Events: `account.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`.
3. Redeploy so the new secrets apply.
4. Stop using the laptop's `stripe listen` while testing the hosted site, otherwise events are delivered twice (the app ignores duplicates, but it makes logs confusing).

## 5. The two scheduled jobs
Netlify → Functions: `order-timeouts` (every 5 minutes: reminds restaurants, then auto-declines and refunds orders unanswered after `ORDER_TIMEOUT_MINUTES`) and `daily-summary` (admin sales summary; sends mail only once email is configured). Both need `CRON_SECRET`; Netlify supplies the site `URL` itself. Open each function's log and confirm a recent run shows status `200`. A `401` means `CRON_SECRET` is missing or shorter than 16 characters.

## 6. Test plan on the hosted site
- [ ] Register a **new customer** account and confirm the email link opens the hosted site (not localhost).
- [ ] Sign in as the restaurant owner; make sure opening hours cover now and the restaurant is online and Stripe-complete.
- [ ] Order (delivery and collection): total includes the £0.99 service fee; pay with `4242 4242 4242 4242`; the order turns "Waiting for restaurant" (proves the webhook).
- [ ] Accept → prepare → complete. Cancel another before acceptance (full refund). Reject another (full refund).
- [ ] **Timeout job:** temporarily set `ORDER_ESCALATE_MINUTES=1` and `ORDER_TIMEOUT_MINUTES=3`, redeploy, place an order and leave it. Within ~8 minutes (the job runs every 5) it should be declined, refunded in full including the 99p, and the restaurant set offline. **Then put the values back to 5 and 12.**
- [ ] Check Admin → Reports → Refund audit and Stripe's Transactions agree.
- [ ] Offline page: with the site open on a phone, switch airplane mode on and open another page.
- [ ] Run `npm run live:check` locally against the same Supabase project.

## 7. Undoing it (nothing is deleted)
- Pause or unpublish the Netlify site; or "Deploy → Publish deploy" on an earlier build to roll back.
- Delete the two Stripe sandbox endpoints.
- Remove the environment variables. Supabase data is untouched.

## 8. Before ANY real launch (not part of this guide)
Custom domain and `NEXT_PUBLIC_APP_URL`, email provider and verified domain, live Stripe keys (only on the owner's explicit approval, after legal and tax review), Supabase backups, removing/hiding demo data, leaked-password protection, key rotation. See `LAUNCH_CHECKLIST.md` and `PRODUCTION_READINESS.md`.

## Known unknowns
- Netlify's current plan limits and prices for a second team and for scheduled functions: check their pricing page.
- How Netlify shares one GitHub connection between two teams: check on screen; do not connect repositories that are not FeastQuarter.
