import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name, short_name: BRAND.name, description: `${BRAND.tagline} Order from local restaurants.`,
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#FAF8F4', theme_color: '#132C39', categories: ['food', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [{ name: 'Find food', url: '/restaurants' }, { name: 'My orders', url: '/orders' }],
  };
}
