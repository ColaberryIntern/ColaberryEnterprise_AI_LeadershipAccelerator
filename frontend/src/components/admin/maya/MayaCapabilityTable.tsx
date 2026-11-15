import React, { useState } from 'react';
import { StatusBadge } from '../shell';
import type { MayaCapabilityRow, MayaPromotionState } from '../../../services/mayaConsoleApi';

/**
 * Every capability Maya has, its resolved mode, and the dial that moves it.
 *
 * ## The two columns that are NOT the same thing
 *
 * `mode` is what she will actually do right now. `stored_state` is what somebody set. They
 * disagree whenever something upstream overrides the dial - the kill switch, `ENABLE_CHAT`, an
 * M29 flag - and the reason column says which. A console that showed only one of them would let
 * somebody set a capability to `live`, see `live`, and be wrong.
 *
 * ## A refused capability gets no control, not a disabled one
 *
 * `sendSmsSummary`, `placeVoiceCall` and `enrollInCampaign` are refused BY NAME. That is the
 * absence of a dial, not a dial in the off position, and the row says so in a sentence. Rendering
 * a greyed-out select for them would read as "this could be turned on", which is the one thing
 * they must not read as.
 */

const MODE_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  live: 'success',
  review: 'warning',
  shadow: 'info',
  off: 'neutral',
};

/** The reasons worth translating, because the raw token is the server's vocabulary. */
const REASON_TEXT: Record<string, string> = {
  kill_switch: 'the kill switch is on',
  kill_switch_unreadable: 'the kill switch could not be read, so she fails closed',
  chat_off: 'ENABLE_CHAT is off',
  capability_refused: 'refused by name',
  promotion_unreadable: 'the promotion record could not be read',
  not_promoted: 'nobody has promoted it, so the shipped default applies',
  promoted: 'set by a person',
  default_review: 'shipped held for review',
  default_live: 'shipped live',
};

function reasonText(reason: string): string {
  if (REASON_TEXT[reason]) return REASON_TEXT[reason];
  // `m29:<reason>` passes through: the flag layer's own word is more use than a paraphrase.
  return reason.startsWith('m29:') ? `M29 flag: ${reason.slice(4)}` : reason;
}

interface Props {
  rows: MayaCapabilityRow[];
  busy: boolean;
  onSetState: (capability: string, state: MayaPromotionState, note: string) => void;
}

export default function MayaCapabilityTable({ rows, busy, onSetState }: Props): React.ReactElement {
  const [draft, setDraft] = useState<Record<string, { state: MayaPromotionState; note: string }>>({});

  const update = (cap: string, patch: Partial<{ state: MayaPromotionState; note: string }>, row: MayaCapabilityRow) => {
    const current = draft[cap] ?? {
      state: (row.stored_state ?? row.default_state ?? 'shadow') as MayaPromotionState,
      note: '',
    };
    setDraft({ ...draft, [cap]: { ...current, ...patch } });
  };

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th scope="col">Capability</th>
            <th scope="col">Doing now</th>
            <th scope="col">Why</th>
            <th scope="col">Set</th>
            <th scope="col">Tools</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = draft[row.capability] ?? {
              state: (row.stored_state ?? row.default_state ?? 'shadow') as MayaPromotionState,
              note: '',
            };
            return (
              <tr key={row.capability}>
                <td>
                  <div className="fw-semibold font-monospace small">{row.capability}</div>
                  <div className="small text-muted">
                    {row.stored_state
                      ? `set to ${row.stored_state}`
                      : row.default_state
                        ? `shipped ${row.default_state}, nobody has changed it`
                        : 'no dial'}
                  </div>
                </td>
                <td><StatusBadge label={row.mode} tone={MODE_TONE[row.mode] ?? 'neutral'} /></td>
                <td className="small text-muted">{reasonText(row.reason)}</td>
                <td style={{ minWidth: '18rem' }}>
                  {row.refused ? (
                    // No control at all. See the docblock.
                    <span className="small text-muted">
                      Refused by name. There is no setting that lets this act.
                    </span>
                  ) : (
                    <div className="d-flex gap-2 align-items-start">
                      <select
                        className="form-select form-select-sm"
                        style={{ maxWidth: '7.5rem' }}
                        aria-label={`State for ${row.capability}`}
                        value={d.state}
                        onChange={(e) => update(row.capability, { state: e.target.value as MayaPromotionState }, row)}
                      >
                        <option value="shadow">shadow</option>
                        <option value="review">review</option>
                        <option value="live">live</option>
                      </select>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Why (required)"
                        aria-label={`Review note for ${row.capability}`}
                        maxLength={500}
                        value={d.note}
                        onChange={(e) => update(row.capability, { note: e.target.value }, row)}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        disabled={busy || d.note.trim().length < 3}
                        onClick={() => onSetState(row.capability, d.state, d.note.trim())}
                      >
                        Set
                      </button>
                    </div>
                  )}
                </td>
                <td className="small text-muted font-monospace">{row.tools.join(', ') || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
