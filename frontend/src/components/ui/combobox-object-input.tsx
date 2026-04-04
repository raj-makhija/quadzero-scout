'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ComboboxObjectInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  items: T[];
  getLabel: (item: T) => string;
  getFilterValue: (item: T) => string;
  onItemSelect: (item: T) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function ComboboxObjectInput<T>({
  value,
  onChange,
  items,
  getLabel,
  getFilterValue,
  onItemSelect,
  placeholder,
  className,
  disabled,
  id,
}: ComboboxObjectInputProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const justSelectedRef = useRef(false);

  const filtered = value.trim()
    ? items.filter((item) =>
        getFilterValue(item).toLowerCase().includes(value.toLowerCase())
      )
    : items;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setIsOpen(true);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (item: T) => {
      onItemSelect(item);
      setIsOpen(false);
      justSelectedRef.current = true;
      inputRef.current?.focus();
    },
    [onItemSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen && e.key === 'ArrowDown' && filtered.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
        return;
      }

      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
            handleSelect(filtered[highlightedIndex]);
          } else {
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filtered, highlightedIndex, handleSelect]
  );

  const showDropdown = isOpen && filtered.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (justSelectedRef.current) {
            justSelectedRef.current = false;
            return;
          }
          if (items.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('input', className)}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
        aria-activedescendant={
          highlightedIndex >= 0 && id
            ? `${id}-option-${highlightedIndex}`
            : undefined
        }
        autoComplete="off"
      />
      {showDropdown && (
        <ul
          ref={listRef}
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
        >
          {filtered.map((item, index) => (
            <li
              key={index}
              id={id ? `${id}-option-${index}` : undefined}
              role="option"
              aria-selected={highlightedIndex === index}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm text-gray-900 dark:text-gray-100',
                highlightedIndex === index
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {getLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
