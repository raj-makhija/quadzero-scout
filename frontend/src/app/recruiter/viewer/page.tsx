'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, AlertCircle, Download } from 'lucide-react';

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
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-end px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <a
          href={url}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
      <iframe
        src={googleViewerUrl}
        className="flex-1 w-full border-0"
        title="Document Viewer"
      />
    </div>
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
