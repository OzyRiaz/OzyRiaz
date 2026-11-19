// Row types mirror the Postgres schema (snake_case) so the same code runs on the
// in-memory demo store and on Supabase with no mapping layer.

export type Role = 'customer' | 'restaurant' | 'admin';
export type Fulfilment = 'delivery' | 'collection';
export type RestaurantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_failed'
  | 'awaiting_restaurant'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  suspended: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface OpeningPeriod { open: string; close: string } // "HH:MM" 24h
export type OpeningHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', OpeningPeriod[]>;

export interface MemberOffer {
  enabled: boolean;
  percent: number; // 0-100
  min_spend_pence: number;
  description: string;
}

export interface Restaurant {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string;
  cuisines: string[];
  address_line1: string;
  postcode: string;
  city_slug: string;
  phone: string | null;
  email: string | null;
  image_url: string | null;
  status: RestaurantStatus;
  is_demo: boolean;
  featured: boolean;
  opening_hours: OpeningHours;
  min_order_pence: number;
  prep_minutes: number;
  delivery_enabled: boolean;
  collection_enabled: boolean;
  member_offer: MemberOffer;
  accepting_orders: boolean; // Online / Offline switch controlled by the restaurant
  legal_name: string | null;
  company_number: string | null;
  vat_registered: boolean; // the RESTAURANT's own VAT status (separate from FeastQuarter's)
  vat_number: string | null;
  food_business_reg: string | null; // local-authority food business registration reference
  food_hygiene_rating: number | null; // 0-5
  food_hygiene_authority: string | null;
  referred_by: string | null; // referral attribution
  stripe_account_id: string | null;
  stripe_details_submitted: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  created_at: string;
}

export interface RestaurantStaff { id: string; restaurant_id: string; user_id: string; role: 'owner' | 'manager' | 'staff'; created_at: string }

export interface MenuCategory { id: string; restaurant_id: string; name: string; sort: number }

export interface OptionChoice { id: string; name: string; price_pence: number }
export interface OptionGroup {
  id: string;
  name: string;
  min: number; // 0 = optional
  max: number; // max selections
  choices: OptionChoice[];
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  price_pence: number;
  image_url: string | null;
  available: boolean;
  allergens: string[]; // see lib/allergens.ts
  allergen_info_confirmed: boolean;
  dietary: string[];
  option_groups: OptionGroup[];
  sort: number;
}

export interface DeliveryArea {
  id: string;
  restaurant_id: string;
  name: string;
  postcode_prefixes: string[]; // outward codes ("BD5") or sectors ("BD5 0")
  fee_pence: number;
  min_order_pence: number | null;
}

export interface Address { id: string; user_id: string; label: string; line1: string; line2: string | null; city: string; postcode: string }

export interface OrderLine {
  item_id: string;
  name: string;
  qty: number;
  unit_price_pence: number; // includes option extras
  options: { group: string; choice: string; price_pence: number }[];
  option_ids?: string[]; // chosen choice ids (lets "order again" rebuild the line)
  note?: string | null;
  allergens: string[];
}

export interface Order {
  id: string;
  reference: string;
  customer_id: string;
  restaurant_id: string;
  idempotency_key: string;
  fulfilment: Fulfilment;
  status: OrderStatus;
  payment_status: PaymentStatus;
  lines: OrderLine[];
  subtotal_pence: number;
  delivery_fee_pence: number;
  discount_pence: number; // total customer discount (restaurant + platform funded)
  discount_label: string | null;
  discount_funded_by_restaurant_pence: number;
  discount_funded_by_platform_pence: number;
  promo_code: string | null;
  tip_pence: number; // tips are never commissionable
  total_pence: number;
  commission_bps: number;
  commission_pence: number; // gross commission before platform-funded discount
  commission_vat_pence: number; // 0 while FeastQuarter is not VAT registered
  stripe_fee_pence: number | null; // ACTUAL Stripe processing fee from Stripe's balance transaction (null until reconciled)
  ready_in_minutes: number | null; // preparation time chosen by the restaurant on acceptance
  accepted_at: string | null;
  escalated_at: string | null; // set when the unanswered-order reminder/escalation fired
  source: string | null; // campaign attribution
  campaign: string | null;
  application_fee_pence: number; // what FeastQuarter actually collects via Stripe
  restaurant_net_pence: number;
  delivery_address: { line1: string; line2?: string | null; city: string; postcode: string } | null;
  customer_note: string | null;
  contact_phone: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  rejection_reason: string | null;
  refunded_pence: number;
  history: { status: OrderStatus; at: string; by?: string }[];
  created_at: string;
  paid_at: string | null;
}

export interface Membership {
  id: string;
  user_id: string;
  status: 'incomplete' | 'active' | 'past_due' | 'cancelled';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface Promotion {
  id: string;
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  value: number; // percent (0-100) or pence
  min_spend_pence: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  funded_by: 'platform' | 'restaurant';
  restaurant_id: string | null; // null = any restaurant
  city_slug: string | null; // null = any city
  created_at: string;
}

export interface PlatformSettings {
  id: string; // always 'main'
  /** Flat commission on the FOOD subtotal for delivery AND collection, in basis points (1000 = 10%). Includes standard card processing. */
  commission_bps: number;
  /** FeastQuarter's own VAT status. Restaurants' VAT status is separate (restaurants.vat_registered). */
  platform_vat_registered: boolean;
  vat_threshold_pence: number; // rolling 12-month registration threshold used for monitoring — verify against current HMRC figure
  vat_rate_bps: number; // 2000 = 20%
  /** If registered: none | inclusive (commission already includes VAT) | exclusive (VAT added on top of commission). */
  commission_vat_mode: 'none' | 'inclusive' | 'exclusive';
  /** Feature flag. FeastQuarter Plus is OFF at launch until the owner authorises it. */
  feature_plus_enabled: boolean;
  membership_price_pence: number;
  membership_benefits: string[];
  member_discount_funding: 'restaurant' | 'platform';
  member_discount_max_percent: number;
}

export interface StripeEvent { id: string; type: string; received_at: string }

export type TxKind = 'order_payment' | 'application_fee' | 'stripe_fee' | 'refund' | 'membership_payment' | 'payment_failed' | 'dispute';
export interface Transaction {
  id: string;
  kind: TxKind;
  order_id: string | null;
  user_id: string | null;
  restaurant_id: string | null;
  amount_pence: number; // signed: refunds negative
  status: 'succeeded' | 'failed' | 'pending' | 'open' | 'closed';
  stripe_ref: string | null;
  note: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  kind: string;
  to_email: string;
  subject: string;
  body: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  detail: string | null;
  created_at: string;
}

export interface SupportTicket { id: string; user_id: string | null; email: string; subject: string; message: string; status: 'open' | 'closed'; created_at: string }

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: Role;
  restaurantIds: string[]; // restaurants this user may manage
}
