# FeastQuarter — Launch checklist (business and legal steps)

Status (25 Nov 2026): company registration and the Tide business account are **in progress** (owner is doing these). Everything else below is not started. Written 21 Nov 2026.

Related: `HOSTING.md` (Netlify test-site guide), `docs/SOLICITOR_BRIEF.md` and `docs/ACCOUNTANT_BRIEF.md` (drafts to hand to the professionals).
Items marked **(checked)** were verified against the linked source on that date; everything else is typical practice, so confirm it with the relevant provider. This is not legal, tax or financial advice.

## Before you start (decisions)
- [ ] Company or sole trader? Assumed: limited company (Stripe, Uber and the solicitor all expect a business entity). Ask the accountant — it affects tax and liability.
- [ ] Who are the directors and shareholders? Each director must prove their identity (see 1).
- [ ] Company name: check "FeastQuarter" is free on the Companies House name search, and that no one holds the trademark or domain.
- [ ] A UK address to register the company at (ask the accountant: home address or business address service).

## 1. Register the company  — IN PROGRESS (owner, with Tide)
- [ ] **Verify identity first (checked).** Mandatory for new directors and people with significant control since 18 Nov 2025, online via GOV.UK One Login; you receive a personal code. Formation agents can do it for you.
- [ ] **Register online (checked).** Companies House online fee is £100 (was £50 before 1 Feb 2026); usually completed within a day. https://www.gov.uk/limited-company-formation/register-your-company
- [ ] Ask the accountant for the right business activity (SIC) code for an online ordering platform.
- [ ] Keep the certificate of incorporation and company number (Stripe, the bank and Uber all ask for them).

## 2. Business bank account (after the company exists) — IN PROGRESS (Tide)
- [ ] Typical needs: ID for every director, proof of address, company number, a description of the business, expected turnover. Compare fees yourself.
- [ ] Never email the sort code / account number to anyone except the bank and Stripe.

## 3. Tax and accounts (accountant)
- [ ] Appoint an accountant. Bring the questions in PRODUCTION_READINESS.md §3 (VAT on the 10% commission and on the 99p service fee, deemed-supplier risk, Stripe fees on declined orders).
- [ ] Corporation Tax registration with HMRC once trading starts (accountant guides).
- [ ] VAT: stay unregistered unless the accountant advises otherwise; the app monitors the threshold (Admin → Settings / overview).

## 4. Stripe live account (needs 1 and 2 first)
- [ ] Update the FeastQuarter Stripe account with company details, director identity and the business bank account.
- [ ] No live keys go into the app until the owner explicitly approves, and only after the legal pages are reviewed.

## 5. Legal (solicitor)
- [ ] Customer terms, restaurant partner agreement (10% commission, 99p customer service fee, refunds, declined orders, tips for drivers/staff), privacy policy, allergen position, complaints process. Current legal pages are placeholders.
- [ ] Ask about consumer cancellation rules and whether FeastQuarter itself needs any registration beyond the restaurants'.

## 6. Other registrations and cover
- [ ] ICO data protection fee: not confirmed — check ico.org.uk (FeastQuarter will hold customers' names, emails and addresses).
- [ ] Food business registration is the **restaurants'** responsibility (checked): free, must be done at least 28 days before trading, cannot be refused. https://www.food.gov.uk/register-a-food-business · https://www.gov.uk/food-business-registration
- [ ] Business insurance: ask a broker what an online marketplace needs.

## 7. Technical launch (can be guided step by step)
- [ ] Hosting (Netlify) with environment variables and the daily scheduled job; domain (feastquarter.co.uk if bought); email sending (Resend + verified domain); Supabase backups; two live Stripe webhook endpoints.
- [ ] Uber Direct (optional courier): use the sign-up/intake form on https://merchants.ubereats.com/gb/en/services/uber-direct once company details and a live website exist. Contract is with Uber Eats UK Limited (https://www.uber.com/gb/en/legal/uber-direct---general-terms/). Decide with the accountant who pays the courier fee before agreeing anything.
- [ ] First 3–5 restaurants approved, onboarded in Stripe and test-ordered.
- [ ] Remaining app items: see PRODUCTION_READINESS.md (payout/dispute events, unexplained Stripe fee, email, leaked-password protection, key rotation, remove demo data).
