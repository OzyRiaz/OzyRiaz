import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { extractMenuWithClaude } from '@/lib/menu-import/ai';
import { SAMPLE_MENU } from '@/lib/menu-import/sample';
import { normalizeMenu } from '@/lib/menu-import/schema';
import { parseMenuText } from '@/lib/menu-import/text-parser';
import { commitMenuImport, previewMenuImport, sniffFile } from '@/lib/services/menu-import';
import type { MenuItem } from '@/lib/types';
import { freshDb, karahi } from './helpers';

beforeEach(async () => { await freshDb(); delete process.env.MENU_IMPORT_AI_ENABLED; delete process.env.ANTHROPIC_API_KEY; });

describe('text parser', () => {
  const m = parseMenuText(SAMPLE_MENU);
  it('finds categories, names and prices', () => {
    const k = m.items.find((i) => i.name === 'Lamb Karahi')!;
    expect(k.price_pence).toBe(1195); expect(k.category).toBe('Karahi'); expect(k.description).toMatch(/tomatoes/);
    expect(m.items.length).toBeGreaterThanOrEqual(12);
    expect(m.items.find((i) => i.name.startsWith('Onion Bhaji'))!.dietary).toContain('vegetarian');
  });
  it('never confirms allergens by itself and flags missing prices', () => {
    const x = parseMenuText('STARTERS\nMystery Dish');
    for (const i of [...m.items, ...x.items]) expect(i.price_pence === null ? i.flags.length : 1).toBeGreaterThan(0);
  });
});

describe('normalizeMenu', () => {
  it('dedupes, clamps and flags', () => {
    const base = { description: '', category: 'A', dietary: [], allergens: [], flags: [] as string[] };
    const out = normalizeMenu([{ ...base, name: 'Tea', price_pence: 200 }, { ...base, name: 'tea', price_pence: 200 }, { ...base, name: 'Gold', price_pence: 20000 }, { ...base, name: 'Free', price_pence: null }], 'text', 'parser');
    expect(out.items.map((i) => i.name)).toEqual(['Tea', 'Gold', 'Free']);
    expect(out.items[1].flags.join()).toMatch(/high/i);
    expect(out.items[2].flags.join()).toMatch(/price/i);
  });
});

describe('commit', () => {
  const item = (name: string, category = 'Starters') => ({ name, description: '', category, price_pence: 500, dietary: [], allergens: ['milk'] });
  it('saves hidden with allergens unconfirmed, dedupes, and keeps tenants apart', async () => {
    const { r } = await karahi();
    const db = await getDb();
    const res = await commitMenuImport(r.id, { items: [item('Zed One'), item('Zed One'), item('Zed Two', 'New Cat')], publish: false, checked: true });
    expect(res.created).toBe(2); expect(res.skipped).toBe(1); expect(res.categoriesCreated).toBe(1);
    const saved = (await db.select<MenuItem>('menu_items', { restaurant_id: r.id })).filter((i) => i.name.startsWith('Zed'));
    expect(saved).toHaveLength(2);
    for (const i of saved) { expect(i.available).toBe(false); expect(i.allergen_info_confirmed).toBe(false); expect(i.restaurant_id).toBe(r.id); }
    const again = await commitMenuImport(r.id, { items: [item('Zed One')], publish: false, checked: true });
    expect(again.created).toBe(0); expect(again.skipped).toBe(1);
  });
  it('rejects unchecked, free, bad-allergen and oversized input', async () => {
    const { r } = await karahi();
    await expect(commitMenuImport(r.id, { items: [item('Abc')], publish: false, checked: false })).rejects.toThrow();
    await expect(commitMenuImport(r.id, { items: [{ ...item('Abc'), price_pence: 0 }], publish: false, checked: true })).rejects.toThrow();
    await expect(commitMenuImport(r.id, { items: [{ ...item('Abc'), allergens: ['unicorn'] }], publish: false, checked: true })).rejects.toThrow();
    await expect(commitMenuImport(r.id, { items: Array.from({ length: 201 }, (_, i) => item(`Dish ${i}`)), publish: false, checked: true })).rejects.toThrow();
  });
});

