'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { X, ChevronRight, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnboardingStep } from '@/lib/onboarding-steps';

type Position = 'top' | 'bottom' | 'left' | 'right';

interface OnboardingTooltipProps {
  step: OnboardingStep;
  currentIndex: number;
  totalSteps: number;
  onNext: () => void;
  onDismiss: () => void;
  onDismissAll: () => void;
  children: ReactNode;
}

const positionClasses: Record<Position, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-3',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-3',
  left: 'right-full top-1/2 -translate-y-1/2 mr-3',
  right: 'left-full top-1/2 -translate-y-1/2 ml-3',
};

const arrowClasses: Record<Position, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-primary-600 border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary-600 border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-primary-600 border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-primary-600 border-y-transparent border-l-transparent',
};

export function OnboardingTooltip({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onDismiss,
  onDismissAll,
  children,
}: OnboardingTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const position = step.position || 'bottom';

  useEffect(() => {
    // Delay showing tooltip for smoother UX
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, [step.id]);

  // Scroll target element into view
  useEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        tooltipRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [isVisible]);

  const isLastStep = currentIndex === totalSteps - 1;

  return (
    <div className="relative inline-block" ref={tooltipRef}>
      {/* Highlight ring around target */}
      <div className="relative">
        <div
          className={cn(
            'absolute -inset-2 rounded-lg transition-all duration-300',
            isVisible
              ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 bg-primary-50/30 dark:bg-primary-900/20'
              : ''
          )}
        />
        <div className="relative">{children}</div>
      </div>

      {/* Tooltip */}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 w-80 bg-primary-600 text-white rounded-lg shadow-xl transition-opacity duration-200',
            positionClasses[position]
          )}
          role="dialog"
          aria-labelledby={`onboarding-title-${step.id}`}
          aria-describedby={`onboarding-content-${step.id}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-primary-500">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-primary-200">
                Step {currentIndex + 1} of {totalSteps}
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-primary-500 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <h4
              id={`onboarding-title-${step.id}`}
              className="font-semibold text-white mb-1"
            >
              {step.title}
            </h4>
            <p
              id={`onboarding-content-${step.id}`}
              className="text-sm text-primary-100"
            >
              {step.content}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-3 border-t border-primary-500">
            <button
              onClick={onDismissAll}
              className="text-xs text-primary-200 hover:text-white flex items-center gap-1"
            >
              <EyeOff className="h-3 w-3" />
              Don&apos;t show again
            </button>
            <button
              onClick={onNext}
              className="flex items-center gap-1 px-3 py-1.5 bg-white text-primary-600 rounded-md text-sm font-medium hover:bg-primary-50 transition-colors"
            >
              {isLastStep ? 'Got it' : 'Next'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>

          {/* Arrow */}
          <div
            className={cn(
              'absolute w-0 h-0 border-8',
              arrowClasses[position]
            )}
          />
        </div>
      )}
    </div>
  );
}

// Wrapper component that handles the onboarding logic
interface OnboardingWrapperProps {
  targetId: string;
  step: OnboardingStep | null;
  currentIndex: number;
  totalSteps: number;
  onNext: () => void;
  onDismiss: () => void;
  onDismissAll: () => void;
  children: ReactNode;
}

export function OnboardingWrapper({
  targetId,
  step,
  currentIndex,
  totalSteps,
  onNext,
  onDismiss,
  onDismissAll,
  children,
}: OnboardingWrapperProps) {
  // Check if this element is the current target
  const isCurrentTarget = step?.target === `[data-onboard="${targetId}"]`;

  if (!isCurrentTarget || !step) {
    return <>{children}</>;
  }

  return (
    <OnboardingTooltip
      step={step}
      currentIndex={currentIndex}
      totalSteps={totalSteps}
      onNext={onNext}
      onDismiss={onDismiss}
      onDismissAll={onDismissAll}
    >
      {children}
    </OnboardingTooltip>
  );
}
