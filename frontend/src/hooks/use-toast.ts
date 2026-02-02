'use client';

import { useState, useCallback, useEffect } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

type ToastInput = Omit<Toast, 'id'>;

let toastId = 0;
const listeners: Set<(toasts: Toast[]) => void> = new Set();
let memoryToasts: Toast[] = [];

function emitChange() {
  listeners.forEach((listener) => listener(memoryToasts));
}

export function toast(input: ToastInput): string {
  const id = String(++toastId);
  const newToast: Toast = {
    ...input,
    id,
    duration: input.duration ?? 5000,
  };

  memoryToasts = [...memoryToasts, newToast];
  emitChange();

  return id;
}

export function dismissToast(id: string) {
  memoryToasts = memoryToasts.filter((t) => t.id !== id);
  emitChange();
}

export function dismissAllToasts() {
  memoryToasts = [];
  emitChange();
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryToasts);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  const dismissAll = useCallback(() => {
    dismissAllToasts();
  }, []);

  return {
    toasts,
    toast,
    dismiss,
    dismissAll,
  };
}
