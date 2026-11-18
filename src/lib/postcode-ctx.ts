import { cookies } from 'next/headers';
import { parseOutwardOnly, parsePostcode } from './postcode';

/** Postcode from ?postcode= or the remembered cookie; only returned if syntactically valid. */
export async function currentPostcode(sp?: { postcode?: string | string[] }): Promise<string | null> {
  const q = Array.isArray(sp?.postcode) ? sp?.postcode[0] : sp?.postcode;
  const c = (await cookies()).get('bdf_pc')?.value; // internal cookie name, intentionally unchanged by the rebrand
  const raw = (q ?? (c ? decodeURIComponent(c) : '')).trim();
  if (!raw) return null;
  const full = parsePostcode(raw);
  return full ? full.normalised : parseOutwardOnly(raw);
}
