import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tourist Map System — Admin',
  description: 'Client Admin for the Tourist Map System.',
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
