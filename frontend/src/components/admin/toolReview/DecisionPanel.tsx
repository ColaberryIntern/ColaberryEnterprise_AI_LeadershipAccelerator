import React, { useState } from 'react';
import type { ToolDuplicateCheck } from '../../../services/agentDomainApi';
import {
  DECISION_REASON_MAX,
  SEND_BACK_FIELDS,
  type DecisionIssue,
  type ProposedToolRequestDecision,
  type SendBackField,
  type ToolRequestVerb,
} from '../../../services/toolRequestReviewApi';

/**
 * AF11.3 — the four verbs, and nothing else a decision could be.
 *
 * ## What this panel cannot express
 *
 * There is no autonomy control on it. No tool-grant toggle, no `enabled` switch, no risk tier.
 * AF11.3's sharpest warning is that a console which grants a tool and lifts an autonomy level in
 * one action means nobody separately decided the agent may act more freely — so `assign_existing
 * tool` raises an INTENT and AF11.4 performs the grant. A panel with nowhere to put an autonomy
 * level cannot be used to lift one.
 *
 * ## Every refusal is shown, not just the first
 *
 * The server answers 409 with a list, and all of it renders. "You filed this request" and "you
 * are not a configured approver" are different problems with different fixes, and a console that
 * reveals one per click teaches the reader to click instead of to read.
 */

interface Props {
  /** Candidates, so "assign existing tool" offers the ones the matcher actually found. */
  check: ToolDuplicateCheck | null;
  /** True once the request is no longer `submitted` — then only the history is readable. */
  settled: boolean;
  busy: boolean;
  issues: DecisionIssue[];
  problem: string;
  onDecide: (proposed: ProposedToolRequestDecision) => void;
}

const VERB_LABEL: Record<ToolRequestVerb, string> = {
  approve_to_build: 'Approve to build',
  assign_existing_tool: 'Assign an existing tool',
  send_back: 'Send back',
  deny: 'Deny',
};

/** What each verb actually does, said plainly, because the labels invite wrong assumptions. */
const VERB_NOTE: Record<ToolRequestVerb, string> = {
  approve_to_build: 'The tool does not exist and should. This records that decision and starts '
    + 'nothing — the request stays open until the tool is usable.',
  assign_existing_tool: 'The match was right and a tool for this already exists. This records the '
    + 'intent; the grant itself is a separate decision.',
  send_back: 'Name the one field that is missing or too vague. The request stays open and the '
    + 'person who filed it is expected to fix that field.',
  deny: 'Refused, with a reason they can read. A denial with no reason teaches nothing and '
    + 'cannot be appealed.',
};

const FIELD_LABEL: Record<string, string> = {
  tool_name: 'Tool name', purpose: 'Purpose', reads: 'Reads', produces: 'Produces',
  capability_id: 'Capability', task_unblocked: 'Task it unblocks', manual_today: 'Done by hand today',
  needed_by: 'Needed by', run_frequency: 'How often it runs', touches: 'Systems it touches',
  inputs: 'Inputs', writes: 'Writes anywhere', side_effects: 'Side effects',
  reversible: 'Reversible', reversibility_note: 'How it is undone',
};

export default function DecisionPanel({
  check, settled, busy, issues, problem, onDecide,
}: Props) {
  const [verb, setVerb] = useState<ToolRequestVerb | ''>('');
  const [reason, setReason] = useState('');
  const [missingField, setMissingField] = useState<SendBackField | ''>('');
  const [tool, setTool] = useState('');

  if (settled) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        This request has already been decided. A second decision does not replace the first, so
        there is nothing to do here — the history below is the record.
      </div>
    );
  }

  const candidates = check?.candidates ?? [];
  const ready = verb === 'approve_to_build'
    || (verb === 'deny' && reason.trim().length > 0)
    || (verb === 'send_back' && missingField !== '')
    || (verb === 'assign_existing_tool' && tool.trim().length > 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!verb || !ready) return;
    onDecide({
      verb,
      // Whenever there is one, not only on a denial. The send-back form offers an optional note
      // and the contract accepts a reason on any verb, so keying this off `deny` meant a note the
      // person typed was read, trimmed, and then dropped on the way out.
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(verb === 'send_back' ? { missing_field: missingField as SendBackField } : {}),
      ...(verb === 'assign_existing_tool' ? { assigned_tool_name: tool.trim() } : {}),
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Decision">
        {(Object.keys(VERB_LABEL) as ToolRequestVerb[]).map((v) => (
          <button
            key={v}
            type="button"
            className={`btn btn-sm ${verb === v ? 'btn-primary' : 'btn-outline-secondary'}`}
            aria-pressed={verb === v}
            onClick={() => setVerb(v)}
          >
            {VERB_LABEL[v]}
          </button>
        ))}
      </div>

      {verb && <div className="small text-muted mb-3">{VERB_NOTE[verb]}</div>}

      {verb === 'deny' && (
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="decision-reason">
            Why it is refused
          </label>
          <textarea
            id="decision-reason"
            className="form-control form-control-sm"
            rows={3}
            maxLength={DECISION_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="form-text">
            The person who filed this will read this sentence. It is the only thing telling them
            what to do differently.
          </div>
        </div>
      )}

      {verb === 'send_back' && (
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="decision-missing-field">
            Which field is missing or too vague
          </label>
          <select
            id="decision-missing-field"
            className="form-select form-select-sm"
            style={{ maxWidth: 320 }}
            value={missingField}
            onChange={(e) => setMissingField(e.target.value as SendBackField)}
          >
            <option value="">Choose a field…</option>
            {SEND_BACK_FIELDS.map((f) => (
              <option key={f} value={f}>{FIELD_LABEL[f] ?? f}</option>
            ))}
          </select>
          <div className="form-text">
            A field, not a sentence — "needs more detail" gives them nowhere to start.
          </div>
          <label className="form-label small fw-medium mt-2" htmlFor="decision-sendback-note">
            Anything to add (optional)
          </label>
          <textarea
            id="decision-sendback-note"
            className="form-control form-control-sm"
            rows={2}
            maxLength={DECISION_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      {verb === 'assign_existing_tool' && (
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="decision-tool">
            Which tool already does this
          </label>
          {candidates.length > 0 ? (
            <select
              id="decision-tool"
              className="form-select form-select-sm"
              style={{ maxWidth: 420 }}
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            >
              <option value="">Choose a tool…</option>
              {candidates.map((c) => (
                <option key={c.tool_name} value={c.tool_name}>
                  {`${c.tool_name} — scored ${c.score.toFixed(2)}`}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="decision-tool"
              className="form-control form-control-sm"
              style={{ maxWidth: 420 }}
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            />
          )}
          <div className="form-text">
            {candidates.length > 0
              ? 'The matcher found these. A tool that is not in the catalog cannot be assigned.'
              : 'The matcher found nothing, so type the name. It still has to be a registered '
                + 'tool — a tool cannot be created from this screen.'}
          </div>
        </div>
      )}

      {/* Every reason, not the first. */}
      {issues.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <div className="fw-semibold mb-1">That decision cannot stand:</div>
          <ul className="mb-0 small">
            {issues.map((i) => <li key={i.rule || i.detail}>{i.detail}</li>)}
          </ul>
        </div>
      )}
      {issues.length === 0 && problem && (
        <div className="alert alert-danger small" role="alert">{problem}</div>
      )}

      <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || busy}>
        {busy ? 'Recording…' : 'Record this decision'}
      </button>
      <span className="text-muted small ms-2">
        Nothing is granted or built by this. It records who decided what, and when.
      </span>
    </form>
  );
}
