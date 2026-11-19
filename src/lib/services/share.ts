import QRCode from 'qrcode';
import { appUrl } from '../config';
import type { Restaurant } from '../types';

/** The restaurant's own ordering URL, tagged so orders from QR codes / flyers / WhatsApp can be attributed. */
export const orderingUrl = (r: Pick<Restaurant, 'slug'>, src?: string) => `${appUrl()}/restaurants/${r.slug}${src ? `?src=${encodeURIComponent(src)}` : ''}`;
export const referralUrl = (r: Pick<Restaurant, 'slug'>) => `${appUrl()}/partner?ref=${encodeURIComponent(r.slug)}`;
export const qrSvg = (url: string) => QRCode.toString(url, { type: 'svg', margin: 2, width: 320, color: { dark: '#132C39', light: '#FFFFFF' } });
