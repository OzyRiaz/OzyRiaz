import { parsePounds } from './money';
import type { OptionGroup } from './types';

/** Options text format:  "Group name | min | max" followed by "Choice | price" lines; blank line between groups. */
export function parseOptions(text: string): OptionGroup[] {
  return text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((block, gi) => {
    const [head, ...rest] = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const [name, min, max] = head.split('|').map((x) => x.trim());
    const choices = rest.map((l, ci) => { const [n, p] = l.split('|').map((x) => x.trim()); const pence = parsePounds(p || '0'); if (!n || pence === null) throw new Error(`Bad option line: "${l}"`); return { id: `g${gi}c${ci}`, name: n, price_pence: pence }; });
    const mn = Math.max(0, Number(min ?? 0) || 0), mx = Math.max(1, Number(max ?? 1) || 1);
    if (!name || !choices.length) throw new Error(`Option group "${head}" needs a name and at least one choice`);
    if (mn > mx || mn > choices.length) throw new Error(`Option group "${name}": min cannot exceed max or the number of choices`);
    return { id: `g${gi}`, name, min: mn, max: Math.min(mx, choices.length), choices };
  });
}
export const optionsToText = (gs: OptionGroup[]) => gs.map((g) => `${g.name} | ${g.min} | ${g.max}\n${g.choices.map((c) => `${c.name} | ${(c.price_pence / 100).toFixed(2)}`).join('\n')}`).join('\n\n');

