import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { EnvironmentBanner } from '@/components/EnvironmentBanner';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Quadzero Scout - AI-Powered Talent Matching',
  description: 'Find the perfect candidates with AI-powered resume parsing and intelligent matching',
};

// Script to prevent theme flash on page load
// Only applies dark mode if the user explicitly chose it (not system preference)
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('quadzero-theme');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

// Script to add environment prefix to page title based on hostname
const titlePrefixScript = `
  (function() {
    try {
      var h = window.location.hostname;
      var prefix = '';
      if (h.includes('localhost') || h.startsWith('dev.')) {
        prefix = '[DEV] ';
      } else if (h.startsWith('qa.')) {
        prefix = '[QA] ';
      }
      if (prefix) {
        document.title = prefix + document.title;
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
        <script dangerouslySetInnerHTML={{ __html: titlePrefixScript }} />
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
