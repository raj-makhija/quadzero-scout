import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';

// ---------------------------------------------------------------------------
// Mock environment module
// ---------------------------------------------------------------------------
const mockGetStageFromHostname = vi.fn();
const mockShouldShowBanner = vi.fn();
const mockGetEnvironmentConfig = vi.fn();

vi.mock('@/lib/environment', () => ({
  getStageFromHostname: (...args: any[]) => mockGetStageFromHostname(...args),
  shouldShowBanner: (...args: any[]) => mockShouldShowBanner(...args),
  getEnvironmentConfig: (...args: any[]) => mockGetEnvironmentConfig(...args),
}));

import { EnvironmentBanner } from '../EnvironmentBanner';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EnvironmentBanner responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(375);
    mockGetStageFromHostname.mockReset();
    mockShouldShowBanner.mockReset();
    mockGetEnvironmentConfig.mockReset();
  });

  it('returns null for production hostname', () => {
    mockGetStageFromHostname.mockReturnValue('prod');
    mockShouldShowBanner.mockReturnValue(false);

    const { container } = render(<EnvironmentBanner />);

    // After useEffect fires, re-check
    act(() => {}); // flush effects
    expect(container.innerHTML).toBe('');
  });

  it('renders banner for dev hostname', () => {
    mockGetStageFromHostname.mockReturnValue('dev');
    mockShouldShowBanner.mockReturnValue(true);
    mockGetEnvironmentConfig.mockReturnValue({
      label: 'Development',
      bannerColor: '#f59e0b',
    });

    render(<EnvironmentBanner />);
    act(() => {});

    expect(screen.getByText(/Development Environment/)).toBeInTheDocument();
  });

  it('renders banner for staging hostname', () => {
    mockGetStageFromHostname.mockReturnValue('qa');
    mockShouldShowBanner.mockReturnValue(true);
    mockGetEnvironmentConfig.mockReturnValue({
      label: 'QA',
      bannerColor: '#3b82f6',
    });

    render(<EnvironmentBanner />);
    act(() => {});

    expect(screen.getByText(/QA Environment/)).toBeInTheDocument();
  });

  it('banner has sticky positioning class', () => {
    mockGetStageFromHostname.mockReturnValue('dev');
    mockShouldShowBanner.mockReturnValue(true);
    mockGetEnvironmentConfig.mockReturnValue({
      label: 'Development',
      bannerColor: '#f59e0b',
    });

    render(<EnvironmentBanner />);
    act(() => {});

    const banner = screen.getByText(/Development Environment/).closest('div');
    expect(banner!.className).toContain('sticky');
    expect(banner!.className).toContain('top-0');
    expect(banner!.className).toContain('z-50');
  });

  it('applies inline background color from config', () => {
    mockGetStageFromHostname.mockReturnValue('dev');
    mockShouldShowBanner.mockReturnValue(true);
    mockGetEnvironmentConfig.mockReturnValue({
      label: 'Development',
      bannerColor: '#f59e0b',
    });

    render(<EnvironmentBanner />);
    act(() => {});

    const banner = screen.getByText(/Development Environment/).closest('div');
    expect(banner!.style.backgroundColor).toBe('rgb(245, 158, 11)');
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
      mockGetStageFromHostname.mockReturnValue('dev');
      mockShouldShowBanner.mockReturnValue(true);
      mockGetEnvironmentConfig.mockReturnValue({
        label: 'Development',
        bannerColor: '#f59e0b',
      });
    });

    it('renders banner text at all viewports', () => {
      render(<EnvironmentBanner />);
      act(() => {});
      expect(screen.getByText(/Development Environment/)).toBeInTheDocument();
    });
  });

  it('renders animated pulse indicator', () => {
    mockGetStageFromHostname.mockReturnValue('dev');
    mockShouldShowBanner.mockReturnValue(true);
    mockGetEnvironmentConfig.mockReturnValue({
      label: 'Development',
      bannerColor: '#f59e0b',
    });

    render(<EnvironmentBanner />);
    act(() => {});

    const pulse = document.querySelector('.animate-pulse');
    expect(pulse).not.toBeNull();
  });
});
