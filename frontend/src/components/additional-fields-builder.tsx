'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { AdditionalFieldDefinition } from '@/lib/api';

interface AdditionalFieldsBuilderProps {
  fields: AdditionalFieldDefinition[];
  onChange: (fields: AdditionalFieldDefinition[]) => void;
  readOnly?: boolean;
}

function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const MAX_FIELDS = 20;

export function AdditionalFieldsBuilder({
  fields,
  onChange,
  readOnly = false,
}: AdditionalFieldsBuilderProps) {
  const addField = () => {
    if (fields.length >= MAX_FIELDS) return;
    onChange([
      ...fields,
      { key: '', label: '', type: 'text', required: false },
    ]);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const updateField = (
    index: number,
    updates: Partial<AdditionalFieldDefinition>
  ) => {
    const updated = fields.map((field, i) => {
      if (i !== index) return field;
      const merged = { ...field, ...updates };
      // Auto-generate key from label
      if (updates.label !== undefined) {
        merged.key = slugifyFieldKey(updates.label);
      }
      return merged;
    });
    onChange(updated);
  };

  // Detect duplicate keys
  const keyCounts = new Map<string, number>();
  for (const f of fields) {
    if (f.key) {
      keyCounts.set(f.key, (keyCounts.get(f.key) || 0) + 1);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Additional Data Points
        </h3>
        {!readOnly && fields.length < MAX_FIELDS && (
          <button
            type="button"
            onClick={addField}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Field
          </button>
        )}
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          No additional data points defined. Click &quot;Add Field&quot; to
          request extra information from candidates.
        </p>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => {
          const isDuplicate = field.key && (keyCounts.get(field.key) || 0) > 1;
          return (
            <div
              key={index}
              className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {/* Label */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) =>
                    updateField(index, { label: e.target.value })
                  }
                  placeholder="Field label (e.g., Date of Birth)"
                  className="input text-sm w-full"
                  disabled={readOnly}
                  maxLength={100}
                />
                {field.key && (
                  <span
                    className={`text-xs mt-0.5 block ${
                      isDuplicate
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    key: {field.key}
                    {isDuplicate && ' (duplicate key)'}
                  </span>
                )}
              </div>

              {/* Type */}
              <select
                value={field.type}
                onChange={(e) =>
                  updateField(index, {
                    type: e.target.value as 'text' | 'date' | 'number',
                  })
                }
                className="input text-sm w-28"
                disabled={readOnly}
              >
                <option value="text">Text</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
              </select>

              {/* Required toggle */}
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer whitespace-nowrap pt-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    updateField(index, { required: e.target.checked })
                  }
                  disabled={readOnly}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Required
              </label>

              {/* Remove */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
