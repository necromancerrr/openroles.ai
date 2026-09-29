import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { SITE_URL } from '@/lib/site';

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
  themeColor: '#F4F5F3',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Vercel Analytics. It's deferred and doesn't block the render, and it
            no-ops outside a Vercel deployment. */}
        <Analytics />
      </body>
    </html>
  );
}
