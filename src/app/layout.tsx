import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { BasketProvider } from '@/components/BasketProvider';
import { RegisterSW, TabBar } from '@/components/Chrome';
import { AttributionCapture } from '@/components/AttributionCapture';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { plusEnabled } from '@/lib/services/settings';
import { BRAND } from '@/lib/brand';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'), // set to https://feastquarter.co.uk once the domain is live
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: 'Order delivery or collection from local restaurants in your city. Restaurants deliver their own food.',
  openGraph: { type: 'website', siteName: BRAND.name, title: `${BRAND.name} — ${BRAND.tagline}`, description: 'Order delivery or collection from local restaurants in your city.', locale: 'en_GB', images: [{ url: '/brand/og-image.png', width: 1200, height: 630, alt: BRAND.name }] },
  twitter: { card: 'summary_large_image', title: `${BRAND.name} — ${BRAND.tagline}`, images: ['/brand/og-image.png'] },
  applicationName: BRAND.name, appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#132C39', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const plus = await plusEnabled();
  return (
    <html lang="en-GB" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen pb-16 md:pb-0">
        <a href="#main" className="skip-link">Skip to content</a>
        <BasketProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer plus={plus} />
          <TabBar />
        </BasketProvider>
        <RegisterSW />
        <AttributionCapture />
      </body>
    </html>
  );
}
