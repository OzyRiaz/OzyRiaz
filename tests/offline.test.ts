import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/offline/route';
import { OFFLINE_HTML } from '@/lib/offline-page';

describe('/offline page', () => {
  it('returns 200 HTML, is not indexed, and has a message, a Try again button and a link home', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    const html = await res.text();
    expect(html).toMatch(/You're offline/);
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a class="btn" href="\/">Go to home<\/a>/);
    expect(html).toContain('FeastQuarter');
  });
  it('is fully self-contained: no app scripts, no session or basket content, nothing external', () => {
    expect(OFFLINE_HTML).not.toMatch(/<script/i);
    expect(OFFLINE_HTML.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//); // no external files
    expect(OFFLINE_HTML).not.toMatch(/<img|src=|href="(?!\/")/); // logo is inline; the only link is home
    expect(OFFLINE_HTML).not.toMatch(/Sign out|Dashboard|Admin/i);
  });
});

/** Runs the real public/sw.js in a sandbox with fake caches/fetch and returns what it does for a given request. */
function loadSW() {
  const handlers: Record<string, (e: any) => void> = {};
  const store = new Map<string, Response>();
  const caches = {
    open: vi.fn(async () => ({ addAll: vi.fn(async (urls: string[]) => { urls.forEach((u) => store.set(u, new Response(`cached:${u}`))); }) })),
    match: vi.fn(async (u: string) => store.get(u)),
    keys: vi.fn(async () => ['feastquarter-v1', 'feastquarter-v3']), delete: vi.fn(async () => true),
  };
  const net = { fetch: vi.fn() };
  const self = { addEventListener: (t: string, h: (e: any) => void) => { handlers[t] = h; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: (...a: unknown[]) => net.fetch(...a), Response });
  const fire = async (req: { method: string; mode: string; url?: string }) => {
    let answered: Promise<Response> | undefined;
    handlers.fetch({ request: { url: 'https://x.test/p', ...req }, respondWith: (p: Promise<Response>) => { answered = p; } });
    return answered ? await answered : undefined;
  };
  return { handlers, caches, net, fire, self, store };
}

describe('service worker (public/sw.js)', () => {
  it('pre-caches ONLY the offline page, and removes older caches on activate', async () => {
    const sw = loadSW();
    const waits: Promise<unknown>[] = [];
    sw.handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect([...sw.store.keys()]).toEqual(['/offline']);
    const w2: Promise<unknown>[] = [];
    sw.handlers.activate({ waitUntil: (p: Promise<unknown>) => w2.push(p) });
    await Promise.all(w2);
    expect(sw.caches.delete).toHaveBeenCalledWith('feastquarter-v1');
    expect(sw.caches.delete).not.toHaveBeenCalledWith('feastquarter-v3');
  });
  it('shows the offline page when a page navigation fails with no connection', async () => {
    const sw = loadSW();
    const w: Promise<unknown>[] = []; sw.handlers.install({ waitUntil: (p: Promise<unknown>) => w.push(p) }); await Promise.all(w);
    sw.net.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await sw.fire({ method: 'GET', mode: 'navigate' });
    expect(await res!.text()).toBe('cached:/offline');
  });
  it('online users get the live network response, unchanged, and nothing is stored', async () => {
    const sw = loadSW();
    const live = new Response('live page', { status: 200 });
    sw.net.fetch.mockResolvedValue(live);
    const res = await sw.fire({ method: 'GET', mode: 'navigate' });
    expect(res).toBe(live);
    expect(sw.store.size).toBe(0);
    // a server error is not "offline": it is passed through, not replaced
    const err = new Response('oops', { status: 500 });
    sw.net.fetch.mockResolvedValue(err);
    expect(await sw.fire({ method: 'GET', mode: 'navigate' })).toBe(err);
  });
  it('does not touch API calls, payment/form POSTs, scripts or images — they go straight to the network', async () => {
    const sw = loadSW();
    for (const req of [{ method: 'POST', mode: 'navigate' }, { method: 'GET', mode: 'cors' }, { method: 'GET', mode: 'no-cors' }, { method: 'GET', mode: 'same-origin' }]) {
      expect(await sw.fire(req)).toBeUndefined();
    }
    expect(sw.net.fetch).not.toHaveBeenCalled();
  });
  it('contains no code that stores pages, accounts, checkout or API responses', () => {
    const src = readFileSync('public/sw.js', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/cache\.put|\.put\(/);
    expect(src.match(/addAll\(\[([^\]]*)\]/)?.[1]).toBe('OFFLINE');
    expect(src).not.toMatch(/\/api|checkout|dashboard|admin|account|orders/);
  });
});
