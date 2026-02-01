import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import {
  EmptyState,
  NoSearchResults,
  NoProfileFound,
  NoSavedSearches,
  ErrorState,
} from '../EmptyState';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EmptyState component', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders title and description', () => {
      render(
        <EmptyState
          title="No items found"
          description="Try a different search."
        />
      );
      expect(screen.getByText('No items found')).toBeInTheDocument();
      expect(screen.getByText('Try a different search.')).toBeInTheDocument();
    });

    it('renders without errors across viewports', () => {
      render(<EmptyState title="Test" />);
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  describe('icon rendering', () => {
    it('renders icon for no-results variant', () => {
      const { container } = render(<EmptyState variant="no-results" title="No results" />);
      // Lucide icon renders as SVG
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('renders custom icon when provided', () => {
      render(
        <EmptyState
          variant="custom"
          icon={<span data-testid="custom-icon">!</span>}
          title="Custom"
        />
      );
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('renders no icon for custom variant without icon prop', () => {
      const { container } = render(
        <EmptyState variant="custom" title="Custom no icon" />
      );
      expect(container.querySelector('svg')).toBeNull();
    });
  });

  describe('action buttons', () => {
    it('renders action with href as a link', () => {
      render(
        <EmptyState
          title="Test"
          actions={[{ label: 'Go Home', href: '/', variant: 'primary' }]}
        />
      );
      const link = screen.getByText('Go Home').closest('a');
      expect(link).toHaveAttribute('href', '/');
    });

    it('renders action without href as a button', () => {
      const onClick = vi.fn();
      render(
        <EmptyState
          title="Test"
          actions={[{ label: 'Retry', onClick, variant: 'primary' }]}
        />
      );
      const button = screen.getByText('Retry');
      expect(button.tagName).toBe('BUTTON');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('applies btn-primary class for primary variant', () => {
      render(
        <EmptyState
          title="Test"
          actions={[{ label: 'Primary', href: '/', variant: 'primary' }]}
        />
      );
      expect(screen.getByText('Primary').className).toContain('btn-primary');
    });

    it('applies btn-secondary class for secondary variant', () => {
      render(
        <EmptyState
          title="Test"
          actions={[{ label: 'Secondary', href: '/', variant: 'secondary' }]}
        />
      );
      expect(screen.getByText('Secondary').className).toContain('btn-secondary');
    });

    it('actions container uses flex-wrap for responsive layout', () => {
      render(
        <EmptyState
          title="Test"
          actions={[
            { label: 'A', href: '/' },
            { label: 'B', href: '/' },
          ]}
        />
      );
      const actionsContainer = screen.getByText('A').parentElement;
      expect(actionsContainer!.className).toContain('flex-wrap');
    });
  });
});

describe('Pre-configured empty states', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe('NoSearchResults', () => {
    it('renders correct title and description', () => {
      render(<NoSearchResults />);
      expect(screen.getByText('No candidates found')).toBeInTheDocument();
      expect(screen.getByText(/Try adjusting your search criteria/)).toBeInTheDocument();
    });

    it('renders Modify Search button when callback provided', () => {
      const onModify = vi.fn();
      render(<NoSearchResults onModifySearch={onModify} />);
      const btn = screen.getByText('Modify Search');
      fireEvent.click(btn);
      expect(onModify).toHaveBeenCalledTimes(1);
    });

    it('renders Clear Filters button when callback provided', () => {
      const onClear = vi.fn();
      render(<NoSearchResults onClearFilters={onClear} />);
      const btn = screen.getByText('Clear Filters');
      fireEvent.click(btn);
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('NoProfileFound', () => {
    it('renders correct title', () => {
      render(<NoProfileFound />);
      expect(screen.getByText('Profile not found')).toBeInTheDocument();
    });

    it('renders Upload Resume link to /candidate/upload', () => {
      render(<NoProfileFound />);
      expect(screen.getByText('Upload Resume').closest('a')).toHaveAttribute('href', '/candidate/upload');
    });

    it('renders Go Home link to /', () => {
      render(<NoProfileFound />);
      expect(screen.getByText('Go Home').closest('a')).toHaveAttribute('href', '/');
    });
  });

  describe('NoSavedSearches', () => {
    it('renders correct title and description', () => {
      render(<NoSavedSearches />);
      expect(screen.getByText('No saved searches')).toBeInTheDocument();
      expect(screen.getByText(/Save your search criteria/)).toBeInTheDocument();
    });

    it('renders Create Search link to /recruiter/search', () => {
      render(<NoSavedSearches />);
      expect(screen.getByText('Create Search').closest('a')).toHaveAttribute('href', '/recruiter/search');
    });
  });

  describe('ErrorState', () => {
    it('renders default error title and description', () => {
      render(<ErrorState />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    });

    it('renders custom error message', () => {
      render(<ErrorState message="Database connection failed" />);
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });

    it('renders Try Again button when onRetry provided', () => {
      const onRetry = vi.fn();
      render(<ErrorState onRetry={onRetry} />);
      const btn = screen.getByText('Try Again');
      fireEvent.click(btn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('always renders Go Home link', () => {
      render(<ErrorState />);
      expect(screen.getByText('Go Home').closest('a')).toHaveAttribute('href', '/');
    });
  });
});
