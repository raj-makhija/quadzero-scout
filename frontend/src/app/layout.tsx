import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { EnvironmentBanner } from '@/components/EnvironmentBanner';
import { Toaster } from '@/components/ui/toaster';
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

// Script to prevent theme flash on page load
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('quadzero-theme');
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <Providers>
          <EnvironmentBanner />
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            {children}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
