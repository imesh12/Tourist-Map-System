import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tourist Map System',
  description: 'Public Tourist Web Map.',
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
