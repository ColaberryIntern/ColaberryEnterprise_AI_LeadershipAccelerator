/**
 * "You are looking at a saved copy of this project."
 *
 * ── THE DAY THIS EXISTS FOR ─────────────────────────────────────────────────
 *
 * On 2026-10-21 Mihret opened a story and read "This story is human work ... no
 * prompt on purpose". The row in the database held a correct ~4,100-character
 * prompt. She was told to hard refresh. She did, twice, and still saw it —
 * because the copy she was reading lives in localStorage, which outlives a
 * refresh. She eventually opened an incognito window on her own initiative and
 * got the right prompt, which is to say she diagnosed our bug for us. Quincy
 * hit the same thing on a different story hours later and asked "is that
 * correct?", copying Kes.
 *
 * Every server-side check passed throughout. Nothing was wrong on the server.
 *
 * The workspace pull fails soft by design, and that design is right: a student
 * offline mid-build should lose the refresh, not the workspace. The defect was
 * that the fallback was SILENT. Stale work and current work look identical, so
 * there is no way to tell which one you are reading, and the obvious next move
 * does nothing.
 *
 * So this says so, and offers the recovery in the same breath. It is the only
 * consumer of the `onSyncFailure` plumbing's successor — that channel was built
 * for exactly this banner, with a docblock describing it, and then never wired
 * to anything for months.
 *
 * WHY THERE IS NO DISMISS BUTTON. The drift banner has "Stay here", because
 * drift is a question with two legitimate answers. This is not: a saved copy is
 * a fact, and hiding the fact returns the student to the silent state the
 * incident came from. It disappears on its own the moment a pull succeeds,
 * which is the honest trigger — the warning goes away when the condition does.
 */
import React, { useEffect, useState } from 'react';
import { onCopyState, describeCopyAge, type CopyState } from './projectFreshness';
import { refetchProjectFromServer } from './projectSync';

interface Props {
  /** The project this workspace is showing, so recovery can target one card. */
  projectId: string;
  /** Called after a successful refetch so the page can re-read the store. */
  onRecovered?: () => void;
}

/** What happened, in words that say what the student is looking at. */
function headline(state: CopyState): string {
  return state.reason === 'cache_write_failed'
    ? 'This device could not save the newer version'
    : 'You are looking at a saved copy';
}

function detail(state: CopyState): string {
  const age = describeCopyAge(state.confirmedAt);
  const when = age ? `last updated ${age}` : 'never updated on this device';

  if (state.reason === 'cache_write_failed') {
    return `We fetched the current version, but this browser had no room to store it, `
      + `so the page is still showing the copy it already had (${when}). `
      + `Closing other tabs or clearing site data for this browser frees that space.`;
  }
  return `We could not reach the server to check for changes, so this is the copy saved `
    + `on this device (${when}). It may not match what the platform has now.`;
}

const StaleCopyBanner: React.FC<Props> = ({ projectId, onRecovered }) => {
  const [state, setState] = useState<CopyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedAgain, setFailedAgain] = useState(false);

  // onCopyState fires immediately with the current state, which matters here:
  // the page's pull starts on mount and can resolve before this effect runs, so
  // a listener that only heard future events would miss the very failure it is
  // mounted to report.
  useEffect(() => onCopyState(setState), []);

  if (!state || !state.stale) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        border: '1px solid #F0C36D', background: '#FFF8E7', borderRadius: 10,
        padding: '12px 14px', margin: '0 0 16px 0', fontSize: 14, lineHeight: 1.5,
        color: '#4A3B12',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: 20, height: 20, flex: '0 0 auto', marginTop: 1 }}>
        <path d="M12 8v4l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{headline(state)}</div>
        <div>{detail(state)}</div>
        {failedAgain && (
          <div style={{ marginTop: 6, fontWeight: 600 }}>
            Still could not reach the server. Your work is safe on this device — try again in a moment.
          </div>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="te-btn cherry sm"
            disabled={busy || !projectId}
            onClick={async () => {
              setBusy(true);
              setFailedAgain(false);
              try {
                const ok = await refetchProjectFromServer(projectId);
                if (ok) onRecovered?.();
                else setFailedAgain(true);
              } finally { setBusy(false); }
            }}
          >
            {busy ? 'Getting the current version…' : 'Get the current version'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaleCopyBanner;
