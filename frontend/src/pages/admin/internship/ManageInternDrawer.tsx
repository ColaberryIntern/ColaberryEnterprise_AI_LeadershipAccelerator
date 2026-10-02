import React, { useState } from 'react';
import {
  InternRow, InternAction, ONE_WAY_ACTIONS, transitionIntern,
} from '../../../services/adminInternConsoleApi';

/**
 * The Manage drawer — the console's only write surface.
 *
 * ── WHY THE THREE TERMINAL ACTIONS LOOK DIFFERENT FROM THE OTHER TWO ────────────────────
 *
 * `pause` and `resume` have edges both ways in the state machine, so a misclick costs one more
 * click. `complete`, `withdraw` and `remove` have **no outbound edges at all**: once taken, that
 * application keeps its decision and its date forever, and the person has to submit a NEW
 * application to come back. A button that cannot be undone must not look like one that can, so
 * those three require the reviewer to type the action's name — the same word the server demands in
 * `confirm`, which this component never fills in on their behalf.
 *
 * Two controls render permanently unavailable rather than being left out:
 *   - **Note** — there is no table for private notes and adding one is a schema change.
 *   - **Nudge** — its endpoint is still to come, so it says so instead of pretending.
 * A missing control reads as a missing feature; a disabled one with a reason reads as a plan.
 */

const ACTION_LABEL: Record<InternAction, string> = {
  pause: 'Pause',
  resume: 'Resume',
  complete: 'Mark complete',
  withdraw: 'Withdraw',
  remove: 'Remove',
};

const ACTION_BLURB: Record<InternAction, string> = {
  pause: 'They keep their place and their work. Resume whenever they are back.',
  resume: 'Puts them back on the active roster.',
  complete: 'They finished the internship. This cannot be undone.',
  withdraw: 'They chose to leave. This cannot be undone.',
  remove: 'You are ending the internship. This cannot be undone.',
};

const isOneWay = (a: InternAction) => ONE_WAY_ACTIONS.includes(a);

export const ManageInternDrawer: React.FC<{
  row: InternRow;
  onClose: () => void;
  /** Fired after a successful transition so the roster can reload. */
  onChanged: () => void;
}> = ({ row, onClose, onChanged }) => {
  const paused = row.application_state === 'paused';
  const [pending, setPending] = useState<InternAction | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the reversible one of the pair is offered: an active intern sees Pause, a paused one sees
  // Resume. Offering both invites a transition the state machine will refuse anyway.
  const actions: InternAction[] = [paused ? 'resume' : 'pause', 'complete', 'withdraw', 'remove'];

  const run = async (action: InternAction) => {
    setBusy(true);
    setError(null);
    try {
      await transitionIntern(row.application_id!, action, {
        reason: reason.trim() || undefined,
        // The word the human typed, NOT one generated from `action`.
        //
        // Under today's code these are provably identical — the confirm button stays disabled until
        // `typed === action` — so a mutation swapping this for `action` survives, and it is an
        // EQUIVALENT MUTANT rather than a hole in the tests. It is written this way anyway as
        // defence in depth: if the disabled guard above is ever removed, this sends whatever is in
        // the box and the server refuses, instead of silently manufacturing a valid confirmation for
        // a misclick. The guard is what no test may lose, and a mutation removing it fails two by
        // name.
        confirm: isOneWay(action) ? typed.trim() : undefined,
      });
      setPending(null);
      setTyped('');
      setReason('');
      onChanged();
    } catch (err: any) {
      // The server's own message is shown rather than a generic failure: "this application is
      // completed and cannot be changed" tells a manager what to do next; "request failed" does not.
      setError(err?.response?.data?.error ?? 'Could not change this status.');
    } finally {
      setBusy(false);
    }
  };

  if (!row.application_id) {
    return (
      <aside className="aint-drawer" aria-label={`Manage ${row.name}`}>
        <header className="aint-drawer-h">
          <h3>Manage {row.name}</h3>
          <button type="button" className="aint-btn" onClick={onClose}>Close</button>
        </header>
        <p className="aint-sub">
          This intern has no application record, so there is no status to change.
        </p>
      </aside>
    );
  }

  return (
    <aside className="aint-drawer" aria-label={`Manage ${row.name}`}>
      <header className="aint-drawer-h">
        <h3>Manage {row.name}</h3>
        <button type="button" className="aint-btn" onClick={onClose}>Close</button>
      </header>

      <p className="aint-sub">
        Currently <strong>{row.application_state ?? 'unknown'}</strong>
        {row.day !== null && <> · day {row.day}</>}
      </p>

      {error && <div className="aint-state error" role="alert">{error}</div>}

      <label className="aint-field">
        <span>Reason <span className="aint-sub">(recorded on the audit trail)</span></span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you making this change?"
        />
      </label>

      <div className="aint-drawer-actions">
        {actions.map((action) => (
          <div className="aint-action" key={action}>
            <button
              type="button"
              className={`aint-btn ${isOneWay(action) ? 'danger' : ''}`}
              disabled={busy}
              onClick={() => (isOneWay(action) ? setPending(action) : run(action))}
            >
              {ACTION_LABEL[action]}
            </button>
            <span className="aint-sub">{ACTION_BLURB[action]}</span>

            {pending === action && (
              <div className="aint-confirm">
                <label className="aint-field">
                  <span>
                    Type <strong>{action}</strong> to confirm. This cannot be undone — coming back
                    means a new application.
                  </span>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    aria-label={`Type ${action} to confirm`}
                  />
                </label>
                <div className="aint-confirm-btns">
                  <button
                    type="button"
                    className="aint-btn danger"
                    // The typed word is the gate on this side too. The server checks it again.
                    disabled={busy || typed.trim() !== action}
                    onClick={() => run(action)}
                  >
                    {busy ? 'Working…' : `Yes, ${ACTION_LABEL[action].toLowerCase()}`}
                  </button>
                  <button
                    type="button"
                    className="aint-btn"
                    disabled={busy}
                    onClick={() => { setPending(null); setTyped(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="aint-action">
          <button type="button" className="aint-btn" disabled title="Nudge is not built yet">Nudge</button>
          <span className="aint-sub">Not built yet.</span>
        </div>
        <div className="aint-action">
          <button type="button" className="aint-btn" disabled title="Private notes need a table that does not exist">Note</button>
          <span className="aint-sub">Needs a table that does not exist — not available.</span>
        </div>
      </div>
    </aside>
  );
};

export default ManageInternDrawer;
