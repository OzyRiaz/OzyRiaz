import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { BasketProvider } from '@/components/BasketProvider';
import { RegisterSW, TabBar } from '@/components/Chrome';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'BD Feast — Bradford at your table.', template: '%s · BD Feast' },
  description: 'Order delivery or collection from local Bradford restaurants. Restaurants deliver their own food.',
  applicationName: 'BD Feast', appleWebApp: { capable: true, title: 'BD Feast', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#132C39', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen pb-16 md:pb-0">
        <a href="#main" className="skip-link">Skip to content</a>
        <BasketProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <TabBar />
        </BasketProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
