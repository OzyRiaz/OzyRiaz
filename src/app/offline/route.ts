import { OFFLINE_HTML } from '@/lib/offline-page';

/**
 * /offline — the page the service worker (public/sw.js) shows when a page navigation fails for lack of a connection.
 * A route handler (not a page) so it has no layout, header or session: nothing about a signed-in person can end up in it.
 */
export function GET() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Robots-Tag': 'noindex' },
  });
}
