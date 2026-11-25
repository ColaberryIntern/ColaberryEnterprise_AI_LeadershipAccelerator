/**
 * One row of the merged approval queue: a single line until you open it.
 *
 * Ali, 25 Nov 2026: *"Maybe just give me the basics at 1st where I can click on it and then the
 * bigger picture opens up. This is hard to read."* The page he was looking at printed every
 * request's full prose inline; the admissions one is 1,558 characters, which is a document, not a
 * row. Six of those is a page nobody reads to the bottom of, which is how a eleven-day-old request
 * stayed invisible.
 *
 * So: age, kind, title, who — one line. Everything else is behind a disclosure, and inside it the
 * order is deliberate. What the decision RELEASES comes first, then the ladder, then what a tool
 * would read and produce, and only then the requester's own words. The facts an approver is
 * accountable for outrank the argument they are being given.
 */
import React, { useState } from 'react';
import type { ChangeRequest } from '../../services/agentDomainApi';
import ReleaseLadder from './ReleaseLadder';
import {
  ApprovalVerb, TOOL_CONSOLE_HREF, TOOL_VERB_NAMES, ageBand, ageDays, ageLabel, verbsFor,
} from './approvalQueueModel';

const BAND: Record<ReturnType<typeof ageBand>, string> = {
  overdue: 'bg-danger-subtle text-danger-emphasis',
  ageing: 'bg-warning-subtle text-warning-emphasis',
  fresh: 'bg-secondary-subtle text-secondary-emphasis',
  none: 'bg-light text-muted',
};

const TONE: Record<ApprovalVerb['tone'], string> = {
  go: 'btn-success',
  neutral: 'btn-outline-secondary',
  danger: 'btn-outline-danger',
};

export interface ApprovalRowProps {
  request: ChangeRequest;
  busy: boolean;
  /** Reason is required by the server for some verbs; the row refuses to send without one. */
  onDecide: (id: string, kind: ChangeRequest['kind'], verb: string, reason: string) => void;
  now?: Date;
}

