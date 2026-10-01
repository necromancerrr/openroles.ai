import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400-italic.css';
import './globals.css';
import { SITE_URL } from '@/lib/site';
import { THEME_INIT } from '@/lib/theme';
import { CommandPalette } from '@/components/CommandPalette';

const description =
  'Fresh internship and new-grad roles merged from live job lists, newest first — with pay, visa sponsorship, a Seattle + remote view for UW students, and what’s new since your last visit.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'OpenRoles — catch the opening, not the recap',
  description,
  applicationName: 'OpenRoles',
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': [{ url: '/feed.xml', title: 'OpenRoles — newest internships' }] },
  },
  openGraph: {
    type: 'website',
    siteName: 'OpenRoles',
    title: 'OpenRoles — catch the opening, not the recap',
    description,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenRoles — catch the opening, not the recap',
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FEFAE0' },
    { media: '(prefers-color-scheme: dark)', color: '#11160A' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme script below sets data-theme on <html> before the first paint,
    // so React has to accept the attribute it finds there (lib/theme.ts).
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <a className="skiplink" href="#main">
          Skip to the board
        </a>
        {children}
        <CommandPalette />
        {/* Vercel Analytics. It's deferred and doesn't block the render, and it
            no-ops outside a Vercel deployment. */}
        <Analytics />
      </body>
    </html>
  );
}
