import React, { useState } from 'react';
import {
  draftGovProposalDocument, acceptGovProposalDocument, requestChangesGovProposalDocument, commentGovProposalDocument,
  type GovProposalDocument,
} from '../../../../services/govProjectPortalApi';

/**
 * ProposalDocumentDrawer — work one named proposal document. The AI drafts it (or you edit the draft); you preview
 * it at full fidelity, download it as a PDF via the browser's print, comment, and — as a reviewer — accept it or
 * send it back. Acceptance is the ONLY path to `accepted` (server-enforced); a re-draft reopens an accepted doc.
 * The preview renders server-sanitized HTML (allowlisted tags, no attributes), so dangerouslySetInnerHTML is safe
 * here — the XSS rail is the backend sanitizer, not this component.
 */
const STATUS: Record<string, { cls: string; label: string }> = {
  not_started: { cls: '', label: 'Not started' },
  drafting: { cls: 'ai', label: 'Drafting…' },
  drafted: { cls: 'warn', label: 'Drafted — needs review' },
  changes_requested: { cls: 'warn', label: 'Changes requested' },
  accepted: { cls: 'ok', label: 'Accepted' },
};

/** Open the document in a print window the browser saves as PDF (the chosen "produce PDF" path — no server render). */
function printDocument(title: string, html: string): void {
  const w = window.open('', '_blank', 'noopener,width=900,height=1000');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf8"><title>${title.replace(/[<>&]/g, '')}</title>` +
    `<style>@page{margin:1in}body{font:12pt Georgia,serif;color:#111;line-height:1.5;max-width:7in;margin:0 auto}` +
    `h1{font-size:18pt}h2{font-size:15pt;margin-top:1.2em}h3{font-size:13pt}table{border-collapse:collapse;width:100%}` +
    `th,td{border:1px solid #999;padding:4px 8px;text-align:left}</style></head><body>` +
    `<h1>${title.replace(/[<>&]/g, '')}</h1>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 300);
}

export default function ProposalDocumentDrawer(
  { doc, projectId, canVerify, onReload, onClose }: { doc: GovProposalDocument; projectId: string; canVerify: boolean; onReload: () => void; onClose: () => void },
): React.ReactElement {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.contentHtml ?? '');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError(null);
    try { await fn(); onReload(); } catch (e: any) { setError(e?.response?.data?.error || 'That action could not be completed. Try again.'); } finally { setBusy(null); }
  };

  const st = STATUS[doc.status] ?? STATUS.not_started;
  const hasContent = !!doc.contentHtml;

  return (
    <>
      <div className="gck-scrim" onClick={onClose} />
      <aside className="gck-drawer" role="dialog" aria-modal="true" aria-labelledby="gck-doctitle">
        <div className="gck-dh">
          <span className={`gck-tag ${st.cls}`}>{st.label}</span>
          {doc.gate && <span className="gck-tag warn" style={{ marginLeft: 6 }}>required to submit</span>}
          <h2 id="gck-doctitle">{doc.title}</h2>
          <p className="gck-hint" style={{ margin: '4px 0 0' }}>Covers {doc.requirementIds.length} requirement{doc.requirementIds.length === 1 ? '' : 's'}.</p>
        </div>
        <div className="gck-db">
          {/* Preview / editor */}
          {editing ? (
            <div className="gck-sec">
              <h4>Edit the draft (HTML)</h4>
              <textarea rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="gck-btn primary" disabled={!!busy} onClick={() => void run('save', async () => { await draftGovProposalDocument(projectId, doc.key, draft); setEditing(false); })}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="gck-btn ghost" disabled={!!busy} onClick={() => { setDraft(doc.contentHtml ?? ''); setEditing(false); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="gck-sec">
              <h4>Document</h4>
              {hasContent
                ? <div className="gck-doc-preview" dangerouslySetInnerHTML={{ __html: doc.contentHtml as string }} />
                : <div className="gck-hint">Not drafted yet. Use “Draft with AI” to generate a first version.</div>}
            </div>
          )}

          {/* Review thread */}
          {doc.comments.length > 0 && (
            <div className="gck-sec">
              <h4>Review thread</h4>
              <ul className="gck-ac">
                {doc.comments.map((c, i) => (
                  <li key={i}><span className="gck-mono" style={{ color: 'var(--muted)' }}>{new Date(c.at).toLocaleDateString()}</span><span>{c.body}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* Add a comment */}
          <div className="gck-sec">
            <h4>Add a comment</h4>
            <textarea rows={2} value={comment} placeholder="Note for this document…" onChange={(e) => setComment(e.target.value)} />
            <button type="button" className="gck-btn" style={{ marginTop: 6 }} disabled={!!busy || !comment.trim()} onClick={() => void run('comment', async () => { await commentGovProposalDocument(projectId, doc.key, comment); setComment(''); })}>Add comment</button>
          </div>

          {/* Reviewer: request changes */}
          {canVerify && hasContent && doc.status !== 'accepted' && (
            <div className="gck-sec">
              <h4>Send back with a note</h4>
              <textarea rows={2} value={note} placeholder="What needs to change…" onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="gck-btn" style={{ marginTop: 6 }} disabled={!!busy || !note.trim()} onClick={() => void run('changes', async () => { await requestChangesGovProposalDocument(projectId, doc.key, note); setNote(''); })}>Request changes</button>
            </div>
          )}

          {error && <div className="gck-err" role="alert">{error}</div>}
        </div>

        <div className="gck-actions">
          {!editing && doc.status !== 'accepted' && (
            <button type="button" className="gck-btn primary" disabled={!!busy} onClick={() => void run('draft', () => draftGovProposalDocument(projectId, doc.key))}>
              <i className="ri-sparkling-2-line" aria-hidden="true" />{busy === 'draft' ? 'Drafting…' : (hasContent ? 'Re-draft with AI' : 'Draft with AI')}
            </button>
          )}
          {!editing && hasContent && doc.status !== 'accepted' && <button type="button" className="gck-btn" disabled={!!busy} onClick={() => { setDraft(doc.contentHtml ?? ''); setEditing(true); }}>Edit</button>}
          {hasContent && <button type="button" className="gck-btn" onClick={() => printDocument(doc.title, doc.contentHtml as string)}><i className="ri-printer-line" aria-hidden="true" />Download PDF</button>}
          {canVerify && hasContent && doc.status !== 'accepted' && <button type="button" className="gck-btn ok" disabled={!!busy} onClick={() => void run('accept', () => acceptGovProposalDocument(projectId, doc.key))}>{busy === 'accept' ? 'Accepting…' : 'Accept'}</button>}
          <span className="gck-spacer" />
          <button type="button" className="gck-btn ghost" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
