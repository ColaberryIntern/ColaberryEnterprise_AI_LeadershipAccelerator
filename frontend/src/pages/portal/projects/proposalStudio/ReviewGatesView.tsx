import React, { useCallback, useState } from 'react';
import type { GovProposalDocument, GovReviewApi, GovDocumentVersion, GovGateReview, GovGateName } from '../../../../services/govProjectPortalApi';
import { CHECKS, Bar, colr, weightedScore, teamTag } from './studioHelpers';
import { goldEligibility } from './buildHelpers';

/** The single PACKAGE Gold Go/No-go — the one human gate (T20). Go only when every document passes; No-go takes a note. */
function GoldDecision({ projectId, docs, reviewApi, onToast }: { projectId: string; docs: GovProposalDocument[]; reviewApi: GovReviewApi; onToast?: (m: string) => void }): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!reviewApi.decideGold) return null;
  const { eligible, blockers } = goldEligibility(docs);
  const decide = async (decision: 'go' | 'nogo') => {
    if (decision === 'nogo' && !note.trim()) { onToast?.('Add a short No-go note first.'); return; }
    setBusy(true);
    try {
      const r = await reviewApi.decideGold!(projectId, decision, note.trim() || undefined);
      onToast?.(decision === 'go' ? `Gold recorded on ${(r.approved ?? []).length} document(s).` : `No-go recorded on ${(r.returned ?? []).length} document(s).`);
    } catch { onToast?.('Could not record the Gold decision.'); } finally { setBusy(false); }
  };
  return (
    <div className="gps-panel"><h3>Gold gate · package Go / No-go</h3>
      <p className="gps-small gps-muted" style={{ marginTop: 0 }}>The one human decision. Go records Gold on every passing document (you cannot approve a version you last authored — separation of duties). No-go sends the package back with a note.</p>
      {!eligible && <p className="gps-small" style={{ color: 'var(--gps-warn)' }}>Not ready: {blockers.length ? `${blockers.join(', ')} ${blockers.length === 1 ? 'is' : 'are'} not passing yet.` : 'no scored documents yet.'}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <button className="gps-btn primary" disabled={busy || !eligible} onClick={() => decide('go')}>Go — approve the package</button>
        <input className="gps-input" style={{ maxWidth: 260 }} placeholder="No-go note (what to fix)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="gps-btn" disabled={busy} onClick={() => decide('nogo')}>No-go</button>
      </div>
    </div>
  );
}

/**
 * ReviewGatesView — the Shipley color-team process with the agent doing the reading. The four team cards describe
 * what each gate checks; the matrix shows every non-pricing document's six check scores and whether it passes
 * (weighted ≥ 95, no check under 85). Clicking a row opens that document in the editor. A reviewer (reviewApi) also
 * gets per-document gate controls — run the checks, approve or return each color team — which interns never see.
 * Ported from the approved design (docs/gov-proposal-studio/designs/proposal-studio.html).
 */
const GATES: GovGateName[] = ['pink', 'red', 'gold', 'white_glove'];
const GATE_LABEL: Record<GovGateName, string> = { pink: 'Pink', red: 'Red', gold: 'Gold', white_glove: 'White glove' };
const statusCls = (s: string): string => (s === 'approved' ? 'ok' : s === 'returned' ? 'warn' : '');

const TEAM_CARDS: Array<{ team: GovGateName; who: string; items: string[] }> = [
  { team: 'pink', who: 'Agent checks · reviewer confirms', items: ['Outline follows the RFP section order', 'Every requirement is mapped and answered', 'Win themes are in place'] },
  { team: 'red', who: '3 independent AI evaluators', items: ['Scoresheet built from Section M weights', 'Disagreement of 2+ levels is flagged for a person', 'Claims have proof', 'No invented facts', 'Clear and customer-focused'] },
  { team: 'gold', who: 'Executive approval (a person)', items: ['Bid strategy and price agree', 'Commitments are ones we can keep', 'Signers are confirmed'] },
  { team: 'white_glove', who: 'Agent checks the package', items: ['Page limits, fonts, file names', 'Signatures and addenda present', 'Price only in its sealed file', 'Redacted copy built'] },
];
const TEAM_VAR: Record<GovGateName, string> = { pink: 'var(--gps-pink)', red: 'var(--gps-red)', gold: 'var(--gps-gold)', white_glove: 'var(--gps-glove)' };

