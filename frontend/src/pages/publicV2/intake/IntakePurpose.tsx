import React, { useState } from 'react';
import { DEFAULT_PEOPLE, MAX_PEOPLE, MIN_PEOPLE, compareTime, minutesLabel } from './intakeModel';

/**
 * IntakePurpose - what the AI interview is FOR, and what it saves (v2, 2026-11-21).
 *
 * Ali: "It's not clear what the interview is for - make it clear. I think showing the savings
 * this AI call does vs the Human call 20-30 minutes of all people involved and this is AI and
 * one person that has the answers." The people count is theirs to change; the figures are plain
 * arithmetic on it, not a claim about our results.
 */
export function IntakePurpose(): React.ReactElement {
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const c = compareTime(people);
  const aiWidth = Math.max(4, Math.round((c.ai / c.humanHigh) * 100));

  return (
    <section className="cbv2-dpi__purpose" aria-labelledby="dpi-purpose-title" data-testid="intake-purpose">
      <h2 id="dpi-purpose-title" className="cbv2-dpi__h">What the 10-minute AI interview is for</h2>
      <p className="cbv2-dpi__lead">
        It is how we learn your process before we meet: what happens today, which systems it touches, where it hurts,
        and what a win looks like. We use your answers to research your company and draft pilot options, so our first
        meeting starts with your options, not our questions.
      </p>

      <div className="cbv2-dpi__compare" role="group" aria-label="Time it takes">
        <div className="cbv2-dpi__side">
          <p className="cbv2-dpi__side-k">A discovery call</p>
          <p className="cbv2-dpi__side-v" data-testid="compare-human">{minutesLabel(c.humanLow, c.humanHigh)}</p>
          <p className="cbv2-dpi__side-s">20 to 30 minutes, with everyone involved in the room</p>
          <div className="cbv2-dpi__bar" aria-hidden="true"><span style={{ width: '100%' }} /></div>
          <div className="cbv2-dpi__people">
            <span id="dpi-people-label">People who would join</span>
            <button type="button" aria-label="One fewer person" onClick={() => setPeople((p) => Math.max(MIN_PEOPLE, p - 1))} disabled={c.people <= MIN_PEOPLE}>
              −
            </button>
            <output aria-labelledby="dpi-people-label" data-testid="compare-people">{c.people}</output>
            <button type="button" aria-label="One more person" onClick={() => setPeople((p) => Math.min(MAX_PEOPLE, p + 1))} disabled={c.people >= MAX_PEOPLE}>
              +
            </button>
          </div>
        </div>
        <div className="cbv2-dpi__side cbv2-dpi__side--ai">
          <p className="cbv2-dpi__side-k">The AI interview</p>
          <p className="cbv2-dpi__side-v" data-testid="compare-ai">{c.ai} minutes</p>
          <p className="cbv2-dpi__side-s">One person, the one who has the answers</p>
          <div className="cbv2-dpi__bar cbv2-dpi__bar--ai" aria-hidden="true"><span style={{ width: `${aiWidth}%` }} /></div>
        </div>
      </div>
      <p className="cbv2-dpi__saving" data-testid="compare-times">
        Up to <b>{c.times} times less</b> of your team&apos;s time, and you can do it whenever suits you.
      </p>
    </section>
  );
}

export default IntakePurpose;
