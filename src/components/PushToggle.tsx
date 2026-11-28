'use client';
import { useEffect, useState } from 'react';
import { btn } from './ui';

type State = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied';
const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

/**
 * "Turn on notifications" button. Nothing is requested until the person taps it.
 * audience: customer -> order updates; restaurant -> new order alerts.
 */
export function PushToggle({ publicKey, audience, className }: { publicKey: string; audience: 'customer' | 'restaurant'; className?: string }) {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
        if (ios && !standalone) return setState('ios-install');
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
        if (Notification.permission === 'denied') return setState('denied');
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
      } catch { setState('unsupported'); }
    })();
  }, []);

  async function enable() {
    setMsg('');
    try {
      const perm = await Notification.requestPermission(); // the browser's own "Allow notifications?" prompt appears here, after the tap
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }));
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'failed');
      setState('on');
    } catch (e) { setMsg(`Could not turn notifications on. ${(e as Error).message === 'failed' ? '' : 'Please try again.'}`); }
  }
  async function disable() {
    try {
      const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setState('off');
    } catch { setMsg('Could not turn notifications off. You can also switch them off in your phone settings.'); }
  }

  if (state === 'loading' || state === 'unsupported') return null;
  const what = audience === 'customer' ? 'Get updates on your order' : 'Get new-order alerts on this phone';
  return (
    <div className={className} data-push-state={state}>
      {state === 'ios-install' && <p className="text-sm text-muted"><b className="text-navy">{what}:</b> on iPhone, first tap the Share button, choose <b>Add to Home Screen</b>, then open FeastQuarter from your home screen and come back here.</p>}
      {state === 'off' && (<div className="flex flex-wrap items-center gap-3"><button type="button" onClick={enable} className={btn('outline', 'sm')}>🔔 {what}</button><span className="text-xs text-muted">{audience === 'customer' ? 'We will tell you when the restaurant accepts and when it is on its way.' : 'We buzz your phone when an order arrives. Keep the dashboard sound on too.'}</span></div>)}
      {state === 'on' && (<div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold text-ok">🔔 Notifications are on</span><button type="button" onClick={disable} className="text-xs text-muted underline">Turn off</button></div>)}
      {state === 'denied' && <p className="text-xs text-muted">Notifications are blocked for this site. To turn them on, change the site's notification setting in your browser or phone settings.</p>}
      {msg && <p role="alert" className="mt-2 text-xs text-danger">{msg}</p>}
    </div>
  );
}
