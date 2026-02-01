import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@/context/ThemeContext';

// ---------------------------------------------------------------------------
// Viewport definitions (matching common device dimensions)
// ---------------------------------------------------------------------------
export const VIEWPORTS = {
  mobilePortrait:  { width: 375,  height: 667  },
  mobileLandscape: { width: 667,  height: 375  },
  tabletPortrait:  { width: 768,  height: 1024 },
  tabletLandscape: { width: 1024, height: 768  },
  desktop:         { width: 1280, height: 800  },
  largeDesktop:    { width: 1920, height: 1080 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export const ALL_VIEWPORTS = Object.entries(VIEWPORTS).map(
  ([name, dims]) => ({ name: name as ViewportName, ...dims })
);

// ---------------------------------------------------------------------------
// window.matchMedia mock (jsdom does not implement matchMedia)
// ---------------------------------------------------------------------------
export function mockMatchMedia(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    const colorSchemeMatch = query.match(/\(prefers-color-scheme:\s*(dark|light)\)/);

    let matches = false;
    if (minWidthMatch) {
      matches = width >= parseInt(minWidthMatch[1], 10);
    } else if (colorSchemeMatch) {
      matches = false; // default to light mode
    }

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
}

export function setViewport(viewport: ViewportName) {
  const { width, height } = VIEWPORTS[viewport];
  mockMatchMedia(width);
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
}

// ---------------------------------------------------------------------------
// Custom render with providers
// ---------------------------------------------------------------------------
interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  theme?: 'light' | 'dark' | 'system';
}

function AllProviders({ children, theme = 'light' }: { children: React.ReactNode; theme?: string }) {
  return (
    <ThemeProvider defaultTheme={theme as 'light' | 'dark' | 'system'}>
      {children}
    </ThemeProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: ExtendedRenderOptions = {}
) {
  const { theme, ...renderOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => <AllProviders theme={theme}>{children}</AllProviders>,
    ...renderOptions,
  });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { renderWithProviders as renderUI };
