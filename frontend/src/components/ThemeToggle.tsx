'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-5 w-5" />;
      case 'dark':
        return <Moon className="h-5 w-5" />;
      case 'system':
        return <Monitor className="h-5 w-5" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'flex items-center gap-2 rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors',
        className
      )}
      aria-label={`Current theme: ${getLabel()}. Click to change.`}
      title={`Theme: ${getLabel()}`}
    >
      {getIcon()}
      {showLabel && <span className="text-sm">{getLabel()}</span>}
    </button>
  );
}

export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn('flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1', className)}>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
          theme === 'light'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        )}
        aria-pressed={theme === 'light'}
      >
        <Sun className="h-4 w-4" />
        <span>Light</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
          theme === 'dark'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        )}
        aria-pressed={theme === 'dark'}
      >
        <Moon className="h-4 w-4" />
        <span>Dark</span>
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
          theme === 'system'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        )}
        aria-pressed={theme === 'system'}
      >
        <Monitor className="h-4 w-4" />
        <span>System</span>
      </button>
    </div>
  );
}