export default function ApprovalRow({
  request, busy, onDecide, now,
}: ApprovalRowProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [reasonFor, setReasonFor] = useState('');
  const [reason, setReason] = useState('');

  const days = ageDays(request.requested_at, now);
  const band = ageBand(days);
  const verbs = verbsFor(request.kind);
  const tool = request.tool_request ?? null;
  const rungs = request.releases?.rungs ?? [];
  const sentence = request.releases?.sentence ?? null;
  const detailId = `approval-detail-${request.id}`;

  function choose(v: ApprovalVerb) {
    if (v.needsReason && reasonFor !== v.key) {
      setReasonFor(v.key);
      setReason('');
      return;
    }
    if (v.needsReason && !reason.trim()) return;
    onDecide(request.id, request.kind, v.key, reason.trim());
    setReasonFor('');
    setReason('');
  }

  return (
    <div className={`card border-0 shadow-sm mb-2 ${open ? 'shadow' : ''}`} data-testid={`approval-row-${request.id}`}>
      <button
        type="button"
        className="btn text-start d-flex align-items-center gap-2 w-100 p-3 border-0"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`badge rounded-pill ${BAND[band]}`} style={{ fontSize: '11.5px' }}>
          {ageLabel(days)}
        </span>
        <span
          className={`badge text-uppercase ${request.kind === 'tool' ? 'bg-primary-subtle text-primary-emphasis' : 'bg-success-subtle text-success-emphasis'}`}
          style={{ fontSize: '10.5px', letterSpacing: '.04em' }}
        >
          {request.kind === 'tool' ? 'Tool grant' : 'Change request'}
        </span>
        <span className="fw-semibold flex-grow-1 text-truncate">{request.title}</span>
        <span className="text-muted small d-none d-md-inline text-nowrap">
          {request.requested_by_identity.split('@')[0]}
          {' · '}
          {request.domain_key}
        </span>
        <i className={open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-3 pb-3 border-top" id={detailId}>
          {sentence && (
            <p className="alert alert-danger py-2 px-3 mt-3 mb-3 small fw-semibold" role="note">
              {sentence}
            </p>
          )}

          {rungs.length > 0 && <div className="mb-3"><ReleaseLadder rungs={rungs} /></div>}

          {tool && (
            <div className="mb-3">
              <div className="text-uppercase text-muted fw-bold small mb-2" style={{ letterSpacing: '.08em', fontSize: '11px' }}>
                What the tool does
              </div>
              <table className="table table-sm mb-0">
                <tbody>
                  <tr><th scope="row" className="text-muted fw-semibold w-auto">Tool</th><td><code>{tool.tool_name}</code></td></tr>
                  <tr><th scope="row" className="text-muted fw-semibold">Reads</th><td>{(tool.reads ?? []).join(', ') || 'not stated'}</td></tr>
                  <tr><th scope="row" className="text-muted fw-semibold">Produces</th><td>{(tool.produces ?? []).join('; ') || 'not stated'}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="text-uppercase text-muted fw-bold small mb-2" style={{ letterSpacing: '.08em', fontSize: '11px' }}>
            In their words
          </div>
          <p
            className="small text-body-secondary mb-1"
            style={fullText ? undefined : {
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {request.description || tool?.purpose || 'No description was filed.'}
          </p>
          <button type="button" className="btn btn-link btn-sm px-0" onClick={() => setFullText((v) => !v)}>
            {fullText ? 'Show less' : 'Show the full request'}
          </button>

          <div className="text-uppercase text-muted fw-bold small mb-2 mt-3" style={{ letterSpacing: '.08em', fontSize: '11px' }}>
            Your decision
          </div>
          {request.kind === 'tool' ? (
            <>
              {/* A tool grant is settled where its evidence is. The row still carries the age, the
                  facts and what it releases, so the triage happens here and only the settling
                  moves. See TOOL_VERB_NAMES for why these are words rather than buttons. */}
              <a className="btn btn-primary btn-sm" href={TOOL_CONSOLE_HREF}>
                Decide this grant
              </a>
              <p className="text-muted mb-0 mt-2" style={{ fontSize: '12.5px' }}>
                A grant is the moment an agent stops observing and starts acting, so it is settled
                with five verbs rather than two:
                {' '}
                {TOOL_VERB_NAMES.map((v, i) => (
                  <React.Fragment key={v.label}>
                    {i > 0 && ', '}
                    <span className="fw-semibold">{v.label}</span>
                    {` (${v.hint})`}
                  </React.Fragment>
                ))}
                . Three of them need a field this row does not carry, which is why they live on
                their own screen rather than being offered here and refused on submit.
              </p>
            </>
          ) : (
            <div className="d-flex gap-2 flex-wrap">
              {verbs.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={`btn btn-sm ${TONE[v.tone]}`}
                  disabled={busy}
                  onClick={() => choose(v)}
                  data-testid={`verb-${v.key}`}
                >
                  <span className="fw-semibold">{v.label}</span>
                  <span className="d-block fw-normal" style={{ fontSize: '11px', opacity: 0.85 }}>{v.hint}</span>
                </button>
              ))}
            </div>
          )}

          {reasonFor && (
            <div className="mt-2">
              <label className="form-label small fw-medium" htmlFor={`reason-${request.id}`}>
                {verbs.find((v) => v.key === reasonFor)?.label}
                {' needs a reason. It is sent to the person who filed this.'}
              </label>
              <textarea
                id={`reason-${request.id}`}
                className="form-control form-control-sm"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-danger mt-2"
                disabled={busy || !reason.trim()}
                onClick={() => choose(verbs.find((v) => v.key === reasonFor) as ApprovalVerb)}
              >
                Send it
              </button>
            </div>
          )}

          <p className="text-muted mb-0 mt-2" style={{ fontSize: '12.5px' }}>
            Filed by {request.requested_by_identity}. Recording a decision starts no work.
          </p>
        </div>
      )}
    </div>
  );
}