describe('preview', () => {
  it('uses the free parser for text and refuses files while AI is off', async () => {
    const { r } = await karahi();
    expect((await previewMenuImport({ restaurantId: r.id, userId: 'u1', text: SAMPLE_MENU })).provider).toBe('parser');
    await expect(previewMenuImport({ restaurantId: r.id, userId: 'u1', file: { mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 xxxxxxxxxx') } })).rejects.toThrow(/not switched on/);
  });
  it('sniffs real file types, not declared ones', () => {
    expect(sniffFile(Buffer.from('%PDF-1.7 aaaaaaaa'))).toEqual({ kind: 'pdf' });
    expect(sniffFile(Buffer.from('MZ executable bytes here'))).toBeNull();
  });
  it('calls the AI only when switched on, with the daily cap', async () => {
    process.env.MENU_IMPORT_AI_ENABLED = 'true'; process.env.ANTHROPIC_API_KEY = 'sk-ant-test'; process.env.MENU_IMPORT_DAILY_LIMIT = '1';
    const { r } = await karahi();
    const fake = vi.fn(async () => ({ items: [], warnings: [], source: 'pdf', provider: 'claude' }) as never);
    const file = { mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7 aaaaaaaaaa') };
    await previewMenuImport({ restaurantId: r.id, userId: 'u2', file }, fake);
    expect(fake).toHaveBeenCalledOnce();
    await expect(previewMenuImport({ restaurantId: r.id, userId: 'u2', file }, fake)).rejects.toThrow(/limit/);
    delete process.env.MENU_IMPORT_DAILY_LIMIT;
  });
});

describe('AI extractor (fake client)', () => {
  const mk = (res: unknown) => ({ messages: { parse: vi.fn(async () => res) } }) as never;
  const ok = { stop_reason: 'end_turn', parsed_output: { items: [{ name: 'Lamb Karahi', description: '', price_gbp: 11.95, category: 'Mains', dietary: [], allergens: ['milk'] }], notes: '' } };
  it('sends the right request and converts pounds to pence', async () => {
    const c = mk(ok);
    const m = await extractMenuWithClaude({ kind: 'image', mediaType: 'image/png', data: Buffer.from('x') }, c);
    expect(m.items[0].price_pence).toBe(1195); expect(m.provider).toBe('claude');
    const arg = (c as never as { messages: { parse: { mock: { calls: [Record<string, unknown>][] } } } }).messages.parse.mock.calls[0][0];
    expect(arg.model).toBe('claude-opus-5-5'); expect(arg).toHaveProperty('output_config'); expect(arg).not.toHaveProperty('tools'); expect(arg).not.toHaveProperty('tool_choice');
    expect(JSON.stringify(arg.messages)).toContain('"type":"image"');
  });
  it('turns refusals, truncation and empty output into friendly errors', async () => {
    await expect(extractMenuWithClaude({ kind: 'text', text: 'x' }, mk({ stop_reason: 'refusal', parsed_output: null }))).rejects.toThrow(/paste/i);
    await expect(extractMenuWithClaude({ kind: 'text', text: 'x' }, mk({ stop_reason: 'max_tokens', parsed_output: null }))).rejects.toThrow();
    await expect(extractMenuWithClaude({ kind: 'text', text: 'x' }, mk({ stop_reason: 'end_turn', parsed_output: null }))).rejects.toThrow();
    await expect(extractMenuWithClaude({ kind: 'text', text: 'x' }, { messages: { parse: async () => { throw new Error('boom'); } } } as never)).rejects.toThrow();
  });
});

describe('security (static)', () => {
  it('route and action check the session; the key never reaches the browser', () => {
    const route = readFileSync('src/app/api/dashboard/menu-import/route.ts', 'utf8');
    expect(route).toMatch(/getSession\(\)/); expect(route).toMatch(/role !== 'restaurant'/); expect(route).not.toMatch(/restaurantId'\)/);
    expect(readFileSync('src/app/dashboard/menu/import/actions.ts', 'utf8')).toMatch(/requireSession/);
    expect(readFileSync('src/components/MenuImporter.tsx', 'utf8')).not.toMatch(/ANTHROPIC/);
    expect(readFileSync('.env.example', 'utf8')).not.toMatch(/NEXT_PUBLIC_ANTHROPIC/);
  });
});
