import { BRAND } from './brand';

/**
 * The "you're offline" page. A COMPLETE, self-contained HTML document on purpose:
 *  - no layout, no session, no basket, no scripts or styles from the app — so it can be cached by the service worker
 *    without ever capturing anything about the person who happened to install it;
 *  - works with nothing else loaded: styles and the logo are inline.
 * "Try again" reloads the page that failed (the address bar keeps the original URL when the service worker answers);
 * if the page is opened directly it goes home instead.
 */
/** The FeastQuarter mark, inline, so the page needs no other file. Same drawing as public/icons/icon.svg. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="FeastQuarter"><rect width="512" height="512" rx="112" fill="#132C39"/><g transform="translate(256 256)"><circle r="168" fill="none" stroke="#FAF8F4" stroke-width="12" opacity=".9"/><path d="M9 -9 L9 -140 A140 140 0 0 1 140 -9 Z" fill="#F4C870"/><path d="M9 9 L140 9 A140 140 0 0 1 9 140 Z" fill="#FAF8F4"/><path d="M-9 9 L-9 140 A140 140 0 0 1 -140 9 Z" fill="#FAF8F4"/><path d="M-140 -9 A140 140 0 0 1 -9 -140 L-9 -9 Z" fill="#FAF8F4"/></g></svg>`;

export const OFFLINE_HTML = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${BRAND.colors.navy}">
<title>You're offline · ${BRAND.name}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;background:${BRAND.colors.navy};color:${BRAND.colors.ivory};font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
  main{max-width:26rem}
  .logo svg{width:72px;height:72px;display:block;margin:0 auto}
  h1{margin:20px 0 8px;font-family:Georgia,"Times New Roman",serif;font-size:2rem;line-height:1.15;color:${BRAND.colors.gold}}
  p{margin:0 0 24px;font-size:1.0625rem;line-height:1.5;opacity:.85}
  .row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
  button,a.btn{font:inherit;font-weight:600;border-radius:12px;padding:12px 22px;min-height:48px;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center}
  button{background:${BRAND.colors.gold};color:${BRAND.colors.navy};border:0}
  a.btn{color:${BRAND.colors.ivory};border:1px solid rgba(250,248,244,.45)}
  button:focus-visible,a.btn:focus-visible{outline:3px solid ${BRAND.colors.ivory};outline-offset:3px}
  small{display:block;margin-top:28px;opacity:.6}
</style>
</head>
<body>
<main>
  <div class="logo" aria-hidden="true">${LOGO_SVG}</div>
  <h1>You're offline</h1>
  <p>We can't reach ${BRAND.name} right now. Check your signal or Wi-Fi and try again. Your basket is saved on this device.</p>
  <div class="row">
    <button type="button" onclick="if(location.pathname==='/offline'){location.href='/'}else{location.reload()}">Try again</button>
    <a class="btn" href="/">Go to home</a>
  </div>
  <small>${BRAND.tagline}</small>
</main>
</body>
</html>`;
