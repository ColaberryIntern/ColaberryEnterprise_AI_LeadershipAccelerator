import React from 'react';
import type { ControlRefusal } from '../../services/growthJourneyControlsApi';
import { safeText } from './journeyText';

/**
 * The server's refusal, rendered as sent (Phase 6, T615).
 *
 * Shared by both control forms because the shape is the server's, not the form's.
 *
 * ── WHY VERBATIM AND NOT PARAPHRASED ────────────────────────────────────────
 *
 * A 400's `details[].message` states the cross-field rules in an operator's own
 * terms - "a limited rollout needs cohort_lead_ids and daily_limit", "a pause must
 * name a brand, a programme, a channel or a subject". Those sentences are better
 * than anything this component could invent, and a screen that restates its API's
 * rules is a screen that will eventually disagree with them.
 *
 * TWO 400 SHAPES arrive here. A schema failure carries the `details` array; a
 * business-rule failure carries its whole message in `error` with no array at all
 * (the all-wildcard pause, a programme outside its brand, a cohort id that does not
 * exist, `sms`). So `error` is always rendered and `details` only when present -
 * the first draft of the client handled only the array form and would have shown an
 * empty box for the more interesting half.
 *
 * A 409 is not a fault. It means a second active control for that scope, which is
 * the database answering correctly, so it renders as a warning carrying
 * `scope_key` - "which scope already has one" being the only thing the operator
 * needs next.
 */
export default function ControlRefusalNotice({ refusal }: { refusal: ControlRefusal }) {
  const conflict = refusal.status === 409;
  return (
    <div className={`alert ${conflict ? 'alert-warning' : 'alert-danger'} mt-2`} role="alert">
      <strong>
        {conflict ? 'That scope already has an active control.' : 'The server refused this.'}
      </strong>{' '}
      {safeText(refusal.error)}
      {refusal.scope_key && (
        <div className="small mt-1">
          Scope: <code>{safeText(refusal.scope_key)}</code>
        </div>
      )}
      {refusal.code && (
        <div className="small mt-1">
          Code: <code>{safeText(refusal.code)}</code>
        </div>
      )}
      {refusal.details.length > 0 && (
        <ul className="mb-0 mt-1 small">
          {refusal.details.map((d) => (
            <li key={`${d.path}:${d.message}`}>
              {d.path && <code className="me-1">{safeText(d.path)}</code>}
              {safeText(d.message)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
