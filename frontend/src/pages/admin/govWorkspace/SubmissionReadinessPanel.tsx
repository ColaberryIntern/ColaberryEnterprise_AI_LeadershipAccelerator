import React from 'react';

/**
 * SubmissionReadinessPanel — an advisory "what exactly we submit" summary for the gov Submit step.
 *
 * It does NOT submit, export, or change any gate — the transactional SubmissionPanel below it owns
 * those controls. This panel only makes the bid legible at a glance, grounded entirely in data the
 * workspace already holds:
 *   - the submission-due established requirements (what the bid must answer),
 *   - each one's response-slot status (answered / approved / outstanding),
 *   - the solicitation deadline, with a ship-by target of the day BEFORE it (it is last-minute, and
 *     a plan that lands on the deadline leaves no margin), and
 *   - the readiness blocking reasons in plain language.
 *
 * It fabricates nothing: the per-RFP submittal sections a solicitation names (cost breakdown,
 * references, etc.) are not modelled yet, so this reads the real requirement set rather than
 * inventing sections. Extracting the RFP's own submittal checklist is a separate backend task.
 */

type SlotStatus = 'unanswered' | 'draft' | 'reviewed' | 'approved' | 'revision_required' | string;

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  approved: { cls: 'bg-success-subtle text-success-emphasis border border-success-subtle', label: 'approved' },
  reviewed: { cls: 'bg-info-subtle text-info-emphasis border border-info-subtle', label: 'reviewed' },
  draft: { cls: 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle', label: 'draft' },
  revision_required: { cls: 'bg-danger-subtle text-danger-emphasis border border-danger-subtle', label: 'needs revision' },
  unanswered: { cls: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle', label: 'not answered' },
};
const statusPill = (s: SlotStatus): { cls: string; label: string } => STATUS_PILL[s] ?? STATUS_PILL.unanswered;

// Blocking-code -> plain language. Mirrors the page's READINESS_REASON so the two never disagree.
const BLOCKING_REASON: Record<string, string> = {
  no_project: 'Approve the pursuit into a delivery project first.',
  no_response_slots: 'No responses yet — establish requirements and author responses.',
  coverage_insufficient: 'The solicitation ZIP evidence coverage is not sufficient yet.',
  requirements_blocking: 'Some requirements still block the bid.',
};
function blockingLabel(code: string): string {
  if (code.startsWith('responses_not_approved')) {
    const ids = code.split(':')[1] || '';
    const n = ids ? ids.split(',').filter(Boolean).length : 0;
    return n ? `${n} response${n === 1 ? '' : 's'} still need approval.` : 'Some responses still need approval.';
  }
  return BLOCKING_REASON[code] ?? code;
}

/** Advisory (non-blocking) pre-flight warnings — surfaced so a fatal-but-not-gated mistake is seen before submit. */
function warningLabel(code: string): string {
  if (code.startsWith('pricing_leak:')) {
    const ids = (code.split(':')[1] || '').split(',').filter(Boolean);
    const where = ids.length ? ` (${ids.join(', ')})` : '';
    return `A dollar amount appears in a non-cost response${where}. In a government bid, price belongs in the separate cost volume; move it there or the bid may be judged non-responsive. Advisory only: it does not block export.`;
  }
  return code;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function dayBefore(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function SubmissionReadinessPanel({ readiness, slots, requirements, deadlineUtc, daysLeft }: {
  readiness?: { ready: boolean; blocking: string[] } | null;
  slots: { requirementId: string; statement: string; status: SlotStatus }[];
  requirements: { id: string; text: string; dueStage?: string }[];
  deadlineUtc?: string | null;
  daysLeft?: number | null;
}): React.ReactElement {
  const allSlots = Array.isArray(slots) ? slots : [];
  const approved = allSlots.filter((s) => s.status === 'approved').length;
  const total = allSlots.length;
  const pct = total ? Math.round((approved / total) * 100) : 0;

  // What the bid must answer at submission time. Fall back to the full set when no requirement
  // carries an explicit submission dueStage, so the panel is never empty when there is real work.
  const dueAtSubmission = (requirements ?? []).filter((r) => r.dueStage === 'submission');
  const checklist = (dueAtSubmission.length ? dueAtSubmission : (requirements ?? [])).map((r) => {
    const slot = allSlots.find((s) => s.requirementId === r.id);
    return { id: r.id, text: r.text, status: (slot?.status ?? 'unanswered') as SlotStatus };
  });

  const ready = !!readiness?.ready;
  const blocking = readiness?.blocking ?? [];
  const warnings = readiness?.warnings ?? [];
  const deadline = fmtDate(deadlineUtc);
  const shipBy = dayBefore(deadlineUtc);

  return (
    <div className="mb-1">
      {/* Readiness banner */}
      {ready ? (
        <div className="alert alert-success py-2 mb-3 small d-flex align-items-start" role="status">
          <i className="ri-checkbox-circle-line me-2 mt-1" aria-hidden="true" />
          <span>Every tracked response is approved and nothing is blocking. Review the package below and release the bid when you are ready — only an admin releases, and nothing here submits to a buyer portal.</span>
        </div>
      ) : (
        <div className="alert alert-warning py-2 mb-3 small" role="status">
          <div className="fw-semibold mb-1"><i className="ri-error-warning-line me-1" aria-hidden="true" />{blocking.length} item{blocking.length === 1 ? '' : 's'} outstanding before this bid is complete</div>
          <ul className="mb-0 ps-3">
            {blocking.map((b, i) => <li key={i}>{blockingLabel(b)}</li>)}
          </ul>
        </div>
      )}

      {/* Advisory pre-flight warnings (never gate the bid; flagged so a fatal-but-not-blocked mistake is seen). */}
      {warnings.length > 0 && (
        <div className="alert alert-danger py-2 mb-3 small" role="status">
          <div className="fw-semibold mb-1"><i className="ri-alarm-warning-line me-1" aria-hidden="true" />Check before you submit ({warnings.length})</div>
          <ul className="mb-0 ps-3">
            {warnings.map((w, i) => <li key={i}>{warningLabel(w)}</li>)}
          </ul>
        </div>
      )}

      <div className="row g-3">
        {/* Clock + coverage */}
        <div className="col-12 col-md-5">
          <div className="border rounded p-3 h-100">
            <div className="fw-semibold small mb-2"><i className="ri-timer-flash-line me-1" aria-hidden="true" />Clock &amp; coverage</div>
            <div className="d-flex justify-content-between small py-1 border-bottom"><span className="text-secondary">Deadline</span><span className="fw-semibold">{deadline ?? 'not detected'}</span></div>
            <div className="d-flex justify-content-between small py-1 border-bottom"><span className="text-secondary">Ship by (day before)</span><span className="fw-semibold">{shipBy ?? '—'}</span></div>
            <div className="d-flex justify-content-between small py-1 border-bottom"><span className="text-secondary">Days left</span><span className="fw-semibold">{typeof daysLeft === 'number' ? `${daysLeft} days` : '—'}</span></div>
            <div className="mt-3">
              <div className="d-flex justify-content-between small"><span className="text-secondary">Responses approved</span><span className="fw-semibold">{approved} of {total}</span></div>
              <div className="progress mt-1" style={{ height: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className={`progress-bar ${ready ? 'bg-success' : 'bg-warning'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            {deadline == null && (
              <div className="small text-secondary mt-2"><i className="ri-information-line me-1" aria-hidden="true" />No machine-read deadline on this record — confirm it from the solicitation.</div>
            )}
          </div>
        </div>

        {/* What the bid must answer */}
        <div className="col-12 col-md-7">
          <div className="border rounded p-3 h-100">
            <div className="fw-semibold small mb-2"><i className="ri-list-check-2 me-1" aria-hidden="true" />What the bid must answer <span className="text-secondary fw-normal">({checklist.length})</span></div>
            {checklist.length === 0 ? (
              <div className="small text-secondary">No established requirements yet — establish them on the Requirements step.</div>
            ) : (
              <ul className="list-unstyled mb-0">
                {checklist.map((c) => {
                  const p = statusPill(c.status);
                  return (
                    <li key={c.id} className="d-flex align-items-start gap-2 py-1 border-bottom">
                      <i className="ri-file-text-line text-secondary mt-1" aria-hidden="true" />
                      <span className="small flex-grow-1">{c.text}</span>
                      <span className={`badge ${p.cls}`} style={{ whiteSpace: 'nowrap' }}>{p.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="small text-secondary mt-2">
        <i className="ri-information-line me-1" aria-hidden="true" />
        Summary only. It reads the established requirements and their response status — it does not export, submit, or change any gate. The release controls are below, and only an admin releases a bid. Each solicitation defines its own submittal format and portal; confirm those from the RFP.
      </div>
    </div>
  );
}
