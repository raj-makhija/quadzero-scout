import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';
import { ThemeProvider } from '@/context/ThemeContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

const mockUseSession = vi.fn(() => ({
  data: null,
  status: 'unauthenticated' as const,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}));

import { Header } from '../Header';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  return render(
    <ThemeProvider defaultTheme="light">
      <Header {...props} />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Header responsive behavior', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockMatchMedia(1280);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name, width }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      renderHeader();
      expect(screen.getByText('Quadzero Scout')).toBeInTheDocument();
    });

    it('desktop nav has correct responsive classes (hidden md:flex)', () => {
      renderHeader();
      const desktopNav = document.querySelector('nav.hidden.md\\:flex');
      expect(desktopNav).not.toBeNull();
      expect(desktopNav!.className).toContain('hidden');
      expect(desktopNav!.className).toContain('md:flex');
    });

    it('mobile menu button container has md:hidden class', () => {
      renderHeader();
      const mobileContainer = screen.getByLabelText('Open menu').parentElement;
      expect(mobileContainer!.className).toContain('md:hidden');
    });
  });

  describe('children responsive visibility', () => {
    it('desktop children container has hidden md:flex classes', () => {
      renderHeader({ children: <span data-testid="step-indicator">Step 1</span> });
      const desktopChildren = screen.getAllByTestId('step-indicator')[0].parentElement;
      expect(desktopChildren!.className).toContain('hidden');
      expect(desktopChildren!.className).toContain('md:flex');
    });

    it('mobile children container has md:hidden class', () => {
      renderHeader({ children: <span data-testid="step-indicator">Step 1</span> });
      // There are two instances of step-indicator: desktop (hidden md:flex) and mobile (md:hidden)
      const containers = screen.getAllByTestId('step-indicator').map(el => el.parentElement!);
      const mobileContainer = containers.find(c => c.className.includes('md:hidden'));
      expect(mobileContainer).toBeTruthy();
    });
  });

  describe('authentication states', () => {
    it('shows Sign In and Get Started links when unauthenticated', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      renderHeader();
      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('shows user name and Sign Out when authenticated', () => {
      mockUseSession.mockReturnValue({
        data: { user: { name: 'Jane Doe', email: 'jane@test.com' }, expires: '' },
        status: 'authenticated',
      });
      renderHeader();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('shows loading skeleton when session is loading', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'loading' });
      renderHeader();
      const skeleton = document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });
  });

  describe('mobile menu interaction', () => {
    it('opens mobile nav drawer when hamburger button is clicked', () => {
      renderHeader();
      const menuButton = screen.getByLabelText('Open menu');
      fireEvent.click(menuButton);
      // MobileNav renders a dialog when open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('showNav prop', () => {
    it('hides navigation when showNav is false', () => {
      renderHeader({ showNav: false });
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    });
  });
});
