import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
