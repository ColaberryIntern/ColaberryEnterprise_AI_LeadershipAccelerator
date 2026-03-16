import React, { useState, useEffect } from 'react';
import AgentActivityList from './AgentActivityList';

interface CoryLoadingAnimationProps {
  agentNames: string[];
  onComplete: () => void;
}

const STEPS = [
  'Running AI agents...',
  'Analyzing department performance...',
  'Generating strategic insights...',
  'Calculating opportunity impact...',
];

const STEP_DURATION = 400;

export default function CoryLoadingAnimation({
  agentNames,
  onComplete,
}: CoryLoadingAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visibleAgents, setVisibleAgents] = useState(0);

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    // Step progression: 4 steps at 400ms each = 1600ms total
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= STEPS.length - 1) {
          clearInterval(stepTimer);
          return prev;
        }
        return prev + 1;
      });
    }, STEP_DURATION);

    // Agent names stagger at 150ms intervals during step 1
    const agentTimer = setInterval(() => {
      setVisibleAgents((prev) => {
        if (prev >= agentNames.length) {
          clearInterval(agentTimer);
          return prev;
        }
        return prev + 1;
      });
    }, 150);

    // Complete after all steps
    const completeTimer = setTimeout(() => {
      onComplete();
    }, STEP_DURATION * STEPS.length);

    return () => {
      clearInterval(stepTimer);
      clearInterval(agentTimer);
      clearTimeout(completeTimer);
    };
  }, [agentNames.length, onComplete, prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <div className="p-4 text-center" role="status">
      <div className="mb-3">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={`small mb-1 ${i <= currentStep ? 'text-body' : 'text-muted'}`}
            style={{
              opacity: i <= currentStep ? 1 : 0.3,
              transition: 'opacity 0.3s',
            }}
          >
            {i < currentStep ? '\u2713' : i === currentStep ? '\u25CF' : '\u25CB'}{' '}
            {step}
          </div>
        ))}
      </div>

      {currentStep === 0 && visibleAgents > 0 && (
        <div className="text-start mt-3" style={{ maxWidth: 280, margin: '0 auto' }}>
          <AgentActivityList
            agents={agentNames}
            visibleCount={visibleAgents}
            animated
          />
        </div>
      )}

      <span className="visually-hidden">Analyzing department data</span>
    </div>
  );
}
