import React, { useRef, useState } from 'react';

import {
  uploadKnowledgeDocument,
  type KnowledgeUploadResult,
} from '../../services/explorerKnowledgeApi';

/**
 * Upload a document as a knowledge source.
 *
 * ## The success message is the design problem
 *
 * "Uploaded" reads as "in use". It is not: a stored document lands unquotable and stays
 * that way until a human marks it grounded. A panel that said "Uploaded ✓" and nothing else
 * would leave someone believing the composer can now answer from their policy PDF, and the
 * symptom of that belief is a reviewer wondering why the copy never mentions it. So the
 * not-yet-in-use state is the LOUDEST thing on a successful upload, not a footnote.
 *
 * ## Its own file rather than more of ContentTab
 *
 * `ContentTab` is 388 lines against a 500-line ceiling. A whole upload panel added inline
 * would push it over, and the rule here is that the next change to an oversized file splits
 * it before adding code. Splitting before the ceiling is cheaper than splitting after.
 */

/** What the panel reports after a run. */
type PanelState =
  | { kind: 'idle' }
  | { kind: 'uploading'; sent: number; total: number }
  | { kind: 'result'; result: KnowledgeUploadResult }
  | { kind: 'error'; message: string };

/** Human-readable advice per refusal reason. */
const REFUSAL_ADVICE: Record<string, string> = {
  empty_source: 'The file is empty.',
  too_large: 'Upload the section that answers questions rather than the whole volume.',
  extraction_failed: 'Try PDF, Word, PowerPoint, Excel, RTF, OpenDocument, or plain text.',
  no_text: 'This looks like a scan. It needs OCR before it can be used as a source.',
  unknown: 'The file could not be used as a knowledge source.',
};

/**
 * What the panel says after a run.
 *
 * EXPORTED FOR ITS TEST, which is the point rather than a concession: the claim worth
 * pinning is that a success states plainly that the document is not in use yet, and that a
 * refusal cannot be mistaken for one. Both are properties of this markup, and the panel
 * around it needs a file input and an upload to reach them.
 */
export function UploadResultNote({ result }: { result: KnowledgeUploadResult }) {
  if (result.status === 'refused') {
    return (
      <div className="alert alert-warning mt-3 mb-0 py-2 px-3" role="alert">
        <div className="fw-semibold small">Not stored</div>
        <div className="small">{result.message}</div>
        <div className="small text-muted mt-1">{REFUSAL_ADVICE[result.reason]}</div>
      </div>
    );
  }

  const duplicate = result.status === 'duplicate';

  return (
    <div className="alert alert-info mt-3 mb-0 py-2 px-3" role="status">
      <div className="fw-semibold small">
        {duplicate ? 'Already held' : 'Stored — not in use yet'}
      </div>
      <div className="small">
        {duplicate
          ? // Said plainly rather than treated as an error: the end state is what they
            // asked for, and "already uploaded" is useful, not a failure.
            `This exact file is already a knowledge source, in ${result.chunk_count} passage${result.chunk_count === 1 ? '' : 's'}. Nothing was stored twice.`
          : `Split into ${result.chunk_count} passage${result.chunk_count === 1 ? '' : 's'}.`}
      </div>

      {/* The loudest thing on the panel, because "uploaded" reads as "in use". */}
      <div className="small fw-semibold mt-2">{result.review_required}</div>

      {result.truncated && (
        <div className="small text-danger mt-2">
          Only the first {result.extracted_chars?.toLocaleString()} characters were read. The
          rest of this document cannot answer anything — split it and upload the parts.
        </div>
      )}

      {!duplicate && (result.hard_cut_count ?? 0) > 0 && (
        <div className="small text-muted mt-1">
          {result.hard_cut_count} passage{result.hard_cut_count === 1 ? ' was' : 's were'} cut
          without a sentence break, which usually means a table or a slide dump. Worth reading
          before approving.
        </div>
      )}
    </div>
  );
}

export default function KnowledgeUploadPanel({ onUploaded }: { onUploaded?: () => void }) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = state.kind === 'uploading';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;

    setState({ kind: 'uploading', sent: 0, total: file.size });
    try {
      const result = await uploadKnowledgeDocument(file, {
        title: title.trim() || undefined,
        onProgress: (sent, total) => setState({ kind: 'uploading', sent, total }),
      });
      setState({ kind: 'result', result });

      // Reset only on a stored document. After a refusal the filename is still the thing
      // the person is reasoning about, and clearing it makes them hunt for what failed.
      if (result.status !== 'refused') {
        setFile(null);
        setTitle('');
        if (inputRef.current) inputRef.current.value = '';
        onUploaded?.();
      }
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setState({
        kind: 'error',
        message:
          err.response?.status === 403
            ? 'Explorer Growth is switched off. Turn its flag on before uploading.'
            : err.response?.data?.error ?? 'The upload failed. Nothing was stored.',
      });
    }
  };

  const pct =
    state.kind === 'uploading' && state.total > 0
      ? Math.min(100, Math.round((state.sent / state.total) * 100))
      : 0;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">Knowledge sources</div>
      <div className="card-body">
        <p className="text-muted small mb-3">
          Upload a document the composer may quote from. Nothing is quotable until someone
          reviews it and marks it grounded, so an upload is always safe.
        </p>

        <form onSubmit={submit}>
          <div className="row g-2 align-items-end">
            <div className="col-md-5">
              <label className="form-label small fw-medium" htmlFor="knowledge-file">
                Document
              </label>
              <input
                id="knowledge-file"
                ref={inputRef}
                type="file"
                className="form-control form-control-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
                data-testid="knowledge-file"
              />
              <div className="form-text">PDF, Word, PowerPoint, Excel, RTF, OpenDocument or text.</div>
            </div>

            <div className="col-md-5">
              <label className="form-label small fw-medium" htmlFor="knowledge-title">
                Title <span className="text-muted fw-normal">(optional)</span>
              </label>
              <input
                id="knowledge-title"
                type="text"
                className="form-control form-control-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file?.name ?? 'Defaults to the filename'}
                maxLength={500}
                disabled={busy}
                data-testid="knowledge-title"
              />
              <div className="form-text">What a reviewer will see in the list.</div>
            </div>

            <div className="col-md-2">
              <button
                type="submit"
                className="btn btn-sm btn-primary w-100"
                disabled={!file || busy}
                data-testid="knowledge-upload"
              >
                {busy ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                    {pct}%
                  </>
                ) : (
                  <>
                    <i className="ri-upload-2-line me-1" aria-hidden="true" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {state.kind === 'result' && <UploadResultNote result={state.result} />}

        {state.kind === 'error' && (
          <div className="alert alert-danger mt-3 mb-0 py-2 px-3" role="alert">
            <div className="small">{state.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
