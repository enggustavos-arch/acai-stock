import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Acai Algarve - Ricardo',
  description: 'Contagem diária de stock',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Acai Algarve',
  },
  icons: {
    apple: '/icons/icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#6d28d9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
