import type { Metadata } from 'next';
import './styles/globals.css';

export const metadata: Metadata = {
  title: 'Scheduler · Yorkie',
  description: 'A shared calendar built with Yorkie and react-calendar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
