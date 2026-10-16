import React, { useCallback, useEffect, useState } from 'react';
import { fetchPublished, withdrawPublished, type PublishedDemo } from './presentationApi';

/**
 * STEP 5 — what this learner has SHOWN PEOPLE, and who saw it.
 *
 * The Practice stage's mirror image. Same recordings, opposite question: Practice
 * asks "what have I recorded", Present asks "what is public, and can I take it
 * back". The two must never be confused by a learner glancing at the page, so each
 * states its audience ON the video rather than in a notice somewhere else on the
 * screen — Practice says "Private — only you can see this", this one names the
 * audience that can actually watch.
 *
 * TAKING IT DOWN NEEDS NOBODY'S APPROVAL. Publishing required staff sign-off;
 * unpublishing does not. Consent is withdrawable by the person who gave it, and
 * making a student wait for permission to stop showing their own face would be the
 * wrong way round.
 *
 * VIEWS ARE PEOPLE, NOT PLAYS. The server counts distinct viewers and excludes the
 * owner, so a learner who rewatches their own demo six times still sees the number
 * of OTHER people who watched. "No views yet" is the honest answer rather than a
 * hidden zero.
 */

type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; items: PublishedDemo[] }
  | { phase: 'error' };

export interface PublishedPanelProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
}

/** Who can see it, in the learner's words rather than the column's. */
export function audienceLabel(audience: string): string {
  if (audience === 'cohort') return 'Public to your cohort — they can watch this';
  if (audience === 'community') return 'Public to everyone on the platform';
  if (audience === 'public') return 'Public on the open internet';
  return 'Shared';
}

const mmss = (s: number | null): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const PublishedPanel: React.FC<PublishedPanelProps> = ({ projectId, storyId, demo }) => {
  const [state, setState] = useState<Load>({ phase: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ready', items: await fetchPublished(projectId, storyId) });
    } catch {
      // Deliberately not an empty list: "we could not load this" and "you have
      // published nothing" are different facts, and one of them is alarming.
      setState({ phase: 'error' });
    }
  }, [projectId, storyId]);

  useEffect(() => { if (!demo) void load(); }, [load, demo]);

  const withdraw = useCallback(async (showcaseId: string) => {
    setBusy(showcaseId);
    setErr(null);
    try {
      await withdrawPublished(projectId, storyId, showcaseId);
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'We could not take that down just now.');
    } finally {
      setBusy(null);
    }
  }, [projectId, storyId, load]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-published-demo">
        <strong>This is a preview account.</strong> Published demos belong to a real learner.
      </div>
    );
  }

  if (state.phase === 'loading') {
    return (
      <p role="status" className="ps-note ps-note--soft" data-testid="ps-published-loading">
        Checking what you have published…
      </p>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="ps-card" data-testid="ps-published-error">
        <p role="alert" className="ps-note" style={{ margin: 0, color: 'var(--cherry-deep, #C20E1E)' }}>
          We could not load this just now. It does not mean you have published nothing.
        </p>
        <button type="button" className="ps-btn" style={{ marginTop: 8 }} onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <p role="status" className="ps-note ps-note--soft" data-testid="ps-published-none">
        You have not published anything from this task. Nothing here is visible to anyone else.
      </p>
    );
  }

  return (
    <>
      {err && (
        <p role="alert" className="ps-note" data-testid="ps-published-error-msg" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
          {err}
        </p>
      )}
      {state.items.map((item) => (
        <div
          // Keyed on the RECORDING, not the showcase. Zoom splits a long rehearsal
          // into parts, and one showcase then covers several recordings — keying on
          // the showcase would give React duplicate keys and let it reuse the wrong
          // <video> between renders.
          key={item.recordingId}
          className="ps-card"
          data-testid={`ps-published-${item.recordingId}`}
          style={{ marginTop: 12 }}
        >
          {/* The audience, on the video, where someone looking at their own face can
              see who else is looking at it. */}
          <p className="ps-public" data-testid="ps-published-audience" style={{ margin: '0 0 6px', fontWeight: 600 }}>
            <span aria-hidden="true">🌐 </span>{audienceLabel(item.audience)}
          </p>

          <video
            controls
            preload="metadata"
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
            src={item.playbackUrl}
          >
            <a href={item.playbackUrl}>Download this demo</a>
          </video>

          <div className="ps-facts" style={{ marginTop: 8 }}>
            {mmss(item.durationSeconds) && (
              <span className="ps-note ps-note--soft" data-testid="ps-published-duration">
                {mmss(item.durationSeconds)}
              </span>
            )}
            {/* Distinct people, never plays, and never counting the owner. */}
            <span className="ps-note ps-note--soft" data-testid="ps-published-views" style={{ marginLeft: 12 }}>
              {item.viewLabel}
            </span>
          </div>

          <button
            type="button"
            className="ps-btn"
            style={{ marginTop: 10 }}
            data-testid={`ps-published-withdraw-${item.recordingId}`}
            disabled={busy === item.showcaseId}
            onClick={() => void withdraw(item.showcaseId)}
          >
            {busy === item.showcaseId ? 'Taking it down…' : 'Take this down'}
          </button>
          <p className="ps-note ps-note--soft" style={{ margin: '6px 0 0' }}>
            Taking it down removes it from the feed straight away. Your recording is kept.
          </p>
        </div>
      ))}
    </>
  );
};

export default PublishedPanel;
