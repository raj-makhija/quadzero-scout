'use client';

import { ReactNode } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  touched?: boolean;
  hint?: string;
  required?: boolean;
  showValidIcon?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  touched,
  hint,
  required,
  showValidIcon = false,
  children,
  className,
}: FormFieldProps) {
  const hasError = touched && !!error;
  const isValid = touched && !error && showValidIcon;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="label flex items-center gap-1"
      >
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>

      <div className="relative">
        {children}

        {/* Validation icon */}
        {(hasError || isValid) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {hasError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}

      {/* Hint text (only show when no error) */}
      {hint && !hasError && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  );
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  isValid?: boolean;
}

export function FormInput({ hasError, isValid, className, ...props }: FormInputProps) {
  return (
    <input
      className={cn(
        'input pr-10',
        hasError && 'border-red-500 focus:ring-red-500 dark:border-red-400',
        isValid && 'border-green-500 focus:ring-green-500 dark:border-green-400',
        className
      )}
      {...props}
    />
  );
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
  isValid?: boolean;
}

export function FormTextarea({ hasError, isValid, className, ...props }: FormTextareaProps) {
  return (
    <textarea
      className={cn(
        'input min-h-[80px] pr-10',
        hasError && 'border-red-500 focus:ring-red-500 dark:border-red-400',
        isValid && 'border-green-500 focus:ring-green-500 dark:border-green-400',
        className
      )}
      {...props}
    />
  );
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  isValid?: boolean;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function FormSelect({
  hasError,
  isValid,
  options,
  placeholder,
  className,
  ...props
}: FormSelectProps) {
  return (
    <select
      className={cn(
        'input pr-10',
        hasError && 'border-red-500 focus:ring-red-500 dark:border-red-400',
        isValid && 'border-green-500 focus:ring-green-500 dark:border-green-400',
        className
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
