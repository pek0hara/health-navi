import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Health Navi - LINE Webhook',
  description: 'LINE Messaging API Webhook for Health Navigation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
