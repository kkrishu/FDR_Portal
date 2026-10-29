import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ScrollRestoration } from '@/components/layout/scroll-restoration';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: 'FDR Portal - Security Deposit Management',
    template: '%s | FDR Portal',
  },
  description: 'AICTE Security Deposit/FDR Management Portal for Institutions, Officers, and Banks',
  keywords: ['FDR', 'Security Deposit', 'AICTE', 'Bank Verification', 'Institution'],
  authors: [{ name: 'AICTE' }],
  creator: 'AICTE',
  publisher: 'AICTE',
  robots: 'noindex, nofollow',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://fdr-portal.gov.in',
    siteName: 'FDR Portal',
    title: 'FDR Portal - Security Deposit Management',
    description: 'AICTE Security Deposit/FDR Management Portal',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FDR Portal',
    description: 'AICTE Security Deposit/FDR Management Portal',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1628' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-background min-h-screen font-sans antialiased">
        <Providers>
          <ScrollRestoration />
          {children}
        </Providers>
      </body>
    </html>
  );
}
