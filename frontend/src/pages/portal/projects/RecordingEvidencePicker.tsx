import React, { useCallback, useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';

/**
 * Pick one of your own takes, recorded in this platform, as the evidence for a
 * demo-prep task.
 *
 * THE GAP THIS CLOSES. PREP-2 and PREP-5 accepted a link and nothing else, so a
 * student who had just rehearsed in a Studio practice room had to download the
 * video, upload it to YouTube or Drive, set it to "anyone with the link", and
 * paste that back — producing a public, duplicated copy of a recording we were
 * already holding, purely to satisfy the shape of the form.
 *
 * FOUR STATES, NOT TWO. A failed fetch must never render as "you have no
 * recordings": one tells the student to go and record something, the other tells
 * them to try again, and showing the wrong one sends them to redo work they have
 * already done. `RoomRecordingsPanel` had exactly that bug.
 *
 * NO PLAYBACK HERE. The list carries no URL — the API does not return one. A take
 * is watched in the Studio, which applies its own access checks.
 */

export interface RecordedAttempt {
  attemptId: string;
  attemptNo: number;
  mode: string;
  isFinalTake: boolean;
  startedAt: string | null;
  endedAt: string | null;
  parts: number;
  durationSeconds: number | null;
  /** Null means the provider did not say — which is NOT the same as "no". */
  hasAudio?: boolean | null;
  hasSharedScreen?: boolean | null;
  /** Server-written, student-readable. Empty when there is nothing to warn about. */
  warnings?: string[];
  /** The student pointed us at this file; we never captured or checked it. */
  recoveredFromLink?: boolean;
}

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; attempts: RecordedAttempt[] }
  | { phase: 'error' };

/** "10 min", "1 h 05 min", or null when no part reported a length. */
export function formatLength(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

/** The date a student would recognise, or null rather than a guess. */
export function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** What distinguishes one take from another, with nothing invented. */
export function describeAttempt(a: RecordedAttempt): string {
  const bits = [formatWhen(a.startedAt), formatLength(a.durationSeconds)].filter(Boolean) as string[];
  // Parts are worth saying only when there is more than one: Zoom splits a
  // recording when the host stops and restarts, and a student who sees "2 parts"
  // understands why the playback is in two pieces.
  if (a.parts > 1) bits.push(`${a.parts} parts`);
  return bits.join(' · ');
}

const RecordingEvidencePicker: React.FC<{
  projectId: string;
  storyId: string;
  selected: string;
  onSelect: (attemptId: string) => void;
}> = ({ projectId, storyId, selected, onSelect }) => {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const r = await portalApi.get(
        `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/recording-evidence`,
      );
      const attempts = Array.isArray(r.data?.attempts) ? (r.data.attempts as RecordedAttempt[]) : [];
      setState({ phase: 'ready', attempts });
    } catch {
      // Deliberately NOT an empty list. See the note at the top of this file.
      setState({ phase: 'error' });
    }
  }, [projectId, storyId]);

  useEffect(() => { void load(); }, [load]);

  if (state.phase === 'loading') {
    return <p className="rt-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Looking for your recordings…</p>;
  }

  if (state.phase === 'error') {
    return (
      <div style={{ margin: '4px 0 0' }}>
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--cherry-deep, #C20E1E)' }}>
          We could not load your recordings just now. This does not mean you have none.
        </p>
        <button type="button" className="rt-btn" style={{ marginTop: 8 }} onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  if (state.attempts.length === 0) {
    return (
      <p className="rt-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Nothing recorded for this task yet. Book a practice session in the Studio and record it, or paste a link instead.
        A recording usually takes up to an hour to arrive after the session ends.
      </p>
    );
  }

  return (
    <fieldset style={{ border: 0, padding: 0, margin: '4px 0 0' }}>
      <legend className="rt-muted" style={{ fontSize: 13, padding: 0, marginBottom: 6 }}>Your recordings for this task</legend>
      {state.attempts.map((a) => {
        const id = `rec-${a.attemptId}`;
        return (
          <label
            key={a.attemptId}
            htmlFor={id}
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', cursor: 'pointer' }}
          >
            <input
              id={id}
              type="radio"
              name="recording-evidence"
              value={a.attemptId}
              checked={selected === a.attemptId}
              onChange={() => onSelect(a.attemptId)}
            />
            <span>
              <strong>Take {a.attemptNo}</strong>
              {a.isFinalTake ? <span className="rt-muted"> · marked final</span> : null}
              {describeAttempt(a) ? <span className="rt-muted"> · {describeAttempt(a)}</span> : null}
              {a.recoveredFromLink ? <span className="rt-muted"> · your own link, not captured here</span> : null}
              {/*
                A take with no audio, or no shared screen, is still offered — it is
                the student's recording and hiding it helps nobody. It is offered
                WITH the warning, so handing in a silent video is a choice and not
                something a reviewer discovers later.
              */}
              {(a.warnings ?? []).map((w) => (
                <span key={w} style={{ display: 'block', fontSize: 12, color: 'var(--cherry-deep, #C20E1E)' }}>{w}</span>
              ))}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};

export default RecordingEvidencePicker;
