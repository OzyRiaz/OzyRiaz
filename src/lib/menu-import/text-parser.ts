import type { Allergen, Dietary, ImportedItem, ImportedMenu } from './schema';
import { LIMITS, normalizeMenu } from './schema';

/**
 * Turns pasted menu text into draft items WITHOUT any AI: free, instant and private (nothing leaves the server).
 * It understands headings (ALL CAPS or ending in ":"), "Name ..... £5.95", "Name – description £5.95", description lines
 * under an item, and (V) / (VG) / (GF) markers. Anything it is unsure about is flagged for the owner.
 */

const PRICE = String.raw`(?:£\s?)?\d{1,3}(?:[.,]\d{2})?`;
const trailingPrice = new RegExp(String.raw`(?:^|[\s.…_\-–—:|])(${PRICE})\s*$`);
const anyPrice = new RegExp(String.raw`(?:£\s?)?\b\d{1,3}[.,]\d{2}\b`, 'g');

const isUpper = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase() && s.replace(/[^A-Z]/g, '').length >= 3;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const toPence = (p: string) => Math.round(parseFloat(p.replace(/£/g, '').replace(',', '.').trim()) * 100);
const stripLeaders = (s: string) => s.replace(/[\s.…_\-–—:|/\\]+$/g, '').replace(/^[\s•·*▪●○\-–—]+/, '').trim();

/** "(V)" "(VG)" "(GF)" "(H)" markers, vegetarian/vegan words. Suggestions only. */
function dietaryFrom(text: string): { dietary: Dietary[]; text: string } {
  const d = new Set<Dietary>(); let t = text;
  t = t.replace(/\((?:[A-Za-z]{1,3}(?:\s*[,/&]\s*[A-Za-z]{1,3})*)\)/g, (m) => {
    const codes = m.slice(1, -1).split(/[,/&]/).map((c) => c.trim().toUpperCase());
    if (!codes.every((c) => ['V', 'VG', 'VE', 'GF', 'H', 'VEG'].includes(c))) return m;
    for (const c of codes) { if (c === 'V' || c === 'VEG') d.add('vegetarian'); if (c === 'VG' || c === 'VE') d.add('vegan'); if (c === 'GF') d.add('gluten-free option'); if (c === 'H') d.add('halal'); }
    return '';
  });
  if (/\bvegan\b/i.test(t)) d.add('vegan');
  if (/\bvegetarian\b/i.test(t)) d.add('vegetarian');
  if (/\bhalal\b/i.test(t)) d.add('halal');
  return { dietary: [...d], text: t.replace(/\s+/g, ' ').trim() };
}

/**
 * Words that NAME an allergen ingredient. A suggestion only: the absence of a suggestion never means "allergen free".
 */
const ALLERGEN_WORDS: [Allergen, RegExp][] = [
  ['milk', /\b(milk|cream|creamy|cheese|paneer|butter|ghee|yogh?urt|raita|mozzarella|parmesan|cheddar|halloumi|custard|ice cream)\b/i],
  ['cereals containing gluten', /\b(naan|bread|flour|wheat|pizza|pasta|batter(?:ed)?|bun|roti|chapati|chapatti|paratha|pastry|pitta|pita|wrap|tortilla|breaded|crumb|barley|spaghetti|noodles?)\b/i],
  ['eggs', /\b(eggs?|mayo|mayonnaise|omelette|meringue)\b/i],
  ['fish', /\b(fish|salmon|tuna|cod|haddock|anchov(?:y|ies)|mackerel|sardines?)\b/i],
  ['crustaceans', /\b(prawns?|shrimps?|crab|lobster|langoustine)\b/i],
  ['molluscs', /\b(mussels?|squid|calamari|oysters?|clams?|scallops?)\b/i],
  ['peanuts', /\b(peanuts?|groundnuts?)\b/i],
  ['nuts', /\b(almonds?|cashews?|pistachios?|walnuts?|hazelnuts?|pecans?|nuts?)\b/i],
  ['sesame', /\b(sesame|tahini|hummus)\b/i],
  ['soya', /\b(soy|soya|tofu|edamame)\b/i],
  ['mustard', /\bmustard\b/i],
  ['celery', /\bcelery\b/i],
  ['lupin', /\blupin\b/i],
];
export function suggestAllergens(text: string): Allergen[] { return ALLERGEN_WORDS.filter(([, re]) => re.test(text)).map(([a]) => a); }

