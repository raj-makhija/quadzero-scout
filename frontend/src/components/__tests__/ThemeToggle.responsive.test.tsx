import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';
import { ThemeProvider } from '@/context/ThemeContext';

import { ThemeToggle, ThemeSelect } from '../ThemeToggle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWithTheme(ui: React.ReactElement, defaultTheme: 'light' | 'dark' | 'system' = 'light') {
  return render(
    <ThemeProvider defaultTheme={defaultTheme}>
      {ui}
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ThemeToggle responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(1280);
    localStorage.clear();
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders button without errors', () => {
      renderWithTheme(<ThemeToggle />);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('ThemeToggle button', () => {
    it('has aria-label containing current theme', () => {
      renderWithTheme(<ThemeToggle />, 'light');
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('Light');
    });

    it('shows label text when showLabel is true', () => {
      renderWithTheme(<ThemeToggle showLabel />, 'light');
      expect(screen.getByText('Light')).toBeInTheDocument();
    });

    it('does not show label text when showLabel is false', () => {
      renderWithTheme(<ThemeToggle />, 'light');
      // Only the aria-label contains theme name, no visible text
      expect(screen.queryByText('Light')).not.toBeInTheDocument();
    });

    it('cycles from light to dark on click', () => {
      renderWithTheme(<ThemeToggle showLabel />, 'light');
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Dark')).toBeInTheDocument();
    });

    it('cycles from dark to system on click', () => {
      renderWithTheme(<ThemeToggle showLabel />, 'dark');
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('cycles from system to light on click', () => {
      renderWithTheme(<ThemeToggle showLabel />, 'system');
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Light')).toBeInTheDocument();
    });
  });
});

describe('ThemeSelect responsive behavior', () => {
  beforeEach(() => {
    mockMatchMedia(375);
    localStorage.clear();
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders three theme buttons', () => {
      renderWithTheme(<ThemeSelect />);
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  describe('active state', () => {
    it('marks Light as pressed when theme is light', () => {
      renderWithTheme(<ThemeSelect />, 'light');
      const lightBtn = screen.getByText('Light').closest('button');
      expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks Dark as not pressed when theme is light', () => {
      renderWithTheme(<ThemeSelect />, 'light');
      const darkBtn = screen.getByText('Dark').closest('button');
      expect(darkBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks Dark as pressed when theme is dark', () => {
      renderWithTheme(<ThemeSelect />, 'dark');
      const darkBtn = screen.getByText('Dark').closest('button');
      expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks System as pressed when theme is system', () => {
      renderWithTheme(<ThemeSelect />, 'system');
      const sysBtn = screen.getByText('System').closest('button');
      expect(sysBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('interaction', () => {
    it('switches to dark when Dark button is clicked', () => {
      renderWithTheme(<ThemeSelect />, 'light');
      fireEvent.click(screen.getByText('Dark'));
      const darkBtn = screen.getByText('Dark').closest('button');
      expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches to system when System button is clicked', () => {
      renderWithTheme(<ThemeSelect />, 'light');
      fireEvent.click(screen.getByText('System'));
      const sysBtn = screen.getByText('System').closest('button');
      expect(sysBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