/** Reviewer-only per-document gate controls — the real run-checks / approve-gate actions, styled for the studio. */
function DocGatePanel({ projectId, doc, reviewApi }: { projectId: string; doc: GovProposalDocument; reviewApi: GovReviewApi }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ versions: GovDocumentVersion[]; gates: GovGateReview[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await reviewApi.listReview(projectId, doc.key)); } catch { setMsg('Could not load the review.'); }
  }, [reviewApi, projectId, doc.key]);

  const toggle = () => { const next = !open; setOpen(next); if (next && !data) void load(); };
  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(label); setMsg(null);
    try { await fn(); await load(); } catch (e: unknown) { setMsg((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'That action could not complete.'); } finally { setBusy(null); }
  };
  const byGate = new Map((data?.gates ?? []).map((g) => [g.gate, g]));

  return (
    <div className="gps-panel gps-small" style={{ marginTop: 8 }}>
      <button type="button" aria-expanded={open} onClick={toggle} style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', background: 'none', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}>
        <b style={{ flex: 1 }}>{doc.title}</b>
        <span aria-hidden="true" className="gps-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="gps-tags">{GATES.map((g) => { const st = byGate.get(g)?.status ?? 'pending'; const ai = g !== 'gold'; return <span key={g} className={`gps-tag ${statusCls(st)}`}>{GATE_LABEL[g]}: {st}{ai ? ' · AI' : ''}</span>; })}</div>
          <div className="gps-tags" style={{ marginTop: 10 }}>
            <button type="button" className="gps-btn sm" disabled={!!busy} onClick={() => run(() => reviewApi.runChecks(projectId, doc.key), 'checks')}>{busy === 'checks' ? 'Running…' : 'Re-run checks'}</button>
          </div>
          <p className="gps-small gps-muted" style={{ marginTop: 8 }}>Pink, Red and White glove are recorded automatically by the AI judge when the version passes their checks. Gold is the one human decision — made for the whole package below.</p>
          {msg && <p className="gps-small" style={{ color: 'var(--gps-warn)', marginTop: 8 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

export default function ReviewGatesView(
  { projectId, docs, reviewApi, onOpenDoc, onToast }:
  { projectId: string; docs: GovProposalDocument[]; reviewApi?: GovReviewApi; onOpenDoc: (d: GovProposalDocument) => void; onToast?: (m: string) => void },
): React.ReactElement {
  const scored = docs.filter((d) => d.key !== 'pricing' && !d.superseded);

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Review gates</h2><p>This is the Shipley color-team process with the agent doing the reading. Each gate passes when its checks score 95 or better. A person signs off at Gold before anything is packaged.</p></div></div>
      <div className="gps-teams">
        {TEAM_CARDS.map((t) => (
          <div className="gps-team" style={{ borderTop: `3px solid ${TEAM_VAR[t.team]}` }} key={t.team}>
            <h3>{GATE_LABEL[t.team]} team</h3><span className="gps-who gps-muted">{t.who}</span>
            <ul>{t.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </div>
      {scored.length === 0 ? <div className="gps-panel gps-muted">No documents to review yet.</div> : (
        <div className="gps-tbl-wrap"><table>
          <thead><tr><th>Document</th>{CHECKS.map((c) => <th key={c.k}>{c.n}<div style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{teamTag(c.team)}</div></th>)}<th>Result</th></tr></thead>
          <tbody>
            {scored.map((d) => {
              const sc = weightedScore(d.latest?.scores);
              return (
                <tr className="gps-click" key={d.key} onClick={() => onOpenDoc(d)}>
                  <td><b>{d.title}</b></td>
                  {CHECKS.map((c) => { const v = d.latest?.scores?.[c.k] ?? 0; return (<td key={c.k}><div className="gps-gate-cell"><Bar v={v} /><span className="gps-num gps-small" style={{ color: colr(v), fontWeight: 600 }}>{v}</span></div></td>); })}
                  <td>{d.latest?.passes ? <span className="gps-tag ok">Passed {sc}</span> : <span className="gps-tag warn">{sc}{d.currentGate ? ` · ${GATE_LABEL[d.currentGate]}` : ''}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {reviewApi && scored.length > 0 && <GoldDecision projectId={projectId} docs={docs} reviewApi={reviewApi} onToast={onToast} />}
      {reviewApi && scored.length > 0 && (
        <div className="gps-panel"><h3>Per-document gates</h3><p className="gps-small gps-muted" style={{ marginTop: 0 }}>Pink, Red and White glove are recorded by the AI judge when a version passes their checks. Re-run the checks on a document after an edit; the Gold decision for the whole package is above.</p>
          {scored.map((d) => <DocGatePanel key={d.key} projectId={projectId} doc={d} reviewApi={reviewApi} />)}
        </div>
      )}
      <div className="gps-panel gps-small"><h3>Gates folded for a small bid</h3><p className="gps-muted" style={{ margin: 0 }}>Blue team (the annotated outline) runs inside Pink, before any drafting. Green team (price matches the narrative) runs with Gold, admin only. Red is never merged into another gate.</p></div>
      <div className="gps-panel gps-small"><h3>What &ldquo;95% approval&rdquo; means</h3><p className="gps-muted" style={{ margin: 0 }}>A document passes when its weighted score is 95 or higher and no single check is below 85. That way one strong area can&rsquo;t hide a gap that gets the bid thrown out. Elimination risks such as page limits, missing signatures, or price outside its sealed file fail the document outright, whatever the score. The checks set the bar. A person still approves each gate.</p></div>
    </div>
  );
}
