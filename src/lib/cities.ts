/**
 * Cities are configuration, not brand. To open a new city: add an entry (or set active: true) with the
 * postcode areas it covers. Restaurants, delivery areas and postcode checks all derive from this list.
 */
export interface City { slug: string; name: string; areas: string[]; active: boolean }

export const CITIES: City[] = [
  { slug: 'bradford', name: 'Bradford', areas: ['BD'], active: true },
  { slug: 'leeds', name: 'Leeds', areas: ['LS'], active: false },
  { slug: 'manchester', name: 'Manchester', areas: ['M'], active: false },
];

export const activeCities = () => CITIES.filter((c) => c.active);
export const plannedCities = () => CITIES.filter((c) => !c.active);
/** The first active city: used for friendly defaults only (never for business identity). */
export const launchCity = (): City => activeCities()[0] ?? CITIES[0];
export const cityBySlug = (slug: string) => CITIES.find((c) => c.slug === slug);
export const cityForOutward = (outward: string): City | undefined => {
  const area = outward.replace(/\d.*$/, '');
  return CITIES.find((c) => c.areas.includes(area));
};
/** "Bradford", "Bradford and Leeds", "Bradford, Leeds and Manchester" */
export const listNames = (cs: City[]) => (cs.length <= 1 ? cs.map((c) => c.name).join('') : `${cs.slice(0, -1).map((c) => c.name).join(', ')} and ${cs[cs.length - 1].name}`);
