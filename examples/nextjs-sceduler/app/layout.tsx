import './styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Next.js react-calendar example',
  description: 'example of yorkie-js-sdk with next.js & react-calendar',
  icons: {
    icon: './favicon.ico',
  },
};

/**
 * default root layout of service
 */
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
