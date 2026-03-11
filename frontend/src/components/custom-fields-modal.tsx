'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdditionalFieldDefinition } from '@/lib/api';

interface CustomFieldsModalProps {
  candidateId: string;
  candidateName: string;
  requirementId: string;
  fieldDefinitions: AdditionalFieldDefinition[];
  existingValues: Record<string, string | number>;
  onClose: () => void;
  onSaved: (candidateId: string, updatedFields: Record<string, string | number>) => void;
}

export function CustomFieldsModal({
  candidateId,
  candidateName,
  requirementId,
  fieldDefinitions,
  existingValues,
  onClose,
  onSaved,
}: CustomFieldsModalProps) {
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const initial: Record<string, string | number> = {};
    for (const field of fieldDefinitions) {
      if (existingValues[field.key] !== undefined) {
        initial[field.key] = existingValues[field.key];
      } else {
        initial[field.key] = field.type === 'number' ? '' as unknown as number : '';
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fieldDefinitions) {
      const val = values[field.key];
      if (field.required && (val === '' || val === undefined || val === null)) {
        errors[field.key] = `${field.label} is required`;
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    setErrorMessage('');

    try {
      // Only send fields that have values
      const fieldsToSave: Record<string, string | number> = {};
      for (const field of fieldDefinitions) {
        const val = values[field.key];
        if (val !== '' && val !== undefined && val !== null) {
          fieldsToSave[field.key] = field.type === 'number' ? Number(val) : val;
        }
      }

      if (Object.keys(fieldsToSave).length === 0) {
        onClose();
        return;
      }

      const result = await api.updateCandidateCustomFields(
        candidateId,
        fieldsToSave,
        requirementId
      );

      onSaved(candidateId, result.customFields);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updateValue = (key: string, value: string | number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear validation error when user types
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Additional Data Points
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {candidateName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {fieldDefinitions.map((field) => {
            const existingVal = existingValues[field.key];
            const isFilled = existingVal !== undefined && existingVal !== null && existingVal !== '';
            const hasError = !!validationErrors[field.key];

            return (
              <div key={field.key} className="space-y-1.5">
                <label className="label flex items-center gap-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500">*</span>}
                  {isFilled && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  )}
                </label>

                {field.type === 'date' ? (
                  <input
                    type="date"
                    value={String(values[field.key] || '')}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    className={`input w-full text-sm ${
                      hasError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    value={values[field.key] === '' ? '' : String(values[field.key])}
                    onChange={(e) =>
                      updateValue(
                        field.key,
                        e.target.value === '' ? '' : e.target.value
                      )
                    }
                    className={`input w-full text-sm ${
                      hasError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                ) : (
                  <input
                    type="text"
                    value={String(values[field.key] || '')}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    className={`input w-full text-sm ${
                      hasError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    maxLength={500}
                  />
                )}

                {hasError && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors[field.key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="btn-secondary text-sm"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
