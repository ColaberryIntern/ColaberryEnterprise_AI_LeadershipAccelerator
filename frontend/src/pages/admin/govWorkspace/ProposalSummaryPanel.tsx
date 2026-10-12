import React, { useEffect, useState } from 'react';
import { getGovProposalSummary, type GovProposalSummary } from '../../../services/factoryApi';

/**
 * ProposalSummaryPanel — an AI "what they want / what we'd build" read above the response checklist.
 * Advisory only: it is generated from the ESTABLISHED requirement statements and nothing else, so it
 * never invents scope. It changes no gate and does not author any response.
 */
export function ProposalSummaryPanel({ canonical, requirements, title, buyer }: {
  canonical: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
}): React.ReactElement {
  const storeKey = `govProposalSummary:${canonical}`;
  const [summary, setSummary] = useState<GovProposalSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Keep the previously-generated summary (per-viewer convenience) so a revisit does not force a re-run.
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setSummary(JSON.parse(raw) as GovProposalSummary); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const s = await getGovProposalSummary(canonical, { requirements, title: title ?? null, buyer: buyer ?? null });
      setSummary(s);
      try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch { /* ignore */ }
    } catch { setErr('Could not generate the summary right now.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || requirements.length === 0} onClick={() => { void run(); }}>
        <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{busy ? 'Summarizing…' : summary ? 'Re-run AI summary' : 'Summarize this opportunity (AI)'}
      </button>
      {requirements.length === 0 && <div className="small text-secondary mt-1">Establish the cited requirements first — the summary reads from them.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {summary && (summary.whatTheyWant || summary.whatWedBuild) && (
        <div className="row g-3 mt-1">
          <div className="col-md-6">
            <div className="border rounded p-3 h-100">
              <div className="fw-semibold small mb-1"><i className="ri-government-line me-1" aria-hidden="true" />What they want</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{summary.whatTheyWant}</div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="border rounded p-3 h-100">
              <div className="fw-semibold small mb-1"><i className="ri-tools-line me-1" aria-hidden="true" />What we&apos;d build</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{summary.whatWedBuild}</div>
            </div>
          </div>
          <div className="col-12"><div className="small text-secondary"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI summary — advisory, grounded only in the established requirements. Verify before relying on it.</div></div>
        </div>
      )}
    </div>
  );
}
