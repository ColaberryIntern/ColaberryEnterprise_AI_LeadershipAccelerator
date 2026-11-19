import React, { useRef, useState } from 'react';
import { extractIntakeDocument } from '../../../services/sbpApi';
import type { ScopeDocument } from './outlineModel';

// "Already scoped it?" — upload the document instead of retyping it (L12.2).
// Shown in both Brain-dump and Guided outline. The server only reads the file;
// the text comes back here and the wizard folds it into the idea, so the next
// steps see it exactly as they see typed text.

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown';
const MAX_BYTES = 25 * 1024 * 1024;

const ScopeUpload: React.FC<{
  doc: ScopeDocument | null;
  onDoc: (d: ScopeDocument | null) => void;
  /** How many characters of the document fit in the idea (see withDocument). */
  kept: number;
}> = ({ doc, onDoc, kept }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function take(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) { setError('That file is over 25 MB. Upload a smaller copy, or paste the text in.'); return; }
    setBusy(true);
    const res = await extractIntakeDocument(file);
    setBusy(false);
    if (res.ok) onDoc({ fileName: res.doc.fileName, text: res.doc.text });
    else setError(res.error.message);
    if (input.current) input.current.value = '';
  }

  const cut = doc && kept < doc.text.length;
  // The last few words that made it in, so "where it stops" is something the
  // student can find in their own document.
  const tail = cut && doc ? doc.text.slice(Math.max(0, kept - 60), kept).replace(/\s+/g, ' ').trim() : '';

  if (doc) {
    return (
      <div className="pjg-doc" role="status">
        <span className="pjg-doc-ic" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
        </span>
        <div className="pjg-doc-b">
          <div className="pjg-doc-n">{doc.fileName}</div>
          <div className="pjg-doc-s">
            {cut
              ? <>We can take the first {kept.toLocaleString()} of its {doc.text.length.toLocaleString()} characters. It stops after “…{tail}”. Anything later, add in the next step or trim what you typed.</>
              : <>{doc.text.length.toLocaleString()} characters read. It goes to the next step with everything you write here.</>}
          </div>
        </div>
        <button type="button" className="pjg-doc-x" onClick={() => { onDoc(null); setError(null); }}>Remove</button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`pjg-drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
      >
        <div className="pjg-drop-t">
          <strong>Already scoped it?</strong> Upload your document and we'll read it. No need to retype.
          <span className="pjg-drop-h">PDF, Word, PowerPoint, .txt or .md · up to 25 MB</span>
        </div>
        <button type="button" className="pjg-chip add" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading your document…' : (
            <><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M5 20h14" /></svg>Upload a document</>
          )}
        </button>
        <input ref={input} type="file" accept={ACCEPT} hidden aria-label="Upload a scope document" onChange={(e) => { void take(e.target.files?.[0]); }} />
      </div>
      {error && <div className="small" role="alert" style={{ marginTop: 6, color: '#B5710A' }}>{error}</div>}
    </div>
  );
};

export default ScopeUpload;
