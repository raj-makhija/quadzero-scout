import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';
import {
  CandidateCardSkeleton,
  CandidateListSkeleton,
} from '../skeletons/CandidateListSkeleton';
import { ReviewFormSkeleton, SearchCriteriaSkeleton } from '../skeletons/FormSkeleton';
import { ProfileCardSkeleton } from '../skeletons/ProfileCardSkeleton';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CandidateCardSkeleton', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      const { container } = render(<CandidateCardSkeleton />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  it('contains animated skeleton elements', () => {
    render(<CandidateCardSkeleton />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('has card styling', () => {
    const { container } = render(<CandidateCardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('card');
  });
});

describe('CandidateListSkeleton', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  it('renders default 5 skeleton cards', () => {
    const { container } = render(<CandidateListSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(5);
  });

  it('renders custom count of skeleton cards', () => {
    const { container } = render(<CandidateListSkeleton count={3} />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(3);
  });

  it('renders single card when count is 1', () => {
    const { container } = render(<CandidateListSkeleton count={1} />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(1);
  });
});

describe('ReviewFormSkeleton', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      const { container } = render(<ReviewFormSkeleton />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  it('contains grid-cols-2 for basic info section', () => {
    const { container } = render(<ReviewFormSkeleton />);
    const gridCols2 = container.querySelector('.grid-cols-2');
    expect(gridCols2).not.toBeNull();
  });

  it('contains grid-cols-3 for experience section', () => {
    const { container } = render(<ReviewFormSkeleton />);
    const gridCols3 = container.querySelector('.grid-cols-3');
    expect(gridCols3).not.toBeNull();
  });

  it('contains animated skeleton elements', () => {
    render(<ReviewFormSkeleton />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });
});

describe('SearchCriteriaSkeleton', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      const { container } = render(<SearchCriteriaSkeleton />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  it('contains responsive grid with lg:grid-cols-2', () => {
    const { container } = render(<SearchCriteriaSkeleton />);
    const grid = container.querySelector('.grid-cols-1.lg\\:grid-cols-2');
    expect(grid).not.toBeNull();
  });

  it('contains animated skeleton elements', () => {
    render(<SearchCriteriaSkeleton />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });
});

describe('ProfileCardSkeleton', () => {
  beforeEach(() => {
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders without errors', () => {
      const { container } = render(<ProfileCardSkeleton />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  it('has responsive quick stats grid (sm:grid-cols-3)', () => {
    const { container } = render(<ProfileCardSkeleton />);
    const statsGrid = container.querySelector('.grid-cols-1.sm\\:grid-cols-3');
    expect(statsGrid).not.toBeNull();
  });

  it('has responsive industries/roles grid (sm:grid-cols-2)', () => {
    const { container } = render(<ProfileCardSkeleton />);
    const sectionGrid = container.querySelector('.grid-cols-1.sm\\:grid-cols-2');
    expect(sectionGrid).not.toBeNull();
  });

  it('contains animated skeleton elements', () => {
    render(<ProfileCardSkeleton />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('has dark mode classes', () => {
    const { container } = render(<ProfileCardSkeleton />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('dark:bg-gray-900');
  });
});
