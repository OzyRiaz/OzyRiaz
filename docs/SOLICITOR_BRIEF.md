# FeastQuarter — Briefing for the solicitor (DRAFT)

Prepared 25 Nov 2026 from how the software actually behaves. It states facts and asks questions; it makes **no legal conclusions**. Anything marked "placeholder" is not yet reviewed. Please correct any statement of fact that is wrong.

## 1. The business in one paragraph
FeastQuarter is a UK online food-ordering marketplace launching in Bradford (other cities later). Customers order delivery or collection from independent restaurants on FeastQuarter's website/PWA. Each **restaurant delivers with its own drivers** and sets its own delivery area, delivery charge, menu and prices. FeastQuarter does not employ drivers. The company is being incorporated (status: in progress) with a business bank account at Tide. Hosting: Netlify. Database: Supabase (EU region). Payments: Stripe Connect.

## 2. How money moves (facts)
- The customer pays **FeastQuarter's Stripe account** by card (Stripe Checkout). Stripe then **transfers the restaurant's share to the restaurant's own Stripe connected account** (a "destination charge"). Customers' card statements show FeastQuarter (not the restaurant) by default.
- **Restaurant commission:** a flat **10% of the food subtotal**, delivery and collection alike. Standard card-processing fees are included in that 10% (FeastQuarter bears Stripe's fees). Delivery charges and tips are **not** commissionable.
- **Customer service fee:** a fixed **£0.99 per order** (delivery and collection), paid by the customer to FeastQuarter, shown as its own line in the basket and at checkout and on the receipt, included in the total. It is **not** shared with or deducted from the restaurant, and is not commissionable. The fee and the commission rate are admin-configurable; each order stores the rate/fee it was charged at, and changes apply to new orders only.
- **Restaurant offer text (website):** "10% commission on delivery and collection orders. Standard card processing included. No joining fee or monthly subscription." plus a note about the separate customer fee.
- **Tips:** paid with the order to the restaurant's Stripe account; the customer-facing label says the tip goes to the restaurant and its team, including drivers. FeastQuarter does not pay tips to individual drivers.
- **Planned "founding partner" promise (not yet public):** the first N restaurants (N to be fixed, e.g. 10) are promised no joining fee. An internal admin tick records who qualifies. No wording is published.
- **Optional couriers:** all third-party courier integrations are switched off. An enquiry to Uber Direct (UK) is open; **no agreement, no pricing, no integration**. The website must not imply otherwise.

## 3. Refunds and cancellations (as built)
- Restaurant declines / does not answer within 12 minutes / cannot fulfil → customer refunded **in full including the £0.99**; the restaurant's share is reversed from its Stripe account; FeastQuarter returns its commission. Stripe does not return its own processing fee, so FeastQuarter bears that cost.
- **Customer cancellation:** a customer may cancel a paid order **only before the restaurant accepts it**; refund per an admin setting (default: full, including the £0.99).
- After acceptance: customers can submit a refund request (reviewed by an admin); partial refunds are allocated food → delivery → tip, with commission reduced in proportion to food refunded.
- Disputes/chargebacks: recorded; an admin-only, capped action can recover the disputed amount from a restaurant (contract decision; never automatic).
- Every refund is stored with a full breakdown (audit table + CSV).

## 4. Data we hold (UK GDPR)
Customer: name, email, phone, saved delivery addresses, order history, support messages. Restaurant: legal name, company/food-business registration, hygiene rating, VAT number if any, staff accounts. Marketing attribution (source/campaign) is captured from links and QR codes. Browser storage: a session cookie, a saved basket and postcode. There are account export and account deletion features. No email is sent until an email provider is configured. Payment card data is handled by Stripe only; FeastQuarter never sees or stores it.

## 5. Questions for you
**A. Contracts and consumer law**
1. Who is the seller of the food (restaurant) and who contracts for the service (FeastQuarter)? How should the customer terms say so, and where should the restaurant's name and trading details appear?
2. Is it acceptable to charge a **mandatory fixed fee (£0.99)** that is shown on the restaurant page, in the basket and at checkout but not inside each menu price? Do the current rules on unavoidable fees / "drip pricing" require it to be included in the first price shown?
3. Cancellation rights for food orders (perishable goods) and the refund promises above: please review the wording; is "cancel only before the restaurant accepts" fine for consumers?
4. Allergens: the checkout has an allergen notice tick-box and menus show restaurant-supplied allergen text. What position should the terms and partner agreement take?
5. Complaints process and what we must display.

**B. Restaurant partner agreement (needs drafting)**
6. Commission (10%, food only, card processing included), the £0.99 customer fee, no joining/monthly fee, founding-partner promise (how to word "first N restaurants", whether it lasts for life), changes to fees on notice, payouts via Stripe, refunds/declines and the reversal of the restaurant's share, chargebacks and recovery, own-driver responsibility (insurance, licensing, hot-food handling), food-safety registration (restaurants are responsible), data-protection roles, termination.
7. **Tips:** the restaurant's duty under the Employment (Allocation of Tips) Act 2023; how the agreement and the checkout label should reflect it.

**C. Payments and regulation**
8. FeastQuarter takes the customer's card payment and passes the restaurant's share on through Stripe Connect. Please confirm no separate FCA authorisation or exemption analysis is needed beyond Stripe's own, or tell us what is needed.
9. If Uber Direct (or another courier) is added: who contracts with the courier, who bears liability for late/cold/failed deliveries, and who pays the courier fee.

**D. Privacy and website**
10. Privacy policy, cookie/storage notice, retention periods, processors (Supabase, Stripe, Netlify, Resend, optional Twilio), international transfers.
11. Terms of use and the placeholder legal pages in `src/app/legal/` — please replace.
12. ICO registration/fee: is it required for us?

## 6. Documents available
`README.md` (money model), `PRODUCTION_READINESS.md`, `LAUNCH_CHECKLIST.md`, the current legal placeholders (`src/app/legal/[doc]/page.tsx`), and a demo reel of the restaurant dashboard (sample data only).

## AI menu reading (optional feature, off by default)
If enabled, uploaded menu photos/PDFs/text are sent to Anthropic's API to extract dishes and prices. No customer personal data is sent. Please advise on privacy notice wording and the restaurant terms (restaurant remains responsible for allergen information).
