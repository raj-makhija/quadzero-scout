import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockUsePathname = vi.fn(() => '/');

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: () => mockUsePathname(),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { BottomNav } from '../BottomNav';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('BottomNav responsive behavior', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      render(<BottomNav />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('nav element has md:hidden class', () => {
      render(<BottomNav />);
      const nav = screen.getByRole('navigation');
      expect(nav.className).toContain('md:hidden');
    });
  });

  describe('navigation items', () => {
    it('renders exactly 4 navigation items', () => {
      render(<BottomNav />);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(4);
    });

    it('renders Home link with correct href', () => {
      render(<BottomNav />);
      expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    });

    it('renders Upload link with correct href', () => {
      render(<BottomNav />);
      expect(screen.getByText('Upload').closest('a')).toHaveAttribute('href', '/candidate/upload');
    });

    it('renders Search link with correct href', () => {
      render(<BottomNav />);
      expect(screen.getByText('Search').closest('a')).toHaveAttribute('href', '/recruiter/search');
    });

    it('renders Profile link with correct href', () => {
      render(<BottomNav />);
      expect(screen.getByText('Profile').closest('a')).toHaveAttribute('href', '/candidate/profile');
    });
  });

  describe('active state', () => {
    it('highlights Home when pathname is /', () => {
      mockUsePathname.mockReturnValue('/');
      render(<BottomNav />);
      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink!.className).toContain('text-primary-600');
    });

    it('highlights Upload when pathname is /candidate/upload', () => {
      mockUsePathname.mockReturnValue('/candidate/upload');
      render(<BottomNav />);
      const uploadLink = screen.getByText('Upload').closest('a');
      expect(uploadLink!.className).toContain('text-primary-600');
    });

    it('highlights Search when pathname is /recruiter/search', () => {
      mockUsePathname.mockReturnValue('/recruiter/search');
      render(<BottomNav />);
      const searchLink = screen.getByText('Search').closest('a');
      expect(searchLink!.className).toContain('text-primary-600');
    });

    it('does not highlight inactive items', () => {
      mockUsePathname.mockReturnValue('/');
      render(<BottomNav />);
      const uploadLink = screen.getByText('Upload').closest('a');
      expect(uploadLink!.className).toContain('text-gray-500');
    });
  });

  describe('fixed positioning', () => {
    it('nav has fixed bottom positioning', () => {
      render(<BottomNav />);
      const nav = screen.getByRole('navigation');
      expect(nav.className).toContain('fixed');
      expect(nav.className).toContain('bottom-0');
    });
  });
});
