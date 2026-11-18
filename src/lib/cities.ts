/**
 * Launch cities. To expand to a new town: add an entry with active: true and the
 * outward-code areas it covers. No other code changes are needed.
 */
export interface City { slug: string; name: string; areas: string[]; active: boolean }

export const CITIES: City[] = [
  { slug: 'bradford', name: 'Bradford', areas: ['BD'], active: true },
  { slug: 'leeds', name: 'Leeds', areas: ['LS'], active: false },
];

export const activeCities = () => CITIES.filter((c) => c.active);
export const cityBySlug = (slug: string) => CITIES.find((c) => c.slug === slug);
export const cityForOutward = (outward: string): City | undefined => {
  const area = outward.replace(/\d.*$/, '');
  return CITIES.find((c) => c.areas.includes(area));
};
