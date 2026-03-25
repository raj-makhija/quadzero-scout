'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

function ViewerContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');

  if (!url) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span>No document URL provided.</span>
        </div>
      </div>
    );
  }

  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <iframe
      src={googleViewerUrl}
      className="w-full h-screen border-0"
      title="Document Viewer"
    />
  );
}

export default function ViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      }
    >
      <ViewerContent />
    </Suspense>
  );
}
