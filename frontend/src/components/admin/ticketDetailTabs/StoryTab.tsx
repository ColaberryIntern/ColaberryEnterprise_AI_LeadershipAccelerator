import React, { useState, useEffect } from 'react';

// ProofDesk Milestone 2 — Story tab (spec §10.2/§15.3). Renders the generated
// Outcome/Proof/Human-action summary (backend/src/services/workLedger/
// summaryGeneratorService.ts) plus the ticket's objective/description and any
// declared acceptance criteria. Never invents acceptance criteria that aren't on the
// ticket — an absent value renders as an honest "Not specified.", matching the
// summary generator's own no-fabrication rule.

interface TicketSummary {
  outcome: string;
  proof: string;
  humanAction: string;
  hasEvidence: boolean;
}

interface Props {
  ticketId: string;
  token: string | null;
  description: string;
  metadata: Record<string, any>;
}

export default function StoryTab({ ticketId, token, description, metadata }: Props) {
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/admin/tickets/${ticketId}/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`Summary request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, token]);

  const acceptanceCriteria = Array.isArray(metadata?.acceptance_criteria) ? metadata.acceptance_criteria : null;

  if (loading) {
    return <div className="text-muted small py-4">Loading summary...</div>;
  }

  if (error || !summary) {
    return <div className="text-muted small py-4">Summary unavailable right now — try reopening this ticket.</div>;
  }

  return (
    <div>
      <div className="mb-3">
        <h6 className="fw-semibold small mb-2">Summary</h6>
        <p className="small mb-1">{summary.outcome}</p>
        <p className="small mb-1">{summary.proof}</p>
        <p className="small mb-0">{summary.humanAction}</p>
      </div>

      <div className="mb-3">
        <h6 className="fw-semibold small mb-2">Objective</h6>
        <p className="small text-muted mb-0">{description || 'No description provided.'}</p>
      </div>

      <div>
        <h6 className="fw-semibold small mb-2">Acceptance criteria</h6>
        {acceptanceCriteria && acceptanceCriteria.length > 0 ? (
          <ul className="small mb-0">
            {acceptanceCriteria.map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="small text-muted mb-0">Not specified.</p>
        )}
      </div>
    </div>
  );
}
