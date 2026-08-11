import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRoles — catch the opening, not the recap',
  description:
    'Fresh internship and new-grad roles, with a Seattle + remote launchpad for UW students.',
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
        {/* Vercel Analytics. Note what it costs: this board otherwise ships one
            small client island (the location type-ahead) and nothing else, so
            this is the first script every page loads. It's deferred and doesn't
            block the render, and it no-ops outside a Vercel deployment. */}
        <Analytics />
      </body>
    </html>
  );
}
