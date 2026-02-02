'use client';

import { useState, useCallback, useMemo } from 'react';
import { ValidationRule, validate } from '@/lib/validators';

type FieldRules<T> = {
  [K in keyof T]?: ValidationRule[];
};

type FieldErrors<T> = {
  [K in keyof T]?: string;
};

type TouchedFields<T> = {
  [K in keyof T]?: boolean;
};

interface UseFormValidationOptions<T> {
  rules: FieldRules<T>;
  initialValues?: Partial<T>;
}

export function useFormValidation<T extends Record<string, unknown>>({
  rules,
  initialValues = {},
}: UseFormValidationOptions<T>) {
  const [values, setValues] = useState<Partial<T>>(initialValues);
  const [touched, setTouched] = useState<TouchedFields<T>>({});
  const [errors, setErrors] = useState<FieldErrors<T>>({});

  const validateField = useCallback(
    (field: keyof T, value: unknown): string | undefined => {
      const fieldRules = rules[field];
      if (!fieldRules) return undefined;
      return validate(value, fieldRules);
    },
    [rules]
  );

  const validateAllFields = useCallback((): boolean => {
    const newErrors: FieldErrors<T> = {};
    let isValid = true;

    for (const field of Object.keys(rules) as Array<keyof T>) {
      const error = validateField(field, values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [rules, values, validateField]);

  const setValue = useCallback(
    (field: keyof T, value: unknown) => {
      setValues((prev) => ({ ...prev, [field]: value }));

      // Clear error when user starts typing if field was touched
      if (touched[field]) {
        const error = validateField(field, value);
        setErrors((prev) => ({ ...prev, [field]: error }));
      }
    },
    [touched, validateField]
  );

  const setFieldTouched = useCallback(
    (field: keyof T, isTouched = true) => {
      setTouched((prev) => ({ ...prev, [field]: isTouched }));

      // Validate on blur
      if (isTouched) {
        const error = validateField(field, values[field]);
        setErrors((prev) => ({ ...prev, [field]: error }));
      }
    },
    [validateField, values]
  );

  const resetForm = useCallback(
    (newValues?: Partial<T>) => {
      setValues(newValues || initialValues);
      setTouched({});
      setErrors({});
    },
    [initialValues]
  );

  const getFieldProps = useCallback(
    (field: keyof T) => ({
      value: values[field] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setValue(field, e.target.value);
      },
      onBlur: () => setFieldTouched(field, true),
    }),
    [values, setValue, setFieldTouched]
  );

  const isValid = useMemo(() => {
    for (const field of Object.keys(rules) as Array<keyof T>) {
      const error = validateField(field, values[field]);
      if (error) return false;
    }
    return true;
  }, [rules, values, validateField]);

  const hasError = useCallback(
    (field: keyof T) => touched[field] && !!errors[field],
    [touched, errors]
  );

  const getError = useCallback(
    (field: keyof T) => (touched[field] ? errors[field] : undefined),
    [touched, errors]
  );

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateField,
    validateAllFields,
    resetForm,
    getFieldProps,
    isValid,
    hasError,
    getError,
  };
}
