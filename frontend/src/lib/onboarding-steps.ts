export interface OnboardingStep {
  id: string;
  target: string; // data-onboard attribute selector
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface OnboardingFlow {
  id: string;
  name: string;
  steps: OnboardingStep[];
}

export const ONBOARDING_FLOWS: Record<string, OnboardingFlow> = {
  candidate: {
    id: 'candidate',
    name: 'Candidate Onboarding',
    steps: [
      {
        id: 'upload-zone',
        target: '[data-onboard="upload-zone"]',
        title: 'Smart Resume Parsing',
        content:
          'Drop your resume here. Our AI will automatically extract your skills, experience, and contact information.',
        position: 'bottom',
      },
      {
        id: 'confidence-banner',
        target: '[data-onboard="confidence-banner"]',
        title: 'AI Confidence Score',
        content:
          'This shows how confident our AI is about the extraction. Lower scores mean you should review the details more carefully.',
        position: 'bottom',
      },
      {
        id: 'skills-section',
        target: '[data-onboard="skills-section"]',
        title: 'Review & Edit Skills',
        content:
          'Add, remove, or modify skills as needed. The AI extraction is just a starting point - you know your experience best.',
        position: 'top',
      },
    ],
  },
  recruiter: {
    id: 'recruiter',
    name: 'Recruiter Onboarding',
    steps: [
      {
        id: 'jd-input',
        target: '[data-onboard="jd-input"]',
        title: 'Paste Your Job Description',
        content:
          'Paste the full job description and our AI will extract must-have and nice-to-have requirements automatically.',
        position: 'bottom',
      },
      {
        id: 'ai-suggestions',
        target: '[data-onboard="ai-suggestions"]',
        title: 'AI Suggestions',
        content:
          'Review these AI-generated suggestions to improve your search criteria and find better matching candidates.',
        position: 'bottom',
      },
      {
        id: 'match-score',
        target: '[data-onboard="match-score"]',
        title: 'Match Score',
        content:
          'Candidates are ranked by how well they match your requirements. Green means 80%+ match, yellow is 60-79%, and red is below 60%.',
        position: 'left',
      },
    ],
  },
};

export const STORAGE_KEY = 'quadzero-onboarding';

export function getCompletedSteps(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

export function markStepComplete(stepId: string): void {
  if (typeof window === 'undefined') return;

  const completed = getCompletedSteps();
  completed.add(stepId);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  } catch {
    // Ignore storage errors
  }
}

export function resetOnboarding(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function isOnboardingDisabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(`${STORAGE_KEY}-disabled`) === 'true';
  } catch {
    return false;
  }
}

export function disableOnboarding(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(`${STORAGE_KEY}-disabled`, 'true');
  } catch {
    // Ignore storage errors
  }
}

export function enableOnboarding(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(`${STORAGE_KEY}-disabled`);
  } catch {
    // Ignore storage errors
  }
}
