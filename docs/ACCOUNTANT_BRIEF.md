# FeastQuarter — Briefing for the accountant (DRAFT)

Prepared 25 Nov 2026 from how the software actually behaves. Facts and questions only; no tax conclusions. Please correct anything wrong.

## 1. Business and status
UK online food-ordering marketplace (Bradford first). Restaurants deliver with their own drivers. Company incorporation and a Tide business account are **in progress**. FeastQuarter is **not VAT registered**. Payments run through Stripe Connect. Nothing has traded yet (test mode only).

## 2. Money flow
Customer pays FeastQuarter's Stripe account → Stripe transfers the restaurant's share to the restaurant's own connected account → FeastQuarter keeps an "application fee".

| | Example A: delivery | Example B: collection |
|---|---|---|
| Food | £25.00 | £25.00 |
| Restaurant's delivery charge | £3.00 | — |
| **Customer service fee** | £0.99 | £0.99 |
| **Customer pays** | **£28.99** | **£25.99** |
| FeastQuarter commission (10% of food) | £2.50 | £2.50 |
| Restaurant allocation | £25.50 | £22.50 |
| **FeastQuarter gross (commission + fee)** | **£3.49** | **£3.49** |
| Stripe fee (illustrative only; actual fees are read from Stripe) | ≈ £0.63 | ≈ £0.59 |
| Contribution before other costs | ≈ £2.86 | ≈ £2.90 |

- **Revenue streams:** (1) 10% commission on food (food net of restaurant-funded discounts; platform-funded promo discounts reduce the commission), (2) £0.99 customer fee. FeastQuarter Plus (£4.99/month) exists in the code but is **switched off**.
- **Pass-through, not revenue:** food, restaurants' delivery charges, tips.
- **Costs:** Stripe processing (borne by FeastQuarter; **not returned by Stripe on refunds**, so declined/cancelled orders cost the fee), other Stripe/Connect charges (entered manually in a ledger), hosting, etc. Courier cost: none yet (Uber Direct enquiry only; no agreement).
- **Refunds:** food/delivery/tip refunds reduce commission proportionally; a decline or cancellation refunds the £0.99 too (default).
- **Founding partners:** first N restaurants promised no joining fee (there is currently no joining fee for anyone).

## 3. What the software records (for your books)
Per order: food, delivery, tip, service fee, discounts (by who funds them), commission rate and amount, VAT fields (zero while unregistered), application fee, actual Stripe fee (read from Stripe's balance transaction, with estimates clearly marked until reconciled), refund breakdown (food/delivery/tip/service fee/commission returned), restaurant allocation, Stripe payout events. Admin exports (CSV): orders, transactions, refund audit, revenue by day/week/month/restaurant/city. The VAT-threshold monitor tracks FeastQuarter's own taxable income (commission + service fees + subscriptions) over a rolling 12 months against a configurable threshold (default £90,000 — please confirm the current figure).

## 4. VAT plumbing (configuration only, not a position)
`platform_vat_registered = false`. If registered, commission and service fee VAT can be set to none / inclusive / exclusive. "Exclusive" would raise the customer's price and needs explicit approval. No VAT invoice figures are produced while unregistered.

## 5. Questions for you
1. Company vs sole trader; accounting year-end; Corporation Tax registration timing; bookkeeping software that can ingest the CSVs.
2. **Principal vs agent:** how should FeastQuarter treat the customer payment (gross vs commission/fee only) in its accounts and for VAT?
3. **VAT:** is the 10% commission and the £0.99 customer fee standard-rated once registered, and should the fee be VAT-inclusive? When must we register, and does the "deemed supplier" regime for online marketplaces (currently reported as proposed from 2027; unverified by us) change the picture for food delivery?
4. Treatment of Stripe fees (including those not returned on refunds), Connect charges and chargeback losses.
5. **Courier fees** if Uber Direct is added: who should bear them, how to invoice/pass them on, VAT on them, and the effect on margin (a courier fee of around £5+ per delivery cannot come out of 10% + £0.99 on small orders).
6. **Tips:** confirm they are never FeastQuarter income, and how to evidence that.
7. Refund and dispute accounting; recovering disputed amounts from restaurants.
8. Founding-partner "no joining fee" and any future joining fee: VAT and revenue recognition.
9. Record-keeping and retention; payroll/director pay; expenses to claim; insurance.
10. A Stripe question for you or Stripe support: in test mode a £43.49 payment showed a £1.57 processing fee, more than the 1.5% + 20p illustration. Please help us understand the real fee schedule (card type, UK/EU/international, Connect charges) before we rely on the margins above.

## 6. Documents available
`README.md` (money model and Stripe notes), `PRODUCTION_READINESS.md` (VAT/marketplace notes), `LAUNCH_CHECKLIST.md`, sample CSV exports on request (test data).
