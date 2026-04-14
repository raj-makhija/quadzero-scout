'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Toast as ToastType, ToastVariant } from '@/hooks/use-toast';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  success: 'bg-white dark:bg-gray-800 border-green-200 dark:border-green-800',
  error: 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-800',
  warning: 'bg-white dark:bg-gray-800 border-yellow-200 dark:border-yellow-800',
  info: 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800',
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.id]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg border shadow-lg transition-all duration-200',
        variantStyles[toast.variant],
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {variantIcons[toast.variant] && (
            <div className="flex-shrink-0">{variantIcons[toast.variant]}</div>
          )}
          <div className="flex-1 min-w-0">
            {toast.title && (
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{toast.title}</p>
            )}
            {toast.description && (
              <p className={cn('text-sm text-gray-600 dark:text-gray-400', toast.title && 'mt-1')}>
                {toast.description}
              </p>
            )}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  handleDismiss();
                }}
                className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
