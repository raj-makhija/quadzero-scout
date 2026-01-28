'use client';

import { FileText, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilePreviewProps {
  file: File;
  onRemove?: () => void;
  error?: string;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(type: string) {
  // Could expand this for different file types
  return <FileText className="h-8 w-8 text-primary-600 dark:text-primary-400" />;
}

function getFileTypeLabel(type: string): string {
  if (type === 'application/pdf') return 'PDF Document';
  if (type === 'application/msword') return 'Word Document';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'Word Document';
  }
  return 'Document';
}

export function FilePreview({ file, onRemove, error, className }: FilePreviewProps) {
  const hasError = !!error;

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border',
        hasError
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        className
      )}
    >
      <div className="flex-shrink-0">{getFileIcon(file.type)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {file.name}
          </p>
          {hasError ? (
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>{getFileTypeLabel(file.type)}</span>
          <span>•</span>
          <span>{formatFileSize(file.size)}</span>
        </div>
        {hasError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
        )}
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Remove file"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
