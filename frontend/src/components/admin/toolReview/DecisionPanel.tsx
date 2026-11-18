import React, { useState } from 'react';
import type { ToolDuplicateCheck, ToolRequestPackage } from '../../../services/agentDomainApi';
import {
  DECISION_REASON_MAX,
  SEND_BACK_FIELDS,
  type DecisionIssue,
  type ProposedToolRequestDecision,
  type SendBackField,
  STANDING_INSTRUCTIONS_MAX,
  type DecisionAnswer,
  type ToolRequestVerb,
} from '../../../services/toolRequestReviewApi';

/**
 * AF11.3 — the four verbs, and nothing else a decision could be.
 *
 * ## What this panel cannot express
 *
 * There is no autonomy control on it. No `enabled` switch, no risk tier, no autonomy level.
 * AF11.3's sharpest warning is that a console which grants a tool and lifts an autonomy level in
 * one action means nobody separately decided the agent may act more freely. A panel with nowhere
 * to put an autonomy level cannot be used to lift one.
 *
 * AF11.4 changed what `assign_existing_tool` does: the page now records the decision and then
 * asks the server to grant the chosen tool. What it did NOT change is the sentence above — the
 * grant touches the agent's tool list and nothing else, and the server rolls the whole thing
 * back if anything else moved. The per-verb note below says so, because a label reading "assign"
 * invites the assumption that the agent can then act, and usually it still cannot.
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
  /**
   * AF11.8. The options the REQUEST ITSELF carried.
   *
   * When this is non-empty the panel stops offering verbs and offers the answer the ticket
   * names: A, B, C or Nothing. When it is empty the panel is exactly what it was before, which
   * is what a request with no decision package still needs: it can be sent back or refused.
   */
  options?: ToolRequestPackage['options'];
}

const VERB_LABEL: Record<ToolRequestVerb, string> = {
  approve_to_build: 'Approve to build',
  assign_existing_tool: 'Assign an existing tool',
  send_back: 'Send back',
  deny: 'Deny',
  nothing: 'Nothing',
};

/** What each verb actually does, said plainly, because the labels invite wrong assumptions. */
const VERB_NOTE: Record<ToolRequestVerb, string> = {
  approve_to_build: 'The tool does not exist and should. This records that decision and starts '
    + 'nothing — the request stays open until the tool is usable.',
  assign_existing_tool: 'The match was right and a tool for this already exists. This records the '
    + 'decision and then grants that tool to the agent, as two steps — so if the grant is '
    + 'refused, the decision still stands with a reason beside it. It does not change what the '
    + 'agent is allowed to do with the tool.',
  send_back: 'Name the one field that is missing or too vague. The request stays open and the '
    + 'person who filed it is expected to fix that field.',
  deny: 'Refused, with a reason they can read. A denial with no reason teaches nothing and '
    + 'cannot be appealed.',
  nothing: 'The capability comes off the board. This is not a denial: a denial says no to this '
    + 'proposal and invites a better one, where Nothing says the capability itself should not '
    + 'exist. It carries no reason because there is nothing to appeal.',
};

const FIELD_LABEL: Record<string, string> = {
  tool_name: 'Tool name', purpose: 'Purpose', reads: 'Reads', produces: 'Produces',
  capability_id: 'Capability', task_unblocked: 'Task it unblocks', manual_today: 'Done by hand today',
  needed_by: 'Needed by', run_frequency: 'How often it runs', touches: 'Systems it touches',
  inputs: 'Inputs', writes: 'Writes anywhere', side_effects: 'Side effects',
  reversible: 'Reversible', reversibility_note: 'How it is undone',
};

