import React, { useCallback, useEffect, useState } from 'react';
import { fetchPresentationTypes, setTakeType, type PresentationTypeOption } from './presentationApi';

/**
 * WHAT KIND OF PRESENTATION THIS TAKE IS.
 *
 * Ali asked for Practice to make the learner classify each video, so demos can be
 * categorised and so the kind travels into the post — a cohort scrolling the feed
 * should be able to tell a 90-second project introduction from a full showcase
 * before pressing play.
 *
 * IT STARTS ON THE TASK'S ANSWER, NOT EMPTY. The Learn stage already asked what
 * kind of presentation this task is, and for most takes that answer is right, so
 * the common case costs nothing. But the page SAYS when the value is inherited
 * rather than chosen, because an inherited default presented as a decision is how
 * a feed fills up with everything labelled "Final showcase".
 *
 * PER TAKE, because a learner records several in one booked room and may
 * deliberately record a short introduction and a full showcase against the same
 * task. One answer for the task cannot describe both videos.
 *
 * THE OPTIONS COME FROM THE SERVER. Hardcoding seven ids here would let the
 * chooser drift from the templates the lesson and the deck prompt are built from,
 * and a student would eventually pick a type that no longer exists.
 */

export interface TakeTypePickerProps {
  projectId: string;
  storyId: string;
  recordingId: string;
  presentationType: string | null;
  presentationTypeLabel: string | null;
  typeSource: 'take' | 'task' | 'unset';
  /** Re-read the session so the label reflects what the server stored. */
  onChanged: () => void;
}

const TakeTypePicker: React.FC<TakeTypePickerProps> = ({
  projectId, storyId, recordingId, presentationType, presentationTypeLabel, typeSource, onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PresentationTypeOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetched only when the chooser is opened: a page of takes should not make the
  // same request once per take to render a label it already has.
  useEffect(() => {
    if (!open || options) return;
    let live = true;
    fetchPresentationTypes()
      .then((t) => { if (live) setOptions(t); })
      .catch(() => { if (live) setError('We could not load the types just now.'); });
    return () => { live = false; };
  }, [open, options]);

  const choose = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await setTakeType(projectId, storyId, recordingId, id);
      setOpen(false);
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'We could not save that just now.');
    } finally {
      setBusy(false);
    }
  }, [projectId, storyId, recordingId, onChanged]);

  const label = presentationTypeLabel
    || (presentationType ? presentationType : 'Not set');

  return (
    <div className="ps-take-type" data-testid={`ps-take-type-${recordingId}`} style={{ marginTop: 8 }}>
      <span className="ps-note ps-note--soft" data-testid="ps-take-type-label">
        <span aria-hidden="true">🏷️ </span>
        {label}
        {/* Said plainly. An inherited value shown as a choice is how everything
            ends up filed as whatever the task happened to be set to. */}
        {typeSource === 'task' && <> · from your task setting</>}
        {typeSource === 'unset' && <> · pick one so people know what this is</>}
      </span>
      <button
        type="button"
        className="ps-btn ps-btn--quiet"
        data-testid="ps-take-type-change"
        style={{ marginLeft: 8 }}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Cancel' : 'Change'}
      </button>

      {error && (
        <p role="alert" className="ps-note" data-testid="ps-take-type-error" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
          {error}
        </p>
      )}

      {open && (
        <div className="ps-card" data-testid="ps-take-type-options" style={{ marginTop: 8 }}>
          {!options && !error && (
            <p role="status" className="ps-note ps-note--soft" style={{ margin: 0 }}>Loading types…</p>
          )}
          {options?.map((o) => (
            <button
              key={o.id}
              type="button"
              className="ps-btn ps-btn--quiet"
              data-testid={`ps-take-type-option-${o.id}`}
              disabled={busy}
              aria-pressed={o.id === presentationType}
              style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                fontWeight: o.id === presentationType ? 700 : 400,
              }}
              onClick={() => void choose(o.id)}
            >
              {o.label}
              {o.defaultSeconds > 0 && (
                <span className="ps-note ps-note--soft"> · {Math.round(o.defaultSeconds / 60)} min</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TakeTypePicker;
