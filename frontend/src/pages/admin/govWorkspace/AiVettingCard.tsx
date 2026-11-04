import React from 'react';
import type { GovAiVettingView } from '../../../services/factoryApi';

const VERDICTS: Record<string, { label: string; cls: string }> = {
  pursue: { label: '⭐ AI vetted: recommends pursuing', cls: 'bg-success text-white' },
  pass: { label: 'AI recommends passing', cls: 'bg-danger-subtle text-danger-emphasis' },
  inconclusive: { label: 'AI could not call it: needs your read', cls: 'bg-warning-subtle text-warning-emphasis' },
};

/**
 * The saved result of the automatic AI checks on this pursuit's ZIP, so a second-check visit opens with the answer already
 * there. Advisory only: it approves nothing. Establishing the requirements and approving stay with people. Every string
 * here is rendered as text.
 */
export default function AiVettingCard({ vetting }: { vetting: GovAiVettingView | null | undefined }): React.ReactElement | null {
  if (!vetting) return null;
  const done = vetting.status === 'completed';
  const v = vetting.verdict ? VERDICTS[vetting.verdict] : null;
  return (
    <div className="card shadow-sm mb-3" data-testid="ai-vetting-card">
      <div className="card-body">
        <h2 className="h6 fw-semibold mb-2"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI vetting</h2>
        {!done && vetting.aiEnabled === false && (
          <p className="small text-secondary mb-0">The AI checks are off right now, so this ZIP has not been checked. Please read it yourself.</p>
        )}
        {!done && vetting.aiEnabled !== false && vetting.status === 'queued' && vetting.errorClass && (
          <p className="small text-secondary mb-0">
            The last try did not finish ({vetting.errorClass}). It tries again during the next morning's catch-up, up to 3 tries in all. Read it yourself if you can't wait.
          </p>
        )}
        {!done && vetting.aiEnabled !== false && !(vetting.status === 'queued' && vetting.errorClass) && (
          <p className="small text-secondary mb-0">
            <i className="ri-loader-4-line me-1" aria-hidden="true" />The AI checks are running on this ZIP. Results are saved here on their own, no button needed.
          </p>
        )}
        {done && v && (
          <>
            <span className={`badge ${v.cls} mb-2`}>{v.label}</span>
            {typeof vetting.coveragePct === 'number' && (
              <div className="small mb-2"><span className="fw-semibold">{vetting.coveragePct}%</span> of the capabilities this bid needs match Our Services.</div>
            )}
            {vetting.reason && <p className="small mb-2">{vetting.reason}</p>}
            {vetting.quote && <blockquote className="small text-secondary border-start ps-2 mb-2">{vetting.quote}</blockquote>}
            {vetting.errorClass && <p className="small text-secondary mb-2">The checks did not fully finish ({vetting.errorClass}).</p>}
            <p className="small text-secondary mb-0">Advisory, from the requirements found in the ZIP before anyone confirmed them. Next: read the proposal, confirm the real requirements, then request approval.</p>
          </>
        )}
      </div>
    </div>
  );
}
