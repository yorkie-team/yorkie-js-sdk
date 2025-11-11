import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yorkie Presence Rooms',
  description:
    'Real-time user presence tracking across multiple rooms using Yorkie',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
