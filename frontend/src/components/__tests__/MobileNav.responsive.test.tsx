import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia } from '@/test/test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ theme: 'light', setTheme: vi.fn(), resolvedTheme: 'light' })),
  ThemeProvider: ({ children }: any) => children,
}));

import { MobileNav } from '../MobileNav';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MobileNav responsive behavior', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockMatchMedia(375);
  });

  it('returns null when open is false', () => {
    const { container } = render(
      <MobileNav open={false} onClose={onClose} session={null} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders drawer when open is true', () => {
    render(<MobileNav open={true} onClose={onClose} session={null} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('outer wrapper has md:hidden class', () => {
    render(<MobileNav open={true} onClose={onClose} session={null} />);
    const wrapper = screen.getByRole('dialog').parentElement;
    expect(wrapper!.className).toContain('md:hidden');
  });

  it('has role="dialog" and aria-modal="true"', () => {
    render(<MobileNav open={true} onClose={onClose} session={null} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-label for accessibility', () => {
    render(<MobileNav open={true} onClose={onClose} session={null} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Mobile navigation');
  });

  describe('navigation links', () => {
    it('renders Home, Upload Resume, Search Candidates links', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Upload Resume')).toBeInTheDocument();
      expect(screen.getByText('Search Candidates')).toBeInTheDocument();
    });

    it('renders correct hrefs for nav links', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
      expect(screen.getByText('Upload Resume').closest('a')).toHaveAttribute('href', '/candidate/upload');
      expect(screen.getByText('Search Candidates').closest('a')).toHaveAttribute('href', '/recruiter/search');
    });
  });

  describe('session-dependent content', () => {
    it('shows My Profile link when session is provided', () => {
      const session = { user: { name: 'Jane', email: 'jane@test.com' }, expires: '' };
      render(<MobileNav open={true} onClose={onClose} session={session as any} />);
      expect(screen.getByText('My Profile')).toBeInTheDocument();
      expect(screen.getByText('My Profile').closest('a')).toHaveAttribute('href', '/candidate/profile');
    });

    it('hides My Profile link when session is null', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
    });

    it('shows Sign In and Get Started when unauthenticated', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('shows user name and Sign Out when authenticated', () => {
      const session = { user: { name: 'Jane Doe', email: 'jane@test.com' }, expires: '' };
      render(<MobileNav open={true} onClose={onClose} session={session as any} />);
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('shows "User" as fallback when name is missing', () => {
      const session = { user: { email: 'jane@test.com' }, expires: '' };
      render(<MobileNav open={true} onClose={onClose} session={session as any} />);
      expect(screen.getByText('User')).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('calls onClose when close button is clicked', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      fireEvent.click(screen.getByLabelText('Close menu'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      const backdrop = screen.getByRole('dialog').parentElement!.querySelector('[aria-hidden="true"]');
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape key', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('theme section', () => {
    it('renders theme section with label', () => {
      render(<MobileNav open={true} onClose={onClose} session={null} />);
      expect(screen.getByText('Theme')).toBeInTheDocument();
    });
  });
});