export default function DecisionPanel(props: Props) {
  const {
    check, settled, busy, issues, problem, onDecide,
  } = props;
  const [verb, setVerb] = useState<ToolRequestVerb | ''>('');
  const [reason, setReason] = useState('');
  const [missingField, setMissingField] = useState<SendBackField | ''>('');
  const [tool, setTool] = useState('');
  // AF11.8. The answer, when the request carries options to answer with.
  const [answer, setAnswer] = useState<DecisionAnswer | ''>('');
  const [instructions, setInstructions] = useState('');

  const offered = props.options ?? [];
  const answerDriven = offered.length > 0;
  const chosen = offered.find((o) => o.key === answer);
  /**
   * The verb a chosen answer implies.
   *
   * The whole point of AF11.8: the verb stops being something picked in the console and becomes
   * the CONSEQUENCE of the option that was read. The API refuses a decision whose verb disagrees
   * with the option it names, so deriving it here is not a convenience — it is the only way the
   * two can be guaranteed to agree.
   */
  const impliedVerb: ToolRequestVerb | '' = answer === 'nothing'
    ? 'nothing'
    : (chosen?.verb ?? '');

  if (settled) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        This request has already been decided. A second decision does not replace the first, so
        there is nothing to do here — the history below is the record.
      </div>
    );
  }

  const candidates = check?.candidates ?? [];
  // The verb actually being proposed: derived from the answer when the request carries options,
  // and chosen directly when it does not.
  const effectiveVerb: ToolRequestVerb | '' = answerDriven && answer ? impliedVerb : verb;
  const ready = effectiveVerb === 'approve_to_build'
    || effectiveVerb === 'nothing'
    || (effectiveVerb === 'deny' && reason.trim().length > 0)
    || (effectiveVerb === 'send_back' && missingField !== '')
    // STILL ASKS WHICH TOOL, even when an option was chosen. The option says "grant a tool that
    // already exists"; it does not say which one, and its summary is prose rather than a catalog
    // name. Inferring the name from that prose would send the API something it will refuse, so
    // the picker stays and the decider confirms the tool.
    || (effectiveVerb === 'assign_existing_tool' && tool.trim().length > 0);

  /** Standing instructions only belong on a decision that lets the capability proceed. */
  const letsItProceed = effectiveVerb === 'approve_to_build'
    || effectiveVerb === 'assign_existing_tool';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveVerb || !ready) return;
    onDecide({
      verb: effectiveVerb,
      // Whenever there is one, not only on a denial. The send-back form offers an optional note
      // and the contract accepts a reason on any verb, so keying this off `deny` meant a note the
      // person typed was read, trimmed, and then dropped on the way out.
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(effectiveVerb === 'send_back' ? { missing_field: missingField as SendBackField } : {}),
      // AF11.8. On an answer-driven decision the tool comes from the option the agent offered,
      // not from a second control: the option already said what choosing it would do, and asking
      // again would let the two disagree.
      ...(effectiveVerb === 'assign_existing_tool' ? { assigned_tool_name: tool.trim() } : {}),
      ...(answerDriven && answer ? { chosen_option: answer } : {}),
      ...(letsItProceed && instructions.trim()
        ? { standing_instructions: instructions.trim() }
        : {}),
    });
  }

  return (
    <form onSubmit={submit}>
      {/* AF11.8 — THE ANSWER IS ONE OF THE OPTIONS THE REQUEST CARRIED, or Nothing.
          Rendered only when the request actually offers options. A request with no decision
          package keeps the verb buttons below, because it can still be sent back or refused and
          those are decisions about the request rather than choices among its options. */}
      {answerDriven && (
        <div className="mb-3">
          <div className="d-flex flex-wrap gap-2" role="group" aria-label="Your answer">
            {offered.map((o) => (
              <button
                key={o.key}
                type="button"
                data-testid={`answer-${o.key}`}
                className={`btn btn-sm ${answer === o.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                aria-pressed={answer === o.key}
                onClick={() => { setAnswer(o.key); setVerb(''); }}
              >
                {`${o.key} · ${o.summary}`}
              </button>
            ))}
            {/* ALWAYS PRESENT, never offered by the agent. An option the agent has to remember
                to include is an option it can leave out, and Nothing is the answer that must
                never depend on having been offered. */}
            <button
              type="button"
              data-testid="answer-nothing"
              className={`btn btn-sm ${answer === 'nothing' ? 'btn-warning' : 'btn-outline-warning'}`}
              aria-pressed={answer === 'nothing'}
              onClick={() => { setAnswer('nothing'); setVerb(''); }}
            >
              Nothing
            </button>
          </div>
          {answer && (
            <div className="small text-muted mt-2">
              {answer === 'nothing'
                ? VERB_NOTE.nothing
                : `Choosing ${answer} records "${impliedVerb}". ${VERB_NOTE[impliedVerb as ToolRequestVerb] ?? ''}`}
            </div>
          )}
        </div>
      )}

      {/* The verb row. Primary when there is no package; the secondary way to send a request
          back or refuse it when there is. Nothing is omitted here because it is an ANSWER rather
          than a verb to pick: offering it twice would make the page look like it has two of
          them. */}
      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Decision" data-testid="decision-verbs">
        {(Object.keys(VERB_LABEL) as ToolRequestVerb[])
          .filter((v) => !(answerDriven && (v === 'nothing' || v === 'approve_to_build' || v === 'assign_existing_tool')))
          .map((v) => (
            <button
              key={v}
              type="button"
              className={`btn btn-sm ${verb === v ? 'btn-primary' : 'btn-outline-secondary'}`}
              aria-pressed={verb === v}
              onClick={() => { setVerb(v); setAnswer(''); }}
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

      {effectiveVerb === 'assign_existing_tool' && (
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

      {/* AF11.8 — ALI'S STANDING INSTRUCTIONS.
          Shown only on a decision that lets the capability proceed: attaching behaviour rules to
          a denial or a send-back would leave instructions in force for something nobody
          approved. They are saved in the SAME transaction as the decision, so an approval whose
          conditions failed to save is not recorded as an approval at all. */}
      {letsItProceed && (
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="decision-instructions">
            How this agent should work and respond (optional)
          </label>
          <textarea
            id="decision-instructions"
            data-testid="standing-instructions"
            className="form-control form-control-sm"
            rows={3}
            maxLength={STANDING_INSTRUCTIONS_MAX}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={'Never write a headline longer than eight words. Always show Sohail the '
              + 'preview, not a summary. If the brief is under 100 words, ask for more rather '
              + 'than guessing.'}
          />
          <div className="form-text">
            These ride with the CAPABILITY, not with this ticket, and are in front of the agent
            every time it runs. You can change them later without approving anything again, and
            every edit is recorded against your name.
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
      {/* AF11.4 made one of the four verbs grant something, so this sentence can no longer be
          the same for all four. It used to read "Nothing is granted or built by this" — true
          when it was written and false now for `assign_existing_tool`, which is exactly the kind
          of reassurance that keeps being believed after it stops being true. */}
      <span className="text-muted small ms-2">
        {verb === 'assign_existing_tool'
          ? 'This grants that tool to the agent. It does not raise an autonomy level and does '
            + 'not switch an agent on — both are separate decisions.'
          : 'Nothing is granted or built by this. It records who decided what, and when.'}
      </span>
    </form>
  );
}
