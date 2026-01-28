'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  OnboardingStep,
  ONBOARDING_FLOWS,
  getCompletedSteps,
  markStepComplete,
  isOnboardingDisabled,
  disableOnboarding,
} from '@/lib/onboarding-steps';

interface UseOnboardingOptions {
  flowId: 'candidate' | 'recruiter';
}

interface UseOnboardingReturn {
  currentStep: OnboardingStep | null;
  currentStepIndex: number;
  totalSteps: number;
  isActive: boolean;
  isDisabled: boolean;
  goToNext: () => void;
  dismiss: () => void;
  dismissAll: () => void;
  skipRemaining: () => void;
}

export function useOnboarding({ flowId }: UseOnboardingOptions): UseOnboardingReturn {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isDisabled, setIsDisabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  const flow = ONBOARDING_FLOWS[flowId];
  const steps = flow?.steps || [];

  useEffect(() => {
    setMounted(true);
    setCompletedSteps(getCompletedSteps());
    setIsDisabled(isOnboardingDisabled());
  }, []);

  // Find first incomplete step
  const currentStepIndex = steps.findIndex(
    (step) => !completedSteps.has(`${flowId}-${step.id}`)
  );

  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
  const isActive = mounted && !isDisabled && currentStep !== null;

  const goToNext = useCallback(() => {
    if (currentStep) {
      const stepKey = `${flowId}-${currentStep.id}`;
      markStepComplete(stepKey);
      setCompletedSteps((prev) => new Set([...prev, stepKey]));
    }
  }, [currentStep, flowId]);

  const dismiss = useCallback(() => {
    goToNext();
  }, [goToNext]);

  const dismissAll = useCallback(() => {
    disableOnboarding();
    setIsDisabled(true);
  }, []);

  const skipRemaining = useCallback(() => {
    // Mark all remaining steps as complete
    steps.forEach((step) => {
      const stepKey = `${flowId}-${step.id}`;
      markStepComplete(stepKey);
    });
    setCompletedSteps(
      new Set(steps.map((step) => `${flowId}-${step.id}`))
    );
  }, [steps, flowId]);

  return {
    currentStep,
    currentStepIndex,
    totalSteps: steps.length,
    isActive,
    isDisabled,
    goToNext,
    dismiss,
    dismissAll,
    skipRemaining,
  };
}
