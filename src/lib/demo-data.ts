/**
 * DEMONSTRATION CONTENT ONLY.
 * Every restaurant, menu, price and review-style detail here is fictional and exists so the
 * product can be developed and demoed. Nothing here represents a real business or partnership.
 */
import { createHash } from 'node:crypto';
import type { Db } from './db/types';
import { hashPassword } from './password';
import { computeTotals, priceLine } from './pricing';
import type { MenuItem, OptionGroup, Restaurant } from './types';

/** Stable ids so demo sign-in cookies survive a dev-server restart. */
const stableId = (email: string) => { const h = createHash('sha1').update('feastquarter-demo:' + email).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export const DEMO_PASSWORD = 'DemoPass123!';
export const DEMO_ACCOUNTS = {
  admin: 'admin@demo.feastquarter.test',
  customer: 'customer@demo.feastquarter.test',
  member: 'member@demo.feastquarter.test',
  owner: 'owner.karahi@demo.feastquarter.test',
  owner2: 'owner.smokehouse@demo.feastquarter.test',
};

export const DEFAULT_SETTINGS = {
  id: 'main',
  commission_bps: 1000, // flat 10% on food for delivery AND collection; includes standard card processing
  platform_vat_registered: false,
  vat_threshold_pence: 9000000, // £90,000 — verify against current HMRC guidance
  vat_rate_bps: 2000,
  commission_vat_mode: 'none',
  feature_plus_enabled: false, // FeastQuarter Plus is OFF at launch
  membership_price_pence: 499,
  membership_benefits: [
    'Access to member-only discounts at participating restaurants',
    'Exclusive offers set by restaurants and FeastQuarter',
    'Cancel any time — no minimum term',
  ],
  member_discount_funding: 'restaurant',
  member_discount_max_percent: 20,
};

const grp = (id: string, name: string, min: number, max: number, choices: [string, number][]): OptionGroup => ({
  id, name, min, max, choices: choices.map(([n, p], i) => ({ id: `${id}-${i}`, name: n, price_pence: p })),
});

type ItemSpec = [name: string, desc: string, pence: number, allergens: string[], dietary: string[], opts?: OptionGroup[]];
interface RSpec {
  slug: string; name: string; desc: string; cuisines: string[]; line1: string; postcode: string; featured?: boolean;
  status?: Restaurant['status']; delivery?: boolean; collection?: boolean; min: number; prep: number; memberPct?: number;
  areas: { name: string; prefixes: string[]; fee: number; min?: number | null }[];
  menu: Record<string, ItemSpec[]>; owner?: string;
}

const SPICE = grp('spice', 'Spice level', 1, 1, [['Mild', 0], ['Medium', 0], ['Hot', 0], ['Extra hot', 0]]);
const SIDE = (id: string) => grp(id, 'Add extras', 0, 3, [['Extra naan', 180], ['Raita', 150], ['Side salad', 200]]);

const RESTAURANTS: RSpec[] = [
  {
    slug: 'karahi-lane-demo', name: 'Karahi Lane', cuisines: ['Indian', 'Pakistani'], featured: true, owner: DEMO_ACCOUNTS.owner,
    desc: 'Slow-cooked karahis, sizzling grills and fresh naan. (Demonstration restaurant)', line1: '1 Example Street', postcode: 'BD5 0AA',
    min: 1500, prep: 30, memberPct: 10,
    areas: [{ name: 'Central Bradford', prefixes: ['BD1', 'BD3', 'BD4', 'BD5', 'BD7', 'BD8'], fee: 250 }, { name: 'Outer areas', prefixes: ['BD2', 'BD9', 'BD10'], fee: 400, min: 2000 }],
    menu: {
      Starters: [
        ['Samosa chaat', 'Crisp samosas, chickpeas, yoghurt and tamarind.', 450, ['cereals containing gluten', 'milk'], ['vegetarian']],
        ['Chicken tikka starter', 'Charcoal-grilled marinated chicken, 4 pieces.', 595, ['milk'], ['halal']],
        ['Onion bhaji (4)', 'Gram flour fritters, mint dip.', 395, [], ['vegan', 'vegetarian']],
      ],
      Karahi: [
        ['Chicken karahi', 'Tomato, ginger and green chilli, on the bone.', 1195, ['milk'], ['halal'], [SPICE, SIDE('s1')]],
        ['Lamb karahi', 'Slow-cooked lamb with fresh coriander.', 1395, ['milk'], ['halal'], [SPICE, SIDE('s2')]],
        ['Paneer karahi', 'Peppers, onions and spiced tomato gravy.', 1095, ['milk'], ['vegetarian'], [SPICE]],
      ],
      Grill: [
        ['Mixed grill platter', 'Seekh kebab, tikka, lamb chop, naan.', 1695, ['cereals containing gluten', 'milk'], ['halal']],
        ['Seekh kebab (2)', 'Minced lamb skewers.', 750, ['mustard'], ['halal']],
      ],
      'Breads & rice': [
        ['Garlic naan', 'Tandoor baked.', 320, ['cereals containing gluten', 'milk'], ['vegetarian']],
        ['Pilau rice', 'Fragrant basmati.', 340, [], ['vegan', 'vegetarian']],
      ],
      Drinks: [['Mango lassi', 'Chilled yoghurt drink.', 350, ['milk'], ['vegetarian']], ['Cola 330ml', '', 150, [], ['vegan']]],
    },
  },
  {
    slug: 'smokehouse-grill-demo', name: 'Smokehouse Grill', cuisines: ['Burgers', 'Chicken'], featured: true, owner: DEMO_ACCOUNTS.owner2,
    desc: 'Smash burgers, fried chicken and loaded fries. (Demonstration restaurant)', line1: '2 Example Road', postcode: 'BD1 1AA',
    min: 1200, prep: 25, memberPct: 15,
    areas: [{ name: 'City centre & surrounds', prefixes: ['BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD7'], fee: 199 }],
    menu: {
      Burgers: [
        ['Classic smash burger', 'Two beef patties, cheese, pickles, house sauce.', 925, ['cereals containing gluten', 'milk', 'eggs', 'mustard', 'sesame'], [], [grp('bx', 'Extras', 0, 3, [['Bacon', 150], ['Extra patty', 250], ['Jalapeños', 80]])]],
        ['Crispy chicken burger', 'Buttermilk chicken, slaw, mayo.', 895, ['cereals containing gluten', 'milk', 'eggs', 'sesame'], []],
        ['Plant burger', 'Plant patty, vegan cheese, lettuce.', 925, ['cereals containing gluten', 'soya', 'sesame'], ['vegan', 'vegetarian']],
      ],
      Chicken: [
        ['6 wings', 'Choose a sauce.', 650, [], ['halal'], [grp('wing', 'Sauce', 1, 1, [['Hot honey', 0], ['BBQ', 0], ['Lemon pepper', 0]])]],
        ['Tenders box (5)', 'With dip.', 750, ['cereals containing gluten', 'milk', 'eggs'], []],
      ],
      Sides: [
        ['Fries', 'Skin-on, sea salt.', 300, [], ['vegan', 'vegetarian']],
        ['Loaded fries', 'Cheese sauce, jalapeños, crispy onions.', 495, ['milk', 'cereals containing gluten'], ['vegetarian']],
      ],
      Shakes: [['Chocolate shake', 'Thick and cold.', 450, ['milk'], ['vegetarian']]],
    },
  },
  {
    slug: 'bella-strada-demo', name: 'Bella Strada Pizzeria', cuisines: ['Pizza', 'Italian'], featured: true,
    desc: 'Stone-baked pizza and fresh pasta. (Demonstration restaurant)', line1: '3 Example Lane', postcode: 'BD7 1AA', min: 1500, prep: 30, memberPct: 10,
    areas: [{ name: 'West Bradford', prefixes: ['BD5', 'BD6', 'BD7', 'BD8', 'BD9', 'BD13'], fee: 299 }],
    menu: {
      Pizza: [
        ['Margherita', 'Tomato, mozzarella, basil.', 975, ['cereals containing gluten', 'milk'], ['vegetarian'], [grp('sz', 'Size', 1, 1, [['10 inch', 0], ['12 inch', 300], ['14 inch', 600]]), grp('tp', 'Extra toppings', 0, 4, [['Mushrooms', 100], ['Pepperoni', 150], ['Olives', 100], ['Extra cheese', 150]])]],
        ['Diavola', 'Spicy salami, chilli, mozzarella.', 1195, ['cereals containing gluten', 'milk'], [], [grp('sz2', 'Size', 1, 1, [['10 inch', 0], ['12 inch', 300], ['14 inch', 600]])]],
        ['Vegana', 'Roast veg, tomato, vegan cheese.', 1150, ['cereals containing gluten'], ['vegan', 'vegetarian']],
      ],
      Pasta: [
        ['Spaghetti carbonara', 'Guanciale, egg, pecorino.', 1150, ['cereals containing gluten', 'eggs', 'milk'], []],
        ['Penne arrabbiata', 'Chilli tomato sauce.', 995, ['cereals containing gluten'], ['vegan', 'vegetarian']],
      ],
      Desserts: [['Tiramisu', 'Classic.', 550, ['eggs', 'milk', 'cereals containing gluten'], ['vegetarian']]],
    },
  },
  {
    slug: 'golden-wok-demo', name: 'Golden Wok', cuisines: ['Chinese', 'Asian'],
    desc: 'Wok-fired favourites and crispy starters. (Demonstration restaurant)', line1: '4 Example Close', postcode: 'BD3 8AA', min: 1400, prep: 25, memberPct: 10,
    areas: [{ name: 'East & central', prefixes: ['BD1', 'BD2', 'BD3', 'BD4', 'BD5'], fee: 250 }],
    menu: {
      Mains: [
        ['Sweet & sour chicken', 'Battered chicken, pineapple, peppers.', 895, ['cereals containing gluten', 'eggs', 'soya'], []],
        ['Beef in black bean sauce', '', 995, ['soya', 'cereals containing gluten'], []],
        ['Vegetable chow mein', '', 795, ['cereals containing gluten', 'soya', 'eggs'], ['vegetarian']],
      ],
      Starters: [['Crispy seaweed', '', 495, [], ['vegan', 'vegetarian']], ['Spring rolls (4)', '', 450, ['cereals containing gluten', 'soya'], ['vegan', 'vegetarian']]],
      Rice: [['Egg fried rice', '', 350, ['eggs', 'soya'], ['vegetarian']]],
    },
  },
  {
    slug: 'fish-quay-demo', name: 'The Fish Quay', cuisines: ['Fish & Chips', 'British'], collection: true,
    desc: 'Traditional fish and chips. Collection only for now. (Demonstration restaurant)', line1: '5 Example Parade', postcode: 'BD9 4AA', min: 0, prep: 15, delivery: false,
    areas: [],
    menu: {
      'Fish & chips': [
        ['Cod & chips', 'Beer-battered cod, chunky chips.', 975, ['fish', 'cereals containing gluten', 'sulphites'], [], [grp('ex', 'Extras', 0, 3, [['Mushy peas', 120], ['Curry sauce', 120], ['Tartare sauce', 60]])]],
        ['Haddock & chips', '', 1050, ['fish', 'cereals containing gluten'], []],
        ['Chips', '', 320, [], ['vegan', 'vegetarian']],
      ],
    },
  },
  {
    slug: 'levant-grill-demo', name: 'Levant Grill & Wraps', cuisines: ['Middle Eastern', 'Turkish'],
    desc: 'Charcoal kebabs, wraps and mezze. (Demonstration restaurant)', line1: '6 Example Gardens', postcode: 'BD8 7AA', min: 1200, prep: 25, memberPct: 12,
    areas: [{ name: 'Manningham & surrounds', prefixes: ['BD7', 'BD8', 'BD9', 'BD1', 'BD5'], fee: 220 }],
    menu: {
      Wraps: [['Chicken shawarma wrap', 'Garlic sauce, pickles.', 695, ['cereals containing gluten', 'sesame'], ['halal']], ['Falafel wrap', 'Tahini, salad.', 650, ['cereals containing gluten', 'sesame'], ['vegan', 'vegetarian']]],
      Grill: [['Lamb shish plate', 'Rice, salad, flatbread.', 1295, ['cereals containing gluten'], ['halal']]],
      Mezze: [['Hummus & bread', '', 450, ['sesame', 'cereals containing gluten'], ['vegan', 'vegetarian']]],
    },
  },
  {
    slug: 'sweet-crumb-demo', name: 'Sweet Crumb', cuisines: ['Desserts', 'Bakery'],
    desc: 'Waffles, cookies and shakes. (Demonstration restaurant)', line1: '7 Example Walk', postcode: 'BD4 7AA', min: 800, prep: 20, memberPct: 15,
    areas: [{ name: 'Local delivery', prefixes: ['BD3', 'BD4', 'BD5', 'BD1'], fee: 199 }],
    menu: {
      Waffles: [['Belgian waffle', 'Chocolate sauce and berries.', 695, ['cereals containing gluten', 'eggs', 'milk'], ['vegetarian']]],
      Cookies: [['Cookie box (6)', 'Assorted.', 850, ['cereals containing gluten', 'eggs', 'milk', 'nuts', 'soya'], ['vegetarian']]],
    },
  },
  {
    slug: 'green-bowl-demo', name: 'Green Bowl Kitchen', cuisines: ['Healthy', 'Vegan'], status: 'pending',
    desc: 'Awaiting approval — used to demonstrate the admin approval workflow. (Demonstration restaurant)', line1: '8 Example Way', postcode: 'BD2 3AA', min: 1000, prep: 20,
    areas: [{ name: 'Local', prefixes: ['BD2', 'BD3'], fee: 250 }], menu: { Bowls: [['Falafel bowl', '', 995, ['sesame'], ['vegan', 'vegetarian']]] },
  },
];

const mk = <T extends object>(o: T) => o;

export async function ensureDemoSeed(db: Db): Promise<void> {
  if (await db.get('platform_settings', { id: 'main' })) return;
  await db.insert('platform_settings', DEFAULT_SETTINGS);

  const user = async (email: string, full_name: string, role: 'admin' | 'customer' | 'restaurant') => {
    const p = await db.insert<{ id: string }>('profiles', { id: stableId(email), email, full_name, phone: null, role, suspended: false, deleted_at: null });
    await db.insert('demo_credentials', { user_id: p.id, email, password_hash: hashPassword(DEMO_PASSWORD) });
    return p;
  };
  await user(DEMO_ACCOUNTS.admin, 'Demo Admin', 'admin');
  const customer = await user(DEMO_ACCOUNTS.customer, 'Demo Customer', 'customer');
  const member = await user(DEMO_ACCOUNTS.member, 'Demo Member', 'customer');
  await db.insert('memberships', {
    user_id: member.id, status: 'active', stripe_customer_id: null, stripe_subscription_id: null,
    current_period_end: new Date(Date.now() + 20 * 864e5).toISOString(), cancel_at_period_end: false,
  });
  await db.insert('addresses', { user_id: customer.id, label: 'Home', line1: '10 Example Terrace', line2: null, city: 'Bradford', postcode: 'BD5 0BB' });

  const settings = DEFAULT_SETTINGS as never;
  for (const r of RESTAURANTS) {
    const email = r.owner ?? `owner.${r.slug}@demo.feastquarter.test`;
    const owner = await db.get<{ id: string }>('profiles', { email }) ?? await user(email, `${r.name} Owner`, 'restaurant');
    const approved = (r.status ?? 'approved') === 'approved';
    const rest = await db.insert<Restaurant>('restaurants', mk({
      id: stableId('restaurant:' + r.slug), owner_id: owner.id, slug: r.slug, name: r.name, description: r.desc, cuisines: r.cuisines, address_line1: r.line1, postcode: r.postcode,
      city_slug: 'bradford', phone: '01274 000000', email: email, image_url: null, status: r.status ?? 'approved', is_demo: true, featured: !!r.featured,
      opening_hours: Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((d) => [d, [{ open: '09:00', close: '23:59' }]])) as unknown as Restaurant['opening_hours'], min_order_pence: r.min, prep_minutes: r.prep, delivery_enabled: r.delivery ?? true, collection_enabled: r.collection ?? true,
      accepting_orders: true, legal_name: null, company_number: null, vat_registered: false, vat_number: null, food_business_reg: null, food_hygiene_rating: null, food_hygiene_authority: null, referred_by: null,
      member_offer: { enabled: !!r.memberPct, percent: r.memberPct ?? 0, min_spend_pence: 1500, description: 'Member-only saving on food' },
      stripe_account_id: approved ? `acct_demo_${r.slug}` : null, stripe_details_submitted: approved, stripe_charges_enabled: approved, stripe_payouts_enabled: approved,
    }));
    await db.insert('restaurant_staff', { restaurant_id: rest.id, user_id: owner.id, role: 'owner' });
    for (const a of r.areas) await db.insert('delivery_areas', { restaurant_id: rest.id, name: a.name, postcode_prefixes: a.prefixes, fee_pence: a.fee, min_order_pence: a.min ?? null });
    let ci = 0;
    for (const [cat, items] of Object.entries(r.menu)) {
      const c = await db.insert<{ id: string }>('menu_categories', { id: stableId(`cat:${r.slug}:${cat}`), restaurant_id: rest.id, name: cat, sort: ci++ });
      let ii = 0;
      for (const [name, description, price_pence, allergens, dietary, opts] of items) {
        await db.insert('menu_items', { id: stableId(`item:${r.slug}:${cat}:${name}`), restaurant_id: rest.id, category_id: c.id, name, description, price_pence, image_url: null, available: true, allergens, allergen_info_confirmed: true, dietary, option_groups: opts ?? [], sort: ii++ });
      }
    }
  }

  await db.insert('promotions', {
    code: 'WELCOME-DEMO', description: 'Demo code: £2 off orders over £12 (platform funded)', kind: 'fixed', value: 200, min_spend_pence: 1200,
    active: true, starts_at: null, ends_at: null, max_uses: null, used_count: 0, funded_by: 'platform', restaurant_id: null,
  });

  // A handful of historical completed orders so dashboards show realistic, clearly-demo figures.
  const rests = await db.select<Restaurant>('restaurants', { status: 'approved' });
  let n = 1;
  for (const r of rests.slice(0, 4)) {
    const items = await db.select<MenuItem>('menu_items', { restaurant_id: r.id });
    for (let i = 0; i < 3; i++) {
      const fulfilment = i % 2 ? 'collection' : 'delivery';
      const it = items[i % items.length];
      const line = priceLine(it, { itemId: it.id, qty: 2 + (i % 2), optionChoiceIds: it.option_groups.filter((g) => g.min > 0).map((g) => g.choices[0].id) });
      const sub = line.unit_price_pence * line.qty;
      const t = computeTotals({ subtotal: sub, deliveryFee: 250, fulfilment, settings, discount: null });
      const when = new Date(Date.now() - (n * 7 + 2) * 36e5).toISOString();
      await db.insert('orders', {
        reference: `FQ-DEMO${String(n).padStart(3, '0')}`, customer_id: customer.id, restaurant_id: r.id, idempotency_key: `seed-${n}`, fulfilment,
        status: 'completed', payment_status: 'paid', lines: [line], ...t, stripe_fee_pence: null, delivery_address: fulfilment === 'delivery' ? { line1: '10 Example Terrace', city: 'Bradford', postcode: 'BD5 0BB' } : null,
        customer_note: null, contact_phone: null, stripe_session_id: null, stripe_payment_intent_id: `pi_demo_${n}`, rejection_reason: null, refunded_pence: 0,
        history: [{ status: 'completed', at: when }], created_at: when, paid_at: when,
      });
      await db.insert('transactions', { kind: 'order_payment', order_id: null, user_id: customer.id, restaurant_id: r.id, amount_pence: t.total_pence, status: 'succeeded', stripe_ref: `pi_demo_${n}`, note: 'Seed demo order', created_at: when });
      n++;
    }
  }
}
