import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { EnvironmentBanner } from '@/components/EnvironmentBanner';
import { getPageTitlePrefix } from '@/lib/environment';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export function generateMetadata(): Metadata {
  const prefix = getPageTitlePrefix();
  return {
    title: `${prefix}Quadzero Scout - AI-Powered Talent Matching`,
    description: 'Find the perfect candidates with AI-powered resume parsing and intelligent matching',
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <EnvironmentBanner />
          <div className="min-h-screen bg-gray-50">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