interface Draft { item: ImportedItem; hasDesc: boolean }

export function parseMenuText(raw: string): ImportedMenu {
  const warnings: string[] = [];
  let text = raw.replace(/\r/g, '').replace(/\t/g, ' ').slice(0, LIMITS.maxTextChars);
  if (raw.length > LIMITS.maxTextChars) warnings.push('The text was very long, so only the first part was read. Import the rest separately.');
  // lines, remembering blank lines (they separate sections)
  const lines: { t: string; blankBefore: boolean }[] = []; let blank = true;
  for (const l of text.split('\n')) { const t = l.replace(/[​-‍﻿]/g, '').replace(/ {2,}/g, ' ').trim(); if (!t) { blank = true; continue; } lines.push({ t, blankBefore: blank }); blank = false; }

  const drafts: Draft[] = []; let category = 'Menu'; let last: Draft | null = null;
  const priceCount = (s: string) => (s.match(anyPrice) ?? []).length;

  const MARKER_END = /\s*\(\s*(?:V|VG|VE|VEG|GF|H)(?:\s*[,/&]\s*(?:V|VG|VE|VEG|GF|H))*\s*\)\s*$/i;
  const SHORT_HEADING_BLOCK = /^(contains|served|with|topped|made|in|on|and|add)\b/i;

  for (let i = 0; i < lines.length; i++) {
    let { t } = lines[i]; const { blankBefore } = lines[i];
    // "(V)" style markers written AFTER the price: peel them off, remember them
    const mk = MARKER_END.exec(t); let markers = '';
    if (mk && trailingPrice.test(t.slice(0, mk.index))) { markers = mk[0].trim(); t = t.slice(0, mk.index); }
    const m = trailingPrice.exec(t);
    // a bare integer ("Chicken 65") is only a price when there is a £ or dot-leaders
    const priced = !!m && (/[.,]\d{2}$/.test(m[1]) || /£/.test(m[1]) || /[.…_]{2,}\s*£?\d+\s*$/.test(t));
    if (priced && m) {
      const many = priceCount(t) > 1;
      let nameText = many ? stripLeaders(t.replace(anyPrice, ' ').replace(/\s+/g, ' ')) : stripLeaders(t.slice(0, t.length - m[1].length));
      let name = nameText, description = '';
      const split = /\s[–—-]\s|:\s/.exec(nameText);
      if (split && split.index >= 2 && nameText.length > 30) { name = nameText.slice(0, split.index).trim(); description = nameText.slice(split.index + split[0].length).trim(); }
      const dd = dietaryFrom(`${name} ${markers}`.trim());
      const flags: string[] = [];
      if (many) flags.push('Several prices on this line (sizes?): the first was used, check it');
      const item: ImportedItem = { name: dd.text, description, price_pence: toPence(many ? (t.match(anyPrice) ?? [m[1]])[0] : m[1]), category, dietary: dd.dietary, allergens: [], flags };
      last = { item, hasDesc: !!description }; drafts.push(last);
      continue;
    }
    // unpriced line: heading or description
    const next = lines[i + 1]?.t; const nextPriced = !!next && !!trailingPrice.exec(next.replace(MARKER_END, ''));
    const upperOrColon = isUpper(t) || /:$/.test(t);
    const shortHeading = words(t) <= 3 && !/[.,;()]/.test(t) && nextPriced && !SHORT_HEADING_BLOCK.test(t);
    const isHeading = upperOrColon || shortHeading || !last || (blankBefore && words(t) <= 5 && !/[.,;]/.test(t) && (nextPriced || !last));
    if (isHeading) { const c = stripLeaders(t.replace(/:$/, '')).slice(0, LIMITS.category); category = c ? (isUpper(c) ? titleCase(c) : c) : category; last = null; }
    else if (last) { last.item.description = (last.item.description ? last.item.description + ' ' : '') + t; last.hasDesc = true; }
  }
  const items = drafts.map(({ item }) => {
    const dd = dietaryFrom(item.description); // markers in descriptions too
    item.dietary = [...new Set([...item.dietary, ...dd.dietary])]; item.description = dd.text;
    item.allergens = suggestAllergens(`${item.name} ${item.description}`);
    return item;
  });
  if (!items.length) warnings.push('No dishes with prices were found. Each dish should be on its own line with its price at the end, e.g. "Chicken karahi £11.95".');
  return normalizeMenu(items, 'text', 'parser', warnings);
}
