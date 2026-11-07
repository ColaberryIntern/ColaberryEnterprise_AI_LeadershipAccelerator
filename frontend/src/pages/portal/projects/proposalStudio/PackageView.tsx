import React, { useCallback, useEffect, useState } from 'react';
import type { StudentGovProjectView, GovProposalDocument, GovReviewApi, GovSignatureView, GovPackageResult } from '../../../../services/govProjectPortalApi';
import { weightedScore } from './studioHelpers';

/**
 * PackageView — assembled from the approved version of each document, in the order and with the file names the
 * blueprint requires. The response-files tree lists every non-pricing document with its page budget and pass state;
 * the sealed price file sits in its own admin-only envelope (interns never see it). The before-export checklist shows
 * the fatal gates that block export whatever the score. Exporting is not submitting: a reviewer assembles the package
 * (renders PDFs, seals the price file, builds the redacted copy, writes the manifest), then uploads to the agency
 * portal and records the receipt. Ported from the approved design; the export calls the real assemble route.
 */
const BLOCKING_LABEL: Record<string, string> = {
  no_documents: 'No documents to package.',
  redacted_copy_required: 'The solicitation requires a redacted public copy and none is marked.',
};
const blockingText = (b: string): string => BLOCKING_LABEL[b] ?? b.replace(/_/g, ' ').replace(/:/g, ': ');
const fileLabel = (d: GovProposalDocument, i: number): string => d.fileName ?? `${String(i + 1).padStart(2, '0')}_${d.title.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`;
const pageText = (d: GovProposalDocument): string => {
  if (d.docType === 'form') return 'form';
  const n = d.latest?.pageCount;
  if (n == null) return '—';
  return d.pageLimit != null ? `${n} / ${d.pageLimit} p` : `${n} p`;
};

