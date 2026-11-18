import React, { useEffect, useState } from 'react';
import {
  errorMessage,
  fetchCapabilityInstructions,
  type CapabilityInstructions,
} from '../../../services/agentDomainApi';

/**
 * AF11.14's first screen — what you have already told this capability, above the box you add to.
 *
 * ## Why this had to exist before the instruction box was really usable
 *
 * `capability_instructions` is a LOG: an edit appends a row and the newest one is in force. That
 * is the right shape, and it means somebody typing into the instruction box without seeing what is
 * already recorded is appending to rules they cannot read. The record has had an API since AF11.14
 * and nothing has ever displayed it, so in practice the box has been write-only.
 *
 * ## Three states, never two
 *
 * Never set, cleared, and in force. A cleared instruction and an unset one look identical in the
 * text and are different facts about a production agent: one says somebody decided there should be
 * no rules, the other says nobody has thought about it. The API separates them and so does this.
 *
 * ## A failure says so
 *
 * A failed read renders as a failure, never as "no instructions". Showing an unreadable record as
 * an empty one would invite somebody to write a rule that contradicts one already in force.
 */

export default function InstructionsInForce({
  agentId,
  capabilityId,
}: {
  agentId: string | null;
  capabilityId: string | null;
}) {
  const [data, setData] = useState<CapabilityInstructions | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!agentId || !capabilityId) { setData(null); setProblem(''); return undefined; }
    let alive = true;
    setLoading(true);
    setProblem('');
    setData(null);
    (async () => {
      try {
        const d = await fetchCapabilityInstructions(agentId, capabilityId);
        if (alive) setData(d);
      } catch (e) {
        if (alive) setProblem(errorMessage(e, 'Could not read the instructions already in force.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [agentId, capabilityId]);

  // The request names no capability, so there is nothing to look up. Said plainly rather than
  // rendered as "no instructions", which would be a claim about a capability nobody identified.
  if (!agentId || !capabilityId) {
    return (
      <div className="form-text mb-2" data-testid="instructions-no-capability">
        This request does not name an agent and a capability, so there are no standing instructions
        to show. Whatever you write below will be attached when the request does.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-muted small mb-2">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        Reading what is already in force…
      </div>
    );
  }

  if (problem) {
    return (
      <div className="alert alert-danger small" role="alert" data-testid="instructions-problem">
        {problem} Read it before adding a rule, so you do not contradict one that is already in
        force.
      </div>
    );
  }

  if (!data) return null;

  if (data.state === 'never_set') {
    return (
      <div className="alert alert-light border small py-2" data-testid="instructions-never-set">
        <i className="ri-information-line me-1" aria-hidden="true" />
        Nobody has set standing instructions for this capability yet. What you write below becomes
        the first.
      </div>
    );
  }

  if (data.state === 'cleared') {
    return (
      <div className="alert alert-warning small py-2" data-testid="instructions-cleared">
        <i className="ri-eraser-line me-1" aria-hidden="true" />
        <span className="fw-semibold">The instructions on this capability were cleared</span>
        {data.set_by_identity ? ` by ${data.set_by_identity}` : ''}
        {data.set_at ? ` on ${new Date(data.set_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}` : ''}
        {'. That is a decision somebody made, not an absence. '}
        {`${data.history.length} edit${data.history.length === 1 ? '' : 's'} on the record.`}
      </div>
    );
  }

  return (
    <div className="alert alert-info small py-2" data-testid="instructions-in-force">
      <div className="fw-semibold">
        <i className="ri-shield-check-line me-1" aria-hidden="true" />
        Already in force on this capability
      </div>
      <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{data.instructions}</div>
      <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
        {data.set_by_identity ? `Set by ${data.set_by_identity}` : 'Author not recorded'}
        {data.set_at ? ` on ${new Date(data.set_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT` : ''}
        {data.history.length > 1 ? ` · ${data.history.length} edits on the record` : ''}
        {'. Anything you write below is appended as a new version; it does not replace this.'}
      </div>
    </div>
  );
}
