import type { Metadata } from 'next';
import './globals.css';
import { TradeSignalsProvider } from '@/context/TradeSignalsContext';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'Algo Robot | Indian Equities & Algorithmic Trading Desk',
  description: 'Ultra-low latency algorithmic trading robot, live multi-broker market data pipeline, and quantitative strategy execution for NSE and BSE India.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <TradeSignalsProvider>
            {children}
          </TradeSignalsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