export default function PackageView(
  { view, projectId, docs, reviewApi, onToast }:
  { view: StudentGovProjectView; projectId: string; docs: GovProposalDocument[]; reviewApi?: GovReviewApi; onToast?: (m: string) => void },
): React.ReactElement {
  const [sigs, setSigs] = useState<GovSignatureView[]>([]);
  const [result, setResult] = useState<GovPackageResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSigs = useCallback(async () => {
    if (!reviewApi) return;
    try { setSigs((await reviewApi.listSignatures(projectId)).signatures); } catch { /* best-effort */ }
  }, [reviewApi, projectId]);
  useEffect(() => { void loadSigs(); }, [loadSigs]);

  const response = docs.filter((d) => d.key !== 'pricing' && !d.superseded);
  const pricing = docs.find((d) => d.key === 'pricing') ?? null; // present only in the admin projection
  const readiness = view.proposalReadiness ?? { pct: 0, passing: response.filter((d) => d.latest?.passes).length, total: response.length };
  const allPass = readiness.total > 0 && readiness.passing >= readiness.total;
  const fatalCount = response.reduce((n, d) => n + (d.fatalCount ?? 0), 0);
  const pendingSigs = sigs.filter((s) => s.status !== 'signed').length;
  const assemble = async () => {
    if (!reviewApi) return;
    setBusy(true); setMsg(null);
    try { setResult(await reviewApi.assemblePackage(projectId)); }
    catch (e: unknown) { setMsg((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not assemble the package.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Package &amp; submit <button type="button" data-testid="help" className="gps-help" title="About this view" onClick={() => onToast?.('Package & submit: the approved documents assembled into PDFs with the blueprint file names, the sealed price file, and a manifest. Exporting is not submitting.')}>i</button></h2><p>Assembled from the approved version of each document, in the order and with the file names the blueprint requires. Exporting is not submitting. You upload to the agency&rsquo;s portal and record the receipt here.</p></div>
        <div className="gps-act">{reviewApi
          ? <button className="gps-btn primary" data-testid="pkg-export" disabled={busy || !allPass} onClick={assemble}>{busy ? 'Assembling…' : 'Export package'}</button>
          : <button className="gps-btn" data-testid="pkg-export" disabled onClick={() => onToast?.('A reviewer assembles the package once every document passes.')}>Reviewer assembles</button>}</div>
      </div>
      <div className="gps-grid2">
        <div className="gps-panel"><h3>Response files</h3>
          <div className="gps-tree" data-testid="pkg-files">
            {response.map((d, i) => (
              <div className="gps-f" key={d.key}><span>{fileLabel(d, i)}</span><span className="gps-muted">{pageText(d)}</span>{d.latest?.passes ? <span className="gps-tag ok">ready</span> : <span className="gps-tag warn">{weightedScore(d.latest?.scores)}</span>}</div>
            ))}
            {response.length === 0 && <div className="gps-muted gps-small">No documents yet.</div>}
            {pricing && (
              <div className="gps-env" data-testid="pkg-sealed"><div className="gps-eyebrow" style={{ color: 'var(--gps-gold)' }}>Sealed &middot; separate upload &middot; admin only</div><div className="gps-f"><span>{fileLabel(pricing, response.length)}</span><span className="gps-muted">sealed</span><span className="gps-tag gold">admin</span></div></div>
            )}
            <div className="gps-f" style={{ marginTop: 8 }}><span>Redacted_Public_Copy.pdf</span><span className="gps-muted">auto-built</span><span className="gps-tag">after export</span></div>
          </div>
        </div>
        <div className="gps-panel"><h3>Before export</h3>
          <ul className="gps-bp-list" data-testid="pkg-checklist">
            <li><div className="gps-bp-k">Every document passes its gate <span className={`gps-tag ${allPass ? 'ok' : 'warn'}`}>{readiness.passing} / {readiness.total}</span></div></li>
            <li><div className="gps-bp-k">Nothing open in Needs you <span className={`gps-tag ${(view.needsCount ?? 0) === 0 ? 'ok' : 'warn'}`}>{(view.needsCount ?? 0) === 0 ? 'clear' : `${view.needsCount} open`}</span></div></li>
            <li><div className="gps-bp-k">Gold Go given <span className={`gps-tag ${allPass ? 'warn' : ''}`}>{allPass ? 'waiting' : 'not ready'}</span></div></li>
            <li><div className="gps-bp-k">No fatal findings <span className="gps-tag bad">fatal</span> <span className={`gps-tag ${fatalCount === 0 ? 'ok' : 'bad'}`}>{fatalCount === 0 ? 'none' : `${fatalCount} to resolve`}</span></div></li>
            <li><div className="gps-bp-k">Signatures collected <span className="gps-tag bad">fatal</span> {reviewApi ? <span className={`gps-tag ${pendingSigs === 0 ? 'ok' : 'warn'}`}>{pendingSigs === 0 ? 'all signed' : `${pendingSigs} pending`}</span> : <span className="gps-tag">checked at package</span>}</div></li>
            <li><div className="gps-bp-k">Price appears only in the sealed file <span className="gps-tag bad">fatal</span> <span className="gps-tag ok">scan at export</span></div></li>
            <li><div className="gps-bp-k">Formats: searchable PDF, 11 pt minimum <span className="gps-tag ok">checked</span></div></li>
          </ul>
          <p className="gps-small gps-muted" style={{ margin: '10px 0 0' }}>Fatal items can&rsquo;t be fixed after the deadline, so they block export whatever the score. Export writes a manifest with each file&rsquo;s version number and hash, so you can always tell exactly what was sent.</p>
          {reviewApi && pendingSigs > 0 && (
            <p className="gps-small gps-muted" style={{ marginTop: 10 }}>{pendingSigs} signature{pendingSigs === 1 ? '' : 's'} still needed — upload the signed copies from the matching cards in <b>Needs you</b>.</p>
          )}
          {msg && <p className="gps-small" style={{ color: 'var(--gps-warn)', marginTop: 8 }}>{msg}</p>}
          {result && !result.ok && (
            <div style={{ marginTop: 10 }}><span className="gps-tag warn">Export blocked</span><ul className="gps-bp-list" style={{ marginTop: 6 }}>{result.blocking.map((b, i) => <li key={i} className="gps-bp-k">{blockingText(b)}</li>)}</ul></div>
          )}
          {result && result.ok && result.manifest && (
            <div style={{ marginTop: 10 }}><span className="gps-tag ok">Package ready — {result.manifest.fileCount} file(s), blueprint v{result.manifest.blueprintVersion ?? '—'}</span>
              <div className="gps-tbl-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>File</th><th className="gps-num">Ver</th><th className="gps-num">Pages</th><th>Sealed</th></tr></thead>
                <tbody>{result.manifest.items.map((it) => <tr key={it.docKey}><td className="gps-mono gps-small">{it.fileName}</td><td className="gps-num">v{it.version}</td><td className="gps-num">{it.pageCount ?? '—'}</td><td>{it.sealed ? 'yes' : ''}</td></tr>)}</tbody>
              </table></div>
              <p className="gps-small gps-muted" style={{ marginTop: 8 }}>Hand off to the existing Submit &amp; record flow to log the submission and its receipt.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
