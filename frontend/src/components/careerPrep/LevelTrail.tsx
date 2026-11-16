import React from 'react';

/**
 * Career Prep v27 (CP5.3): the level trail, "1 Tower · 2 Floor <n> · 3 Career Prep", with the current step marked
 * (kit P1 section 5). The same pill on every tower scene (step 1 outside, in the lobby and in the elevator; step 2
 * on the Career Prep floor) and in the room (step 3), so the student always knows where they are.
 */
export type TrailStep = 1 | 2 | 3;

export function LevelTrail({ step, floorNum, className = 'cp-trail' }: { step: TrailStep; floorNum: string | null; className?: string }): React.ReactElement {
  const items = ['1 Tower', `2 Floor ${floorNum ?? ''}`.trim(), '3 Career Prep'];
  return (
    <ol className={className} aria-label="Where you are" data-testid="cp-trail" data-step={step}>
      {items.map((t, i) => <li key={t} aria-current={i + 1 === step ? 'step' : undefined}>{t}</li>)}
    </ol>
  );
}
