import React, { useState, useCallback } from 'react';
import type { GovProposalDocument, GovReviewApi, GovDocumentVersion, GovGateReview, GovGateName, GovCheckKey } from '../../../../services/govProjectPortalApi';

/**
 * ReviewGates — the cockpit's REVIEW tab (Proposal Studio P3). One card per document shows its color-team gate
 * status (Pink → Red → Gold → White Glove) and, for a reviewer, the latest version's six check scores with
 * run-checks + approve/return controls. Gates are REVIEWER-ONLY: when no `reviewApi` is supplied (an intern), the
 * card is read-only. The maker/approver split and the Gold separation-of-duties are enforced on the server; this is
 * only the surface.
 */
const GATES: GovGateName[] = ['pink', 'red', 'gold', 'white_glove'];
const GATE_LABEL: Record<GovGateName, string> = { pink: 'Pink', red: 'Red', gold: 'Gold', white_glove: 'White Glove' };
const CHECK_LABEL: Record<GovCheckKey, string> = { coverage: 'Coverage', format: 'Format', fact: 'Fact', evaluator: 'Evaluator', proof: 'Proof', clarity: 'Clarity' };
const statusCls = (s: string): string => (s === 'approved' ? 'ok' : s === 'returned' ? 'warn' : '');

function GateChips({ gates }: { gates: GovGateReview[] }): React.ReactElement {
  const byGate = new Map(gates.map((g) => [g.gate, g]));
  return (
    <div className="gck-tags">
      {GATES.map((g) => <span key={g} className={`gck-tag ${statusCls(byGate.get(g)?.status ?? 'pending')}`}>{GATE_LABEL[g]}: {byGate.get(g)?.status ?? 'pending'}</span>)}
    </div>
  );
}

function DocReviewCard({ projectId, doc, reviewApi }: { projectId: string; doc: GovProposalDocument; reviewApi?: GovReviewApi }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ versions: GovDocumentVersion[]; gates: GovGateReview[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!reviewApi) return;
    try { setData(await reviewApi.listReview(projectId, doc.key)); } catch { setMsg('Could not load the review.'); }
  }, [reviewApi, projectId, doc.key]);

  const toggle = () => { const next = !open; setOpen(next); if (next && !data) void load(); };
  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(label); setMsg(null);
    try { await fn(); await load(); } catch (e: any) { setMsg(e?.response?.data?.error ?? 'That action could not complete.'); } finally { setBusy(null); }
  };

  const latest = data?.versions?.[0];
  return (
    <div className="gck-panel" style={{ marginBottom: 10 }}>
      <button type="button" className="gck-reqrow" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={toggle}>
        <span className="gck-reqtext" style={{ fontWeight: 700 }}>{doc.title}</span>
        <span className="gck-tag">{doc.status}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {!reviewApi && <p className="gck-hint">Gate review is handled by a reviewer. You can see the gate status once a reviewer records it.</p>}
          {data && <GateChips gates={data.gates} />}
          {latest && (
            <div className="gck-bp-factors" style={{ marginTop: 8 }}>
              {(Object.keys(CHECK_LABEL) as GovCheckKey[]).map((k) => (
                <div key={k}><span>{CHECK_LABEL[k]}</span><b className="gck-num" style={{ color: (latest.scores[k] ?? 0) < 85 ? 'var(--warn)' : undefined }}>{latest.scores[k] ?? '—'}</b></div>
              ))}
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}><span>Passes</span><b className="gck-num">{latest.passes ? 'yes' : 'no'}</b></div>
            </div>
          )}
          {latest && latest.findings.length > 0 && (
            <ul className="gck-bp-list" style={{ marginTop: 8 }}>
              {latest.findings.slice(0, 8).map((f, i) => <li key={i} className="gck-bp-rule"><span className={`gck-tag ${f.severity === 'fatal' ? 'warn' : ''}`}>{f.check}</span> {f.message}</li>)}
            </ul>
          )}
          {reviewApi && (
            <div className="gck-tags" style={{ marginTop: 10 }}>
              <button type="button" className="gck-btn" disabled={!!busy} onClick={() => run(() => reviewApi.runChecks(projectId, doc.key), 'checks')}>{busy === 'checks' ? 'Running…' : 'Run checks'}</button>
              {GATES.map((g) => (
                <button key={g} type="button" className="gck-btn" disabled={!!busy} onClick={() => run(() => reviewApi.decideGate(projectId, doc.key, g, 'approve'), `ap-${g}`)}>{busy === `ap-${g}` ? '…' : `Approve ${GATE_LABEL[g]}`}</button>
              ))}
            </div>
          )}
          {msg && <p className="gck-hint" style={{ color: 'var(--warn)', marginTop: 8 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

export default function ReviewGates({ projectId, docs, reviewApi }: { projectId: string; docs: GovProposalDocument[]; reviewApi?: GovReviewApi }): React.ReactElement {
  if (!docs.length) return <div className="gck-empty" style={{ padding: 16 }}>No documents to review yet.</div>;
  return (
    <div>
      <p className="gck-hint" style={{ marginBottom: 12 }}>Each document moves through the color-team gates in order: Pink → Red → Gold → White Glove. A gate opens only once the version passes the checks for it; Gold needs a reviewer who did not author the version.</p>
      {docs.map((d) => <DocReviewCard key={d.key} projectId={projectId} doc={d} reviewApi={reviewApi} />)}
    </div>
  );
}
