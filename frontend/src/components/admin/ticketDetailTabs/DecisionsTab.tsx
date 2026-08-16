import React, { useState, useEffect, useCallback } from 'react';
import { fmtCentralDateTime } from '../../../utils/centralTime';

// ProofDesk Milestone 2 — Decisions tab (spec §10, §15.3). Lists decision_records for
// this ticket and lets an admin post a new one (approve/reject/override/note) via
// T006's POST /tickets/:id/decisions route (T003's recordDecision, Zod-validated).
//
// Ticket Board Honesty fix (2026-08-16, session CC-20260816-q4mz). The record-a-decision
// form stays visible regardless of `expectation` — a human can always manually record a
// decision on any ticket by design (evidenceExpectationService.ts's own human-override
// rationale: a human filing/reviewing a ticket could reasonably need to record one on
// any type). Only the History section's empty state gets the 3-way split, mirroring
// VisualProofTab.tsx/WorkGraphTab.tsx's identical pattern: real decisions / "not
// applicable for this ticket type" / "no decisions recorded yet" (only when the
// category genuinely expects one).

export type EvidenceExpectation = 'expected' | 'not_applicable';

type DecisionType = 'approve' | 'reject' | 'override' | 'note';

interface DecisionRecord {
  id: string;
  ticket_id: string;
  decision_type: DecisionType;
  actor_type: string;
  actor_id: string;
  rationale: string | null;
  linked_evidence_ids: string[] | null;
  created_at: string;
}

interface Props {
  ticketId: string;
  token: string | null;
}

const DECISION_TYPES: DecisionType[] = ['approve', 'reject', 'override', 'note'];

const DECISION_BADGES: Record<DecisionType, string> = {
  approve: 'success',
  reject: 'danger',
  override: 'warning',
  note: 'secondary',
};

interface HistoryProps {
  decisions: DecisionRecord[];
  expectation: EvidenceExpectation;
}

/** Pure presentational rendering of the History section's 3 possible states — no
 * fetch, no state. Real decisions always win the branch; otherwise "not applicable"
 * (this ticket's category never gets a recorded decision, e.g. a routine bpos_execution
 * build step) is distinguished from "no decisions recorded yet" (this category
 * genuinely expects one, e.g. a strategic initiative awaiting approval, and doesn't
 * have one yet). */
export function DecisionsHistory({ decisions, expectation }: HistoryProps) {
  if (decisions.length > 0) {
    return (
      <div>
        {decisions.map((d) => (
          <div key={d.id} className="d-flex gap-2 mb-2 small">
            <div className="text-muted" style={{ minWidth: 110, fontSize: '0.7rem' }}>{fmtCentralDateTime(d.created_at)}</div>
            <div>
              <span className={`badge bg-${DECISION_BADGES[d.decision_type]} me-1`} style={{ fontSize: '0.6rem' }}>
                {d.decision_type}
              </span>
              <span className="text-muted me-1" style={{ fontSize: '0.7rem' }}>{d.actor_id}</span>
              {d.rationale && <div className="bg-light p-2 rounded mt-1">{d.rationale}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (expectation === 'not_applicable') {
    return <div className="text-muted small py-2">Not applicable for this ticket type.</div>;
  }

  return <div className="text-muted small py-2">No decisions recorded yet.</div>;
}

export default function DecisionsTab({ ticketId, token }: Props) {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [expectation, setExpectation] = useState<EvidenceExpectation>('not_applicable');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [decisionType, setDecisionType] = useState<DecisionType>('note');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/decisions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Decisions request failed: ${res.status}`);
      const data = await res.json();
      setDecisions(data.decisions || []);
      setExpectation(data.expectation === 'expected' ? 'expected' : 'not_applicable');
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision_type: decisionType, rationale: rationale.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to record decision: ${res.status}`);
      }
      setRationale('');
      await fetchDecisions();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to record decision.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-3">
        <h6 className="fw-semibold small mb-2">Record a decision</h6>
        <div className="row g-2 align-items-end mb-2">
          <div className="col-auto">
            <select
              className="form-select form-select-sm"
              value={decisionType}
              onChange={(e) => setDecisionType(e.target.value as DecisionType)}
            >
              {DECISION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Rationale (optional)"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </div>
          <div className="col-auto">
            <button className="btn btn-sm btn-outline-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Recording...' : 'Record'}
            </button>
          </div>
        </div>
        {submitError && <div className="text-danger small">{submitError}</div>}
      </div>

      <h6 className="fw-semibold small mb-2">History</h6>
      {loading && <div className="text-muted small py-2">Loading decisions...</div>}
      {!loading && error && <div className="text-muted small py-2">Decisions unavailable right now — try reopening this ticket.</div>}
      {!loading && !error && <DecisionsHistory decisions={decisions} expectation={expectation} />}
    </div>
  );
}
