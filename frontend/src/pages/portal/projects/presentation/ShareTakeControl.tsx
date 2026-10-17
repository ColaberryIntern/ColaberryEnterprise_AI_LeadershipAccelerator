import React, { useCallback, useState } from 'react';
import { requestShare, ShareRejectedError } from './presentationApi';

/**
 * THE CONTROL THAT TURNS A PRIVATE REHEARSAL INTO A REQUEST TO BE SEEN.
 *
 * `POST .../showcase` shipped tested and with nothing calling it, so a learner could
 * record a demo and had no way on earth to share it — the publish half of the
 * feature existed only from the database's point of view. This is the button.
 *
 * ASKING IS NOT PUBLISHING, and the copy has to carry that. This records the
 * AUTHOR's approval; a staff member still has to agree before a single other person
 * can watch. A button labelled "Publish" would be a lie at the moment it is pressed,
 * so it says "Ask staff to share this", and the confirmation says what is actually
 * true: waiting for approval.
 *
 * THE SUMMARY IS REQUIRED because a demo in a cohort feed with no words is a
 * thumbnail nobody clicks. The server grounds it against the learner's own project
 * and returns 422 with notices when it claims something the project does not
 * support; those notices are shown verbatim, because "that didn't work" would leave
 * the learner with no idea what to change.
 */

export interface ShareTakeControlProps {
  projectId: string;
  storyId: string;
  attemptId: string;
  /** Called after a successful request so the panel can re-read the share state. */
  onRequested: () => void;
}

const MAX = 400;

const ShareTakeControl: React.FC<ShareTakeControlProps> = ({
  projectId, storyId, attemptId, onRequested,
}) => {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotices([]);
    try {
      await requestShare(projectId, storyId, attemptId, summary.trim());
      setOpen(false);
      setSummary('');
      onRequested();
    } catch (e: any) {
      if (e instanceof ShareRejectedError) {
        setError(e.message);
        setNotices(e.notices);
      } else {
        setError(e?.response?.data?.error || 'We could not send that just now.');
      }
    } finally {
      setBusy(false);
    }
  }, [projectId, storyId, attemptId, summary, onRequested]);

  if (!open) {
    return (
      <button
        type="button"
        className="ps-btn"
        style={{ marginTop: 10 }}
        data-testid="ps-share-open"
        onClick={() => setOpen(true)}
      >
        Ask staff to share this with your cohort
      </button>
    );
  }

  return (
    <div className="ps-card" data-testid="ps-share-form" style={{ marginTop: 10 }}>
      <label htmlFor={`ps-share-summary-${attemptId}`} style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
        What is this demo about?
      </label>
      <p className="ps-note ps-note--soft" style={{ margin: '0 0 6px' }}>
        A couple of sentences your cohort will read before they press play.
      </p>
      <textarea
        id={`ps-share-summary-${attemptId}`}
        data-testid="ps-share-summary"
        value={summary}
        maxLength={MAX}
        rows={3}
        style={{ width: '100%', padding: 8, borderRadius: 6 }}
        onChange={(e) => setSummary(e.target.value)}
      />
      <p className="ps-note ps-note--soft" style={{ margin: '4px 0 0' }}>
        {summary.trim().length}/{MAX}
      </p>

      {error && (
        <p role="alert" className="ps-note" data-testid="ps-share-error" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
          {error}
        </p>
      )}
      {notices.length > 0 && (
        // Shown verbatim: these say which claim the project does not support, which
        // is the only part the learner can act on.
        <ul data-testid="ps-share-notices" className="ps-note" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {notices.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="ps-btn"
          data-testid="ps-share-submit"
          disabled={busy || summary.trim().length === 0}
          onClick={() => void submit()}
        >
          {busy ? 'Sending…' : 'Send for staff approval'}
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--quiet"
          data-testid="ps-share-cancel"
          disabled={busy}
          onClick={() => { setOpen(false); setError(null); setNotices([]); }}
        >
          Cancel
        </button>
      </div>
      <p className="ps-note ps-note--soft" style={{ margin: '8px 0 0' }}>
        Nobody can see this until a staff member approves it. You can take it down
        again at any time.
      </p>
    </div>
  );
};

export default ShareTakeControl;
