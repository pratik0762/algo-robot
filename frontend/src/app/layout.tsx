import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nifty 50 Financial Reports | National Stock Exchange of India (NSE)',
  description: 'In-depth financial statements, quarterly results, balance sheets, and official filings for all 50 Nifty 50 constituent companies sourced from NSE India.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
