import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRoles — internship & new-grad board',
  description:
    'A scanning surface for internship and new-grad postings. Age is the only thing that gets color.',
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
