import React, { useEffect, useState } from 'react';
import { getGovClarificationQuestions, type GovClarificationDraft } from '../../../services/factoryApi';

/**
 * ClarificationDraftPanel — "Ask the buyer". An advisory read that scans the ESTABLISHED requirements for the
 * vague ones (a line like "connect to their system" with no system named) and drafts a sharp clarification
 * question for each, plus a ready-to-send email assembled from those questions. Advisory only: it changes no
 * gate, sends nothing, and every question cites a real requirement id (the server drops any that do not), so
 * it can surface a gap but never invent a requirement to ask about.
 */
export function ClarificationDraftPanel({ canonical, requirements, title, buyer }: {
  canonical: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
}): React.ReactElement {
  const storeKey = `govClarificationDraft:${canonical}`;
  const [draft, setDraft] = useState<GovClarificationDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Keep the previously-generated draft (per-viewer convenience) so a revisit does not force a re-run.
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setDraft(JSON.parse(raw) as GovClarificationDraft); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null); setCopied(false);
    try {
      const d = await getGovClarificationQuestions(canonical, { requirements, title: title ?? null, buyer: buyer ?? null });
      setDraft(d);
      try { localStorage.setItem(storeKey, JSON.stringify(d)); } catch { /* ignore */ }
    } catch { setErr('Could not draft the clarification questions right now.'); }
    finally { setBusy(false); }
  };
  const copyEmail = async (): Promise<void> => {
    if (!draft?.email) return;
    try { await navigator.clipboard.writeText(draft.email); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard may be blocked */ }
  };
  return (
    <div className="mb-2">
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || requirements.length === 0} onClick={() => { void run(); }}>
        <i className="ri-questionnaire-line me-1" aria-hidden="true" />{busy ? 'Drafting…' : draft ? 'Re-draft questions (AI)' : 'Draft clarification questions (AI)'}
      </button>
      {requirements.length === 0 && <div className="small text-secondary mt-1">Establish the cited requirements first — the questions are drawn from them.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {draft && (
        <div className="mt-2">
          {draft.questions.length === 0 ? (
            <div className="small text-secondary"><i className="ri-check-line text-success me-1" aria-hidden="true" />No ambiguous requirements found — nothing needs clarifying from the buyer right now.</div>
          ) : (
            <>
              <ol className="small ps-3 mb-2">
                {draft.questions.map((q) => (
                  <li key={q.requirementId + q.question} className="mb-1">
                    <span className="badge bg-light text-dark border me-1">{q.requirementId}</span>
                    {q.question}
                    {q.ambiguity && <div className="text-secondary" style={{ fontSize: '0.78rem' }}>Why: {q.ambiguity}</div>}
                  </li>
                ))}
              </ol>
              <div className="border rounded p-2 bg-body-secondary">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <span className="small fw-semibold"><i className="ri-mail-send-line me-1" aria-hidden="true" />Ready-to-send email</span>
                  <button type="button" className="btn btn-outline-secondary btn-sm py-0" disabled={busy} onClick={() => { void copyEmail(); }}>{copied ? 'Copied' : 'Copy email'}</button>
                </div>
                <pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{draft.email}</pre>
              </div>
            </>
          )}
          <div className="small text-secondary mt-2"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI draft — advisory, grounded only in the established requirements. Review and edit before you send; this app sends nothing.</div>
        </div>
      )}
    </div>
  );
}
