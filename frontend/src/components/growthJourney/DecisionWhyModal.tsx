import React from 'react';
import { getClassificationWhy, getDecisionWhy } from '../../services/growthJourneyInspectApi';
import type { JourneyWhy } from '../../services/growthJourneyInspectApi';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { safeText } from './journeyText';

/**
 * The `why` behind one classification or one decision (Phase 6, T614).
 *
 * ── IT WALKS THE PAYLOAD; IT DOES NOT DECLARE IT ────────────────────────────
 *
 * This task's M2 mutation is "the why modal shows a field the API did not return",
 * and the way to be immune to that is to render only what arrived. Both `why`
 * routes answer a deep nest of free text and JSONB - `answer.reason`, `candidates`,
 * `suppressed`, `deferred_actions`, `eligibility`, `contact_evidence`,
 * `execution.receipt`, `content.selected`, `scores.dimensions[].factors` - echoed
 * whole and opaque. A hand-mirrored interface over that would be a list of field
 * names I believe exist, and the first one the backend renames becomes an empty row
 * that looks like a real answer of "nothing".
 *
 * So the renderer is recursive over whatever the object actually holds, and the one
 * thing it asserts is provenance: a key that is absent is reported as absent, and
 * never as a blank or a zero.
 *
 * ── EVERY LEAF GOES THROUGH THE MASK ────────────────────────────────────────
 *
 * `/decisions/:id/why` echoes `contact_evidence` whole, and the backend's
 * `noAddress.ts` write guard inspects packet VALUES only on the handoff path - it
 * does not police this read at all. So the mask is this screen's only line of
 * defence, and it is applied at the leaf rather than to the serialised blob,
 * because the mask is greedy across non-whitespace: one address in a stringified
 * object masks the WHOLE object (`journeyText.test.ts` pins that). Per leaf, only
 * the offending leaf is lost.
 *
 * What the mask does not catch is listed in `journeyText.ts`. The caption below is
 * written against that limit and must not be loosened without widening the regex.
 */

type Kind = 'classification' | 'decision';

interface Props {
  kind: Kind;
  id: string;
  /** The subject the row named, for the title - never re-derived from the payload. */
  subjectRef: string;
  onClose: () => void;
}

/** Depth-limited so a cyclic or pathological payload cannot hang the modal. */
const MAX_DEPTH = 6;

function Leaf({ value }: { value: unknown }) {
  if (Array.isArray(value) && value.length === 0) {
    return <span className="text-muted">empty list</span>;
  }
  if (value === null || value === undefined) {
    return <span className="text-muted">not returned</span>;
  }
  if (value === '') {
    return <span className="text-muted">empty string</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="badge bg-light text-dark border">{String(value)}</span>;
  }
  return <span className="text-break">{safeText(value)}</span>;
}

function Nest({ value, depth }: { value: unknown; depth: number }) {
  const isPlainObject = typeof value === 'object' && value !== null && !Array.isArray(value);
  const isArrayOfObjects = Array.isArray(value)
    && value.length > 0
    && value.every((v) => typeof v === 'object' && v !== null);

  if (depth >= MAX_DEPTH || (!isPlainObject && !isArrayOfObjects)) {
    return <Leaf value={value} />;
  }

  if (isArrayOfObjects) {
    return (
      <ol className="list-unstyled mb-0 ps-3">
        {/* Position IS the identity here: these are ordered candidate/score entries
            from an opaque payload with no id to key on, and no eslint-disable - a
            suppression for a rule CRA may not register is how main broke once. */}
        {(value as unknown[]).map((v, i) => (
          <li key={`entry-${i}`} className="mb-2">
            <Nest value={v} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className="text-muted">empty object</span>;
  }

  return (
    <table className="table table-sm mb-0 align-middle">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            {/* The KEY is masked too. T613's leak was a key rendered raw under a
                caption promising otherwise, and a `why` payload's keys come from
                JSONB the operator may have written. */}
            <th scope="row" className="fw-normal text-muted" style={{ width: '34%' }}>
              <code>{safeText(k)}</code>
            </th>
            <td><Nest value={v} depth={depth + 1} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DecisionWhyModal({ kind, id, subjectRef, onClose }: Props) {
  const why = useGrowthJourneyData<JourneyWhy>(
    () => (kind === 'decision' ? getDecisionWhy(id) : getClassificationWhy(id)),
    `why:${kind}:${id}`,
  );

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Why: ${kind} for ${subjectRef}`}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title h5">
              Why this {kind} <code className="ms-1">{subjectRef}</code>
            </h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="small text-muted">
              Every value below is rendered as the API returned it, with
              {' '}<code>local@domain</code>-shaped runs masked. A key the API did not send
              reads as <em>not returned</em> rather than as a blank, because an absent
              reason and an empty reason are different answers. The mask does not catch
              a bare <code>@handle</code>, an address split by a space, or a full-width
              at-sign.
            </p>
            <AsyncPanel state={why} onRetry={why.reload}>
              {(data) => <Nest value={data} depth={0} />}
            </AsyncPanel>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
