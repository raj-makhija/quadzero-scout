import type { Metadata } from 'next';
import { VendorHeader } from '@/components/VendorHeader';

export const metadata: Metadata = {
  title: 'Open Positions - Quadzero Scout',
  description: 'Browse open positions and submit candidate profiles.',
};

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <VendorHeader />
      <main>{children}</main>
    </div>
  );
}
