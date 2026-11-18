import type { OpeningHours } from './types';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Europe/London wall-clock parts regardless of server timezone. */
export function londonNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = get('weekday').slice(0, 3).toLowerCase();
  return { day: (wd as typeof DAYS[number]), minutes: Number(get('hour')) % 24 * 60 + Number(get('minute')) };
}

export function isOpenNow(hours: OpeningHours, d = new Date()): boolean {
  const { day, minutes } = londonNow(d);
  return (hours[day] ?? []).some((p) => {
    const o = mins(p.open), c = mins(p.close);
    return c > o ? minutes >= o && minutes < c : minutes >= o || minutes < c; // overnight
  });
}

export const defaultHours = (): OpeningHours => ({
  mon: [{ open: '12:00', close: '22:00' }], tue: [{ open: '12:00', close: '22:00' }], wed: [{ open: '12:00', close: '22:00' }],
  thu: [{ open: '12:00', close: '22:00' }], fri: [{ open: '12:00', close: '23:00' }], sat: [{ open: '12:00', close: '23:00' }], sun: [{ open: '13:00', close: '22:00' }],
});
