import React, { useCallback, useState } from 'react';
import {
  requestShare, withdrawPublished, ShareRejectedError, type TakeShareState,
} from './presentationApi';

/**
 * WHO CAN SEE THIS TAKE — stated, and changed, in one control.
 *
 * Replaces a one-way "Ask staff to share" button plus a separate "Take this down"
 * that lived on another tab. Those were two halves of one decision shown in two
 * places, and the learner had to hold the state in their head to know which they
 * were looking at. A switch IS the state: off means private, on means public, and
 * the thing you flip is the thing it describes.
 *
 * THREE POSITIONS, NOT TWO, because staff approval sits in the middle. A switch
 * that snapped straight to "public" would be lying for however long the review
 * takes. Pending renders as off-and-waiting: still private, visibly in progress,
 * and cancellable.
 *
 * PRIVATE IS THE DEFAULT AND THE FALLBACK. A take with no live showcase is private,
 * and an unrecognised state is treated as private too — on a control about who can
 * see your face, the safe direction to be wrong in is understating reach.
 *
 * THE VIEW COUNT ONLY APPEARS WHEN PUBLIC. "No views yet" under a private video
 * would imply an audience that cannot exist, and invite a learner to read silence
 * as rejection.
 */

export interface VisibilitySwitchProps {
  projectId: string;
  storyId: string;
  attemptId: string;
  recordingId: string;
  showcaseId: string | null;
  shareState: TakeShareState;
  viewLabel: string;
  /** Re-read the session so the switch reflects the server, not an optimistic guess. */
  onChanged: () => void;
}

const MAX = 400;

const VisibilitySwitch: React.FC<VisibilitySwitchProps> = ({
  projectId, storyId, attemptId, recordingId, showcaseId, shareState, viewLabel, onChanged,
}) => {
  const [asking, setAsking] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const isPublic = shareState === 'published';
  const isPending = shareState === 'pending';

  const send = useCallback(async () => {
    setBusy(true); setError(null); setNotices([]);
    try {
      await requestShare(projectId, storyId, attemptId, recordingId, summary.trim());
      setAsking(false);
      setSummary('');
      onChanged();
    } catch (e: any) {
      if (e instanceof ShareRejectedError) { setError(e.message); setNotices(e.notices); }
      else setError(e?.response?.data?.error || 'We could not send that just now.');
    } finally { setBusy(false); }
  }, [projectId, storyId, attemptId, recordingId, summary, onChanged]);

  const turnOff = useCallback(async () => {
    if (!showcaseId) return;
    setBusy(true); setError(null);
    try {
      await withdrawPublished(projectId, storyId, showcaseId);
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'We could not change that just now.');
    } finally { setBusy(false); }
  }, [projectId, storyId, showcaseId, onChanged]);

  // ── the switch itself ─────────────────────────────────────────────────────────
  const track: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'wait' : 'pointer',
    background: 'none', border: 0, padding: 0, font: 'inherit',
  };
  const pill = (on: boolean): React.CSSProperties => ({
    width: 38, height: 22, borderRadius: 11, position: 'relative', flex: '0 0 auto',
    background: on ? 'var(--teal-600, #0F7B6C)' : 'var(--slate-300, #C7CDD4)',
    transition: 'background 120ms ease',
  });
  const knob = (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16,
    borderRadius: '50%', background: '#fff', transition: 'left 120ms ease',
  });

  return (
    <div className="ps-visibility" data-testid={`ps-visibility-${recordingId}`} style={{ marginTop: 10 }}>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Share this take with your cohort"
        data-testid="ps-visibility-switch"
        data-state={shareState}
        disabled={busy || isPending}
        style={track}
        onClick={() => { if (isPublic) void turnOff(); else setAsking((v) => !v); }}
      >
        <span aria-hidden="true" style={pill(isPublic)}><span style={knob(isPublic)} /></span>
        <span style={{ fontWeight: 600 }} data-testid="ps-visibility-label">
          {isPublic && <><span aria-hidden="true">🌐 </span>Public — your cohort can watch this</>}
          {isPending && <><span aria-hidden="true">⏳ </span>Waiting for staff approval — still private</>}
          {!isPublic && !isPending && <><span aria-hidden="true">🔒 </span>Private — only you can see this</>}
        </span>
      </button>

      {/* Only once it is actually public. See the header note.
          ON ITS OWN LINE, not beside the label. Inline, inside a 300px portfolio
          card, the count wrapped into the middle of the sentence and the two read
          as one run-on: "Public — your cohort can watch this 6 people have
          watched it". */}
      {isPublic && (
        <div className="ps-note ps-note--soft" data-testid="ps-visibility-views" style={{ marginTop: 4 }}>
          {viewLabel}
        </div>
      )}

      {isPending && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            className="ps-btn ps-btn--quiet"
            data-testid="ps-visibility-cancel-request"
            disabled={busy}
            onClick={() => void turnOff()}
          >
            {busy ? 'Cancelling…' : 'Cancel this request'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="ps-note" data-testid="ps-visibility-error" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
          {error}
        </p>
      )}
      {notices.length > 0 && (
        <ul data-testid="ps-visibility-notices" className="ps-note" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {notices.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {/* Turning it ON needs words first: a demo in a feed with no summary is a
          thumbnail nobody clicks, and the summary is grounded server-side. */}
      {asking && !isPublic && !isPending && (
        <div className="ps-card" data-testid="ps-visibility-form" style={{ marginTop: 8 }}>
          <label htmlFor={`ps-vis-summary-${recordingId}`} style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
            What is this demo about?
          </label>
          <p className="ps-note ps-note--soft" style={{ margin: '0 0 6px' }}>
            A couple of sentences your cohort will read before they press play.
          </p>
          <textarea
            id={`ps-vis-summary-${recordingId}`}
            data-testid="ps-visibility-summary"
            value={summary}
            maxLength={MAX}
            rows={3}
            style={{ width: '100%', padding: 8, borderRadius: 6 }}
            onChange={(e) => setSummary(e.target.value)}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ps-btn"
              data-testid="ps-visibility-submit"
              disabled={busy || summary.trim().length === 0}
              onClick={() => void send()}
            >
              {busy ? 'Sending…' : 'Send for staff approval'}
            </button>
            <button
              type="button"
              className="ps-btn ps-btn--quiet"
              data-testid="ps-visibility-cancel"
              disabled={busy}
              onClick={() => { setAsking(false); setError(null); setNotices([]); }}
            >
              Cancel
            </button>
          </div>
          <p className="ps-note ps-note--soft" style={{ margin: '8px 0 0' }}>
            Nobody can see this until a staff member approves it. You can switch it
            back to private at any time.
          </p>
        </div>
      )}
    </div>
  );
};

export default VisibilitySwitch;
