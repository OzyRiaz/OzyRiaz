import { cityForOutward, type City } from './cities';

const PC = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;

export interface ParsedPostcode { outward: string; inward: string; normalised: string; sector: string }

export function parsePostcode(input: string): ParsedPostcode | null {
  const m = PC.exec(input.trim().toUpperCase());
  if (!m) return null;
  const [, outward, inward] = m;
  return { outward, inward, normalised: `${outward} ${inward}`, sector: `${outward} ${inward[0]}` };
}

/** Accepts a full postcode or just an outward code ("BD5") for browsing. */
export function parseOutwardOnly(input: string): string | null {
  const v = input.trim().toUpperCase();
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(v) ? v : null;
}

/**
 * Area entries are either an outward code ("BD5") or a sector ("BD5 0").
 * "BD1" never matches "BD10" because we compare whole outward codes.
 */
export function areaMatches(area: string, pc: { outward: string; sector?: string }): boolean {
  const a = area.trim().toUpperCase();
  if (a.includes(' ')) return pc.sector === a;
  return a === pc.outward;
}

export function postcodeInServedCity(pc: { outward: string }, cities?: City[]) {
  const city = cityForOutward(pc.outward, cities);
  return city && city.active ? city : null;
}
