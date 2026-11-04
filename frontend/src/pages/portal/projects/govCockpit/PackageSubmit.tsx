import React, { useState, useEffect, useCallback } from 'react';
import type { GovReviewApi, GovSignatureView, GovPackageResult } from '../../../../services/govProjectPortalApi';

/**
 * PackageSubmit — the cockpit's PACKAGE & SUBMIT tab (Proposal Studio P6). A reviewer uploads the signed copies of
 * the required forms, then assembles the package. Assembly is GATED: it refuses while any document fails its checks,
 * a Gold gate is unapproved, a required form is unsigned, a required redacted copy is missing, or anything is fatal —
 * showing exactly what blocks it. When it succeeds it shows the manifest (each file's version, page count, sha256,
 * and the sealed pricing file). Exported is not submitted: the actual submission + receipt stays the existing flow.
 */
const BLOCKING_LABEL: Record<string, string> = {
  no_documents: 'No documents to package.',
  redacted_copy_required: 'The solicitation requires a redacted public copy and none is marked.',
};
const blockingText = (b: string): string => BLOCKING_LABEL[b] ?? b.replace(/_/g, ' ').replace(/:/g, ': ');

export default function PackageSubmit({ projectId, reviewApi }: { projectId: string; reviewApi?: GovReviewApi }): React.ReactElement {
  const [sigs, setSigs] = useState<GovSignatureView[]>([]);
  const [result, setResult] = useState<GovPackageResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSigs = useCallback(async () => {
    if (!reviewApi) return;
    try { setSigs((await reviewApi.listSignatures(projectId)).signatures); } catch { /* best-effort */ }
  }, [reviewApi, projectId]);

  useEffect(() => { void loadSigs(); }, [loadSigs]);

  if (!reviewApi) return <div className="gck-empty" style={{ padding: 16 }}>The package is assembled by a reviewer once the documents pass their gates.</div>;

  const upload = async (formKey: string, file: File | undefined) => {
    if (!file) return;
    setBusy(formKey); setMsg(null);
    try { await reviewApi.uploadSignedForm(projectId, formKey, file); await loadSigs(); }
    catch (e: any) { setMsg(e?.response?.data?.error ?? 'Upload failed.'); }
    finally { setBusy(null); }
  };

  const assemble = async () => {
    setBusy('assemble'); setMsg(null);
    try { setResult(await reviewApi.assemblePackage(projectId)); }
    catch (e: any) { setMsg(e?.response?.data?.error ?? 'Could not assemble the package.'); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="gck-panel" style={{ marginBottom: 12 }}>
        <div className="gck-eyebrow" style={{ marginBottom: 6 }}>Required form signatures</div>
        {sigs.length === 0 ? <p className="gck-hint">No required forms detected yet. Re-analyze the solicitation to populate them.</p> : sigs.map((s) => (
          <div key={`${s.formKey}:${s.signerRole}`} className="gck-reqrow">
            <span className="gck-reqtext">{s.formKey} <span className="gck-hint">({s.signerRole})</span></span>
            <span className={`gck-tag ${s.status === 'signed' ? 'ok' : 'warn'}`}>{s.status}</span>
            {s.status !== 'signed' && <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy === s.formKey} onChange={(e) => upload(s.formKey, e.target.files?.[0])} />}
          </div>
        ))}
      </div>

      <div className="gck-panel">
        <div className="gck-eyebrow" style={{ marginBottom: 6 }}>Assemble the package</div>
        <p className="gck-hint" style={{ marginTop: 0 }}>Assembling renders the approved documents to PDF, keeps the pricing file sealed and separate, produces the redacted copy, and writes a manifest. It refuses unless everything is ready. Exported is not submitted.</p>
        <button type="button" className="gck-btn" disabled={busy === 'assemble'} onClick={assemble}>{busy === 'assemble' ? 'Assembling…' : 'Assemble package'}</button>
        {msg && <p className="gck-hint" style={{ color: 'var(--warn)', marginTop: 8 }}>{msg}</p>}

        {result && !result.ok && (
          <div style={{ marginTop: 10 }}>
            <p className="gck-tag warn">Export blocked</p>
            <ul className="gck-bp-list">{result.blocking.map((b, i) => <li key={i} className="gck-bp-rule">{blockingText(b)}</li>)}</ul>
          </div>
        )}
        {result && result.ok && result.manifest && (
          <div style={{ marginTop: 10 }}>
            <p className="gck-tag ok">Package ready — {result.manifest.fileCount} file(s), blueprint v{result.manifest.blueprintVersion ?? '—'}</p>
            <table><thead><tr><th>File</th><th>Version</th><th>Pages</th><th>Sealed</th></tr></thead>
              <tbody>{result.manifest.items.map((it) => (
                <tr key={it.docKey}><td>{it.fileName}</td><td className="gck-num">v{it.version}</td><td className="gck-num">{it.pageCount ?? '—'}</td><td>{it.sealed ? 'yes' : ''}</td></tr>
              ))}</tbody>
            </table>
            <p className="gck-hint" style={{ marginTop: 8 }}>Hand off to the existing Submit &amp; record flow to log the submission and its receipt.</p>
          </div>
        )}
      </div>
    </div>
  );
}
