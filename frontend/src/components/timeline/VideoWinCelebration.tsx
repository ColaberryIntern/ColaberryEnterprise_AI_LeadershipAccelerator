import React from 'react';

/**
 * C117 (Ali, 2026-11-07): when a lesson video crosses the watch bar and collects its points by itself (C116), celebrate in the
 * drawer without moving the learner. The strip sits in the footer, never over the video, so the video keeps playing; the learner
 * finishes it, then takes the Next button (the next open lesson, in this same drawer) or Close. Nothing here closes or switches
 * the drawer on its own.
 */

export interface NextLesson { title: string; onOpen: () => void }

/** Pure: the strip's copy. `firstWin` is true only when the learner had no first win before this collect. */
export function winCopy(pts: number, firstWin: boolean, hasNext: boolean): { headline: string; sub: string } {
  return {
    headline: firstWin ? `That's your first win! +${pts} pts` : `Nice work! +${pts} pts earned`,
    sub: hasNext ? 'Keep watching to the end. Your next lesson is ready when you are.' : 'Keep watching to the end.',
  };
}

interface Props {
  pts: number;
  firstWin: boolean;
  next?: NextLesson | null;
  onClose?: () => void;
}

const VideoWinCelebration: React.FC<Props> = ({ pts, firstWin, next, onClose }) => {
  const { headline, sub } = winCopy(pts, firstWin, !!next);
  return (
    <>
      <div className="tld-win" role="status">
        <span className="tld-win-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg>
        </span>
        <span className="tld-win-text"><b>{headline}</b><span>{sub}</span></span>
      </div>
      {onClose && <button type="button" className="tl-btn ghost" onClick={onClose}>Close</button>}
      {next && <button type="button" className="tl-btn primary tld-win-next" onClick={next.onOpen} title={next.title}>Next: {next.title} →</button>}
    </>
  );
};

export default VideoWinCelebration;
