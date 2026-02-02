import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';

import { FormField, FormInput, FormSelect, FormTextarea } from '../ui/form-field';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FormField responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders label and children', () => {
      render(
        <FormField label="Email" htmlFor="email">
          <input id="email" type="email" />
        </FormField>
      );
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('required field', () => {
    it('shows required asterisk when required is true', () => {
      render(
        <FormField label="Name" required>
          <input />
        </FormField>
      );
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('does not show asterisk when required is false', () => {
      render(
        <FormField label="Name">
          <input />
        </FormField>
      );
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('shows error message when touched and error is provided', () => {
      render(
        <FormField label="Email" error="Invalid email" touched>
          <input />
        </FormField>
      );
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });

    it('does not show error when not touched', () => {
      render(
        <FormField label="Email" error="Invalid email" touched={false}>
          <input />
        </FormField>
      );
      expect(screen.queryByText('Invalid email')).not.toBeInTheDocument();
    });

    it('shows error icon when touched and error exists', () => {
      const { container } = render(
        <FormField label="Email" error="Bad" touched>
          <input />
        </FormField>
      );
      // AlertCircle icon in validation position
      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('hint display', () => {
    it('shows hint text when no error', () => {
      render(
        <FormField label="Name" hint="Enter your full name">
          <input />
        </FormField>
      );
      expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    });

    it('hides hint when error is shown', () => {
      render(
        <FormField label="Name" hint="Enter your full name" error="Required" touched>
          <input />
        </FormField>
      );
      expect(screen.queryByText('Enter your full name')).not.toBeInTheDocument();
      expect(screen.getByText('Required')).toBeInTheDocument();
    });
  });

  describe('valid state', () => {
    it('shows check icon when touched, no error, and showValidIcon is true', () => {
      const { container } = render(
        <FormField label="Email" touched showValidIcon>
          <input />
        </FormField>
      );
      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });
});

describe('FormInput', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  it('renders with base input class', () => {
    render(<FormInput data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('input');
  });

  it('applies error border class when hasError', () => {
    render(<FormInput hasError data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('border-red-500');
  });

  it('applies valid border class when isValid', () => {
    render(<FormInput isValid data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('border-green-500');
  });

  it('does not apply error/valid classes by default', () => {
    render(<FormInput data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).not.toContain('border-red-500');
    expect(input.className).not.toContain('border-green-500');
  });
});

describe('FormTextarea', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  it('renders as textarea element', () => {
    render(<FormTextarea data-testid="ta" />);
    expect(screen.getByTestId('ta').tagName).toBe('TEXTAREA');
  });

  it('applies error class when hasError', () => {
    render(<FormTextarea hasError data-testid="ta" />);
    expect(screen.getByTestId('ta').className).toContain('border-red-500');
  });

  it('applies valid class when isValid', () => {
    render(<FormTextarea isValid data-testid="ta" />);
    expect(screen.getByTestId('ta').className).toContain('border-green-500');
  });
});

describe('FormSelect', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
    { value: 'c', label: 'Option C' },
  ];

  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders all options', () => {
      render(<FormSelect options={options} />);
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
      expect(screen.getByText('Option C')).toBeInTheDocument();
    });
  });

  it('renders placeholder option when provided', () => {
    render(<FormSelect options={options} placeholder="Select one..." />);
    expect(screen.getByText('Select one...')).toBeInTheDocument();
  });

  it('applies error class when hasError', () => {
    render(<FormSelect options={options} hasError data-testid="sel" />);
    expect(screen.getByTestId('sel').className).toContain('border-red-500');
  });

  it('applies valid class when isValid', () => {
    render(<FormSelect options={options} isValid data-testid="sel" />);
    expect(screen.getByTestId('sel').className).toContain('border-green-500');
  });
});
