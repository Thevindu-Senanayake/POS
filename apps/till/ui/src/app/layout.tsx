import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Grand POS Till',
  description: 'Restaurant, bar & room-service point of sale terminal',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Touch-first terminal: block accidental pinch-zoom during service.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
