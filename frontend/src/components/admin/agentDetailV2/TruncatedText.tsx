import React, { useState } from 'react';

// Agent Detail polish round 2 (2026-09-29) — Ali, live: a long
// charter.mission pushed the rest of the Talk tab's "Shared working
// context" sidebar (and Overview's Role charter section) below the fold,
// requiring scrolling to see anything after it. "Only show 2-3 lines and
// then give them the option to show more."
//
// Mirrors AgentDetailLayout.tsx's own already-shipped descExpanded/
// descIsLong/shownDescription pattern (same 140-char threshold, same
// collapse/expand shape) rather than inventing a new one — extracted here
// as a small, reusable component since this round adds a SECOND and THIRD
// real call site for the identical need (Talk tab's Objective row,
// Overview sidebar's Role charter mission). AgentDetailLayout.tsx's own
// implementation is deliberately left untouched — already shipped, already
// tested, zero risk to it from this addition.

interface Props {
  text: string;
  threshold?: number;
  expandLabel?: string;
  collapseLabel?: string;
}

export default function TruncatedText({ text, threshold = 140, expandLabel = 'Show more', collapseLabel = 'Show less' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > threshold;
  const shown = !isLong || expanded ? text : `${text.slice(0, threshold)}…`;

  return (
    <>
      {shown}
      {isLong && (
        <>
          {' '}
          <span
            role="button"
            tabIndex={0}
            className="adv2-truncate-toggle"
            style={{ color: 'var(--adv2-ink-3)', textDecoration: 'underline dotted', cursor: 'pointer' }}
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
          >
            {expanded ? collapseLabel : expandLabel}
          </span>
        </>
      )}
    </>
  );
}
