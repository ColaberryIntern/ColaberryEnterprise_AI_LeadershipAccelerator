/**
 * The capability ladder behind a request, with the rungs this decision would free marked.
 *
 * ## What it is for
 *
 * A title says what is being asked for. This says what is stuck behind it. On 25 Nov 2026 the
 * platform builder's tool request read as one grant, and granting it frees step 3 AND step 4,
 * because step 4 cannot start until the tool exists. Nothing on the approval screen said so.
 *
 * ## The distinction that earns its space
 *
 * `blocked_elsewhere` is not a softer `waiting_on_you`. On that same capability, step 0.1 is also
 * uncredited, and no decision of the approver's frees it: it waits on a screen that does not exist
 * yet. A ladder that painted both the same colour would invite an approval that changes nothing.
 *
 * Every state carries a WORD as well as a colour, so the meaning survives a colourblind reader, a
 * greyscale print, and a screenshot pasted into a thread.
 */
import React from 'react';
import type { LadderRung } from '../../services/agentDomainApi';

const STATE: Record<LadderRung['state'], { cls: string; text: string; icon: string }> = {
  credited: { cls: 'border-success-subtle bg-success-subtle', text: 'credited', icon: 'ri-check-line' },
  waiting_on_you: { cls: 'border-danger-subtle bg-danger-subtle', text: 'waiting on you', icon: 'ri-time-line' },
  blocked_elsewhere: { cls: 'border-warning-subtle bg-warning-subtle', text: 'blocked elsewhere', icon: 'ri-alert-line' },
  not_started: { cls: 'border bg-light', text: 'not started', icon: 'ri-subtract-line' },
};

export default function ReleaseLadder({ rungs }: { rungs: ReadonlyArray<LadderRung> }): React.ReactElement | null {
  if (!rungs.length) return null;
  return (
    <div>
      <div className="text-uppercase text-muted fw-bold small mb-2" style={{ letterSpacing: '.08em', fontSize: '11px' }}>
        What this releases
      </div>
      <ol className="list-unstyled d-flex flex-wrap gap-2 mb-0">
        {rungs.map((r) => {
          const s = STATE[r.state] ?? STATE.not_started;
          return (
            <li
              key={r.story_id}
              className={`border rounded-3 p-2 flex-fill ${s.cls}`}
              style={{ minWidth: '116px' }}
              data-testid={`rung-${r.step}`}
            >
              <div className="text-muted fw-bold" style={{ fontSize: '10.5px', letterSpacing: '.05em' }}>
                STEP {r.step}
              </div>
              <div className="fw-semibold" style={{ fontSize: '12.5px', lineHeight: 1.3 }}>{r.label}</div>
              <div className="fw-bold mt-1" style={{ fontSize: '11px' }}>
                <i className={`${s.icon} me-1`} aria-hidden="true" />
                {s.text}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
