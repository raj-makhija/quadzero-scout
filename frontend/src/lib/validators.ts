export type ValidationRule = (value: unknown) => string | undefined;

export function required(message = 'This field is required'): ValidationRule {
  return (value) => {
    if (value === null || value === undefined || value === '') {
      return message;
    }
    if (Array.isArray(value) && value.length === 0) {
      return message;
    }
    return undefined;
  };
}

export function email(message = 'Please enter a valid email address'): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) {
      return message;
    }
    return undefined;
  };
}

export function minLength(min: number, message?: string): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    const str = String(value);
    if (str.length < min) {
      return message || `Must be at least ${min} characters`;
    }
    return undefined;
  };
}

export function maxLength(max: number, message?: string): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    const str = String(value);
    if (str.length > max) {
      return message || `Must be no more than ${max} characters`;
    }
    return undefined;
  };
}

export function pattern(regex: RegExp, message: string): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    if (!regex.test(String(value))) {
      return message;
    }
    return undefined;
  };
}

export function matches(fieldName: string, getValue: () => unknown, message?: string): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    if (value !== getValue()) {
      return message || `Must match ${fieldName}`;
    }
    return undefined;
  };
}

export function phone(message = 'Please enter a valid phone number'): ValidationRule {
  return (value) => {
    if (!value) return undefined;
    // Basic phone validation - allows various formats
    const phoneRegex = /^[\d\s\-+()]{10,}$/;
    if (!phoneRegex.test(String(value))) {
      return message;
    }
    return undefined;
  };
}

export function minValue(min: number, message?: string): ValidationRule {
  return (value) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    if (isNaN(num) || num < min) {
      return message || `Must be at least ${min}`;
    }
    return undefined;
  };
}

export function maxValue(max: number, message?: string): ValidationRule {
  return (value) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    if (isNaN(num) || num > max) {
      return message || `Must be no more than ${max}`;
    }
    return undefined;
  };
}

export function validate(value: unknown, rules: ValidationRule[]): string | undefined {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return undefined;
}
