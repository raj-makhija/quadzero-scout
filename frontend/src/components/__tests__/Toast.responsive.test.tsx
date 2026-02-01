import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';
import type { Toast as ToastType, ToastVariant } from '@/hooks/use-toast';

import { Toast } from '../ui/toast';
import { Toaster } from '../ui/toaster';

// ---------------------------------------------------------------------------
// Mock useToast for Toaster tests
// ---------------------------------------------------------------------------
const mockToasts: ToastType[] = [];
const mockDismiss = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toasts: mockToasts,
    dismiss: mockDismiss,
    toast: vi.fn(),
    dismissAll: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeToast(overrides: Partial<ToastType> = {}): ToastType {
  return {
    id: 'toast-1',
    title: 'Success',
    description: 'Your profile was saved.',
    variant: 'success' as ToastVariant,
    duration: 5000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Toast component', () => {
  const onDismiss = vi.fn();

  beforeEach(() => {
    onDismiss.mockClear();
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders toast title and description', () => {
      render(<Toast toast={makeToast()} onDismiss={onDismiss} />);
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Your profile was saved.')).toBeInTheDocument();
    });
  });

  it('has role="alert"', () => {
    render(<Toast toast={makeToast()} onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has aria-live="assertive"', () => {
    render(<Toast toast={makeToast()} onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  describe('variant icons', () => {
    it('renders success icon for success variant', () => {
      const { container } = render(
        <Toast toast={makeToast({ variant: 'success' })} onDismiss={onDismiss} />
      );
      // Success variant renders CheckCircle SVG with text-green-500
      const icon = container.querySelector('.text-green-500');
      expect(icon).not.toBeNull();
    });

    it('renders error icon for error variant', () => {
      const { container } = render(
        <Toast toast={makeToast({ variant: 'error' })} onDismiss={onDismiss} />
      );
      const icon = container.querySelector('.text-red-500');
      expect(icon).not.toBeNull();
    });

    it('renders warning icon for warning variant', () => {
      const { container } = render(
        <Toast toast={makeToast({ variant: 'warning' })} onDismiss={onDismiss} />
      );
      const icon = container.querySelector('.text-yellow-500');
      expect(icon).not.toBeNull();
    });

    it('renders info icon for info variant', () => {
      const { container } = render(
        <Toast toast={makeToast({ variant: 'info' })} onDismiss={onDismiss} />
      );
      const icon = container.querySelector('.text-blue-500');
      expect(icon).not.toBeNull();
    });

    it('renders no variant icon for default variant', () => {
      const { container } = render(
        <Toast toast={makeToast({ variant: 'default' })} onDismiss={onDismiss} />
      );
      // No colored icon for default
      expect(container.querySelector('.text-green-500')).toBeNull();
      expect(container.querySelector('.text-red-500')).toBeNull();
    });
  });

  describe('action button', () => {
    it('renders action button when action is provided', () => {
      const onClick = vi.fn();
      render(
        <Toast
          toast={makeToast({ action: { label: 'Undo', onClick } })}
          onDismiss={onDismiss}
        />
      );
      expect(screen.getByText('Undo')).toBeInTheDocument();
    });

    it('calls action onClick when action button is clicked', () => {
      const onClick = vi.fn();
      render(
        <Toast
          toast={makeToast({ action: { label: 'Undo', onClick } })}
          onDismiss={onDismiss}
        />
      );
      fireEvent.click(screen.getByText('Undo'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not render action button when action is not provided', () => {
      render(<Toast toast={makeToast()} onDismiss={onDismiss} />);
      expect(screen.queryByText('Undo')).not.toBeInTheDocument();
    });
  });

  describe('dismiss button', () => {
    it('has dismiss button with aria-label', () => {
      render(<Toast toast={makeToast()} onDismiss={onDismiss} />);
      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    });
  });

  describe('variant border styles', () => {
    it('applies success border for success variant', () => {
      render(<Toast toast={makeToast({ variant: 'success' })} onDismiss={onDismiss} />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('border-green-200');
    });

    it('applies error border for error variant', () => {
      render(<Toast toast={makeToast({ variant: 'error' })} onDismiss={onDismiss} />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('border-red-200');
    });
  });
});

describe('Toaster responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(375);
    mockToasts.length = 0;
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      render(<Toaster />);
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });
  });

  it('has responsive positioning classes', () => {
    render(<Toaster />);
    const container = screen.getByLabelText('Notifications');
    expect(container.className).toContain('sm:bottom-4');
    expect(container.className).toContain('sm:right-4');
    expect(container.className).toContain('sm:max-w-sm');
  });

  it('has fixed positioning', () => {
    render(<Toaster />);
    const container = screen.getByLabelText('Notifications');
    expect(container.className).toContain('fixed');
    expect(container.className).toContain('bottom-0');
    expect(container.className).toContain('right-0');
    expect(container.className).toContain('z-50');
  });

  it('has full width on mobile (w-full)', () => {
    render(<Toaster />);
    const container = screen.getByLabelText('Notifications');
    expect(container.className).toContain('w-full');
  });
});
