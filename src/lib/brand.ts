/** Single source of truth for brand identity. Change here, not in scattered strings. */
export const BRAND = {
  name: 'FeastQuarter',
  tagline: 'Your City. Your Food. Your Way.',
  plusName: 'FeastQuarter Plus',
  domain: 'feastquarter.co.uk',
  /** Intended primary domain. NOT assumed to be purchased/configured: the live URL always comes from NEXT_PUBLIC_APP_URL. */
  intendedUrl: 'https://feastquarter.co.uk',
  supportEmail: 'support@feastquarter.co.uk',
  colors: { navy: '#132C39', gold: '#F4C870', ivory: '#FAF8F4', white: '#FFFFFF', charcoal: '#1F2A30' },
} as const;
