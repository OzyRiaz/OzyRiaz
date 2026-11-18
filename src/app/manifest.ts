import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BD Feast', short_name: 'BD Feast', description: 'Bradford at your table. Order from local restaurants.',
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
