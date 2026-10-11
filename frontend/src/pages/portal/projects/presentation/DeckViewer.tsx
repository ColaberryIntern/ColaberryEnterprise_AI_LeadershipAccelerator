import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckFrame from './DeckFrame';
import { splitSlides, type Slide } from './deckModel';

/**
 * Presenting the generated deck.
 *
 * TWO MODES, AND THE DIFFERENCE IS NOT COSMETIC.
 *
 *   PRESENTER — what the student looks at: the slide, their own notes, a timer, and
 *   what is coming next.
 *   AUDIENCE — what goes on the shared screen or projector: the slide, and nothing
 *   else.
 *
 * The notes are not hidden in audience mode; they are NOT IN THE MARKUP. `deckModel`
 * strips them before anything renders, so showing them would take more than a stray
 * stylesheet or a browser extension — it would take passing different data. Speaker
 * notes appearing behind a student mid-demo is a failure nobody gets to undo.
 *
 * IT HAS TO WORK WITH NO NETWORK. A student presents from a conference room, a hotel
 * lobby, someone else's laptop. The deck is a self-contained document with inline
 * styles and no external references, rendered from `srcDoc` — once this page is open,
 * nothing it needs is fetched again.
 *
 * KEYBOARD FIRST. Arrows, space, Home/End, and F for fullscreen. A presenter is
 * holding a clicker or standing away from the trackpad; a viewer that needs precise
 * mouse work is a viewer that fails on the day.
 */

export type DeckMode = 'presenter' | 'audience';

export interface DeckViewerProps {
  deckHtml: string;
  title?: string;
  /** Starts in presenter mode; the audience view is a deliberate switch. */
  initialMode?: DeckMode;
  /** Seconds the student is meant to speak for, from the template. */
  targetSeconds?: number | null;
}

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const DeckViewer: React.FC<DeckViewerProps> = ({
  deckHtml, title = 'Your deck', initialMode = 'presenter', targetSeconds = null,
}) => {
  const slides: Slide[] = useMemo(() => splitSlides(deckHtml), [deckHtml]);
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<DeckMode>(initialMode);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const total = slides.length;
  const current = slides[at];

  const go = useCallback((next: number) => {
    setAt((prev) => {
      const target = Math.max(0, Math.min(total - 1, next));
      return Number.isFinite(target) ? target : prev;
    });
  }, [total]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a key from someone typing in the notes box or a form.
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
      else if (e.key.toLowerCase() === 'f') { void toggleFullscreen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, go, total]);

  async function toggleFullscreen() {
    const node = shellRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen?.();
    } catch {
      // Fullscreen is a convenience; a browser that refuses it must not break the deck.
    }
  }

  if (total === 0) {
    return <p className="ps-note ps-note--soft" data-testid="ps-deck-empty">There is no deck to show yet.</p>;
  }

  const overTime = targetSeconds ? elapsed > targetSeconds : false;

  return (
    <div ref={shellRef} data-testid="ps-deck-viewer" data-mode={mode} style={{ background: 'var(--ps-surface, #fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" className="ps-btn" onClick={() => go(at - 1)} disabled={at === 0} data-testid="ps-deck-prev">← Back</button>
        <span className="ps-note ps-note--soft" data-testid="ps-deck-position">Slide {at + 1} of {total}</span>
        <button type="button" className="ps-btn" onClick={() => go(at + 1)} disabled={at === total - 1} data-testid="ps-deck-next">Next →</button>

        <span style={{ flex: 1 }} />

        {/*
          The mode switch is explicit and labelled, because the consequence is who can
          read the student's private notes.
        */}
        <button
          type="button"
          className="ps-btn"
          onClick={() => setMode((m) => (m === 'presenter' ? 'audience' : 'presenter'))}
          aria-pressed={mode === 'audience'}
          data-testid="ps-deck-mode"
        >
          {mode === 'presenter' ? 'Switch to audience view' : 'Back to presenter view'}
        </button>
        <button type="button" className="ps-btn" onClick={() => void toggleFullscreen()} data-testid="ps-deck-fullscreen">Fullscreen</button>
        <button type="button" className="ps-btn" onClick={() => window.print()} data-testid="ps-deck-print">Print</button>
      </div>

      {mode === 'presenter' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }} data-testid="ps-deck-timer">
          <button type="button" className="ps-btn" onClick={() => setRunning((r) => !r)} data-testid="ps-deck-timer-toggle">
            {running ? 'Pause' : 'Start'} timer
          </button>
          <strong style={{ color: overTime ? 'var(--cherry-deep, #C20E1E)' : undefined }}>{mmss(elapsed)}</strong>
          {targetSeconds ? (
            <span className="ps-note ps-note--soft">
              of {mmss(targetSeconds)}{overTime ? ' · over time' : ''}
            </span>
          ) : null}
          <button type="button" className="ps-btn" onClick={() => { setElapsed(0); setRunning(false); }}>Reset</button>
        </div>
      )}

      {/*
        THE SAME COMPONENT IN BOTH MODES, fed DIFFERENT MARKUP. The audience frame is
        handed `audienceHtml`, which does not contain the notes at all.
      */}
      <DeckFrame
        html={current.audienceHtml}
        title={`${title} — slide ${at + 1}`}
        style={{ minHeight: mode === 'audience' ? 480 : 360 }}
      />

      {mode === 'presenter' && (
        <div className="ps-card" style={{ marginTop: 12 }} data-testid="ps-deck-notes">
          <h3>Your notes · slide {at + 1}</h3>
          {current.notes
            ? <p className="ps-note" style={{ whiteSpace: 'pre-wrap' }}>{current.notes}</p>
            : <p className="ps-note ps-note--soft">No notes on this slide.</p>}
          {slides[at + 1] && (
            <p className="ps-note ps-note--soft" data-testid="ps-deck-next-up">
              Next up: {slides[at + 1].title}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DeckViewer;
