import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
  signIn: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}));

import Home from '@/app/page';

function renderHome() {
  return render(
    <ThemeProvider defaultTheme="light">
      <Home />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Home page responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(1280);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      renderHome();
      expect(screen.getByText('AI-Powered')).toBeInTheDocument();
    });

    it('all key UI elements are visible', () => {
      renderHome();
      // Hero section
      expect(screen.getByText('AI-Powered')).toBeInTheDocument();
      expect(screen.getByText('Talent Matching')).toBeInTheDocument();
      // CTA buttons
      expect(screen.getByText("I'm a Candidate")).toBeInTheDocument();
      expect(screen.getByText("I'm a Recruiter")).toBeInTheDocument();
      // Features section
      expect(screen.getByText('How It Works')).toBeInTheDocument();
      expect(screen.getByText('For Candidates')).toBeInTheDocument();
      expect(screen.getByText('For Recruiters')).toBeInTheDocument();
      // Footer
      expect(screen.getByText('Privacy')).toBeInTheDocument();
      expect(screen.getByText('Terms')).toBeInTheDocument();
      expect(screen.getByText('Contact')).toBeInTheDocument();
    });
  });

  describe('responsive CSS classes', () => {
    beforeEach(() => {
      setViewport('mobilePortrait');
    });

    it('hero heading has responsive text size classes', () => {
      renderHome();
      const h1 = screen.getByText('AI-Powered').closest('h1');
      expect(h1!.className).toContain('text-4xl');
      expect(h1!.className).toContain('sm:text-5xl');
      expect(h1!.className).toContain('md:text-6xl');
    });

    it('hero section has responsive padding classes', () => {
      renderHome();
      const heroContainer = screen.getByText('AI-Powered').closest('h1')!.parentElement!.parentElement;
      expect(heroContainer!.className).toContain('px-4');
      expect(heroContainer!.className).toContain('sm:px-6');
      expect(heroContainer!.className).toContain('lg:px-8');
    });

    it('CTA buttons container has responsive flex direction', () => {
      renderHome();
      const ctaContainer = screen.getByText("I'm a Candidate").parentElement;
      expect(ctaContainer!.className).toContain('flex-col');
      expect(ctaContainer!.className).toContain('sm:flex-row');
    });

    it('CTA buttons have responsive width classes', () => {
      renderHome();
      const candidateBtn = screen.getByText("I'm a Candidate");
      expect(candidateBtn.className).toContain('w-full');
      expect(candidateBtn.className).toContain('sm:w-auto');
    });

    it('features grid has responsive column classes', () => {
      renderHome();
      const featuresGrid = screen.getByText('For Candidates').closest('.card')!.parentElement;
      expect(featuresGrid!.className).toContain('grid-cols-1');
      expect(featuresGrid!.className).toContain('md:grid-cols-2');
    });

    it('footer layout has responsive flex direction', () => {
      renderHome();
      const footerInner = screen.getByText('Privacy').closest('div')!.parentElement;
      expect(footerInner!.className).toContain('flex-col');
      expect(footerInner!.className).toContain('md:flex-row');
    });

    it('footer spacing adjusts at md breakpoint', () => {
      renderHome();
      // The logo container has mb-4 md:mb-0
      const logoContainer = screen.getByText('Quadzero Scout', { selector: 'span' })
        .closest('div');
      expect(logoContainer!.className).toContain('mb-4');
      expect(logoContainer!.className).toContain('md:mb-0');
    });
  });

  describe('navigation links', () => {
    it('candidate CTA links to /candidate/upload', () => {
      renderHome();
      const link = screen.getByText("I'm a Candidate").closest('a');
      expect(link).toHaveAttribute('href', '/candidate/upload');
    });

    it('recruiter CTA links to /recruiter/search', () => {
      renderHome();
      const link = screen.getByText("I'm a Recruiter").closest('a');
      expect(link).toHaveAttribute('href', '/recruiter/search');
    });

    it('Upload Resume card links to /candidate/upload', () => {
      renderHome();
      const links = screen.getAllByText('Upload Resume');
      const cardLink = links.find(el => el.closest('a'));
      expect(cardLink!.closest('a')).toHaveAttribute('href', '/candidate/upload');
    });

    it('Start Searching card links to /recruiter/search', () => {
      renderHome();
      const link = screen.getByText('Start Searching').closest('a');
      expect(link).toHaveAttribute('href', '/recruiter/search');
    });
  });

  describe('footer content', () => {
    it('renders copyright with current year', () => {
      renderHome();
      const year = new Date().getFullYear().toString();
      expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
    });
  });
});
