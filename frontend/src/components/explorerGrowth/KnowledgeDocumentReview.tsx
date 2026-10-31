import React, { useCallback, useEffect, useState } from 'react';

import {
  decideKnowledgeDocument,
  getKnowledgeDocument,
  retireKnowledgeDocument,
  type KnowledgeDocumentDetail,
  type ReviewVerdict,
} from '../../services/explorerKnowledgeApi';

/**
 * Read one document's passages and decide what it may say.
 *
 * ## Approving is not a save, and the UI has to say so
 *
 * Everywhere else in this admin, a button marked "Approve" tidies a record. Here it is the
 * single step in the whole subsystem that lets stored text reach a learner — the quote gate
 * refuses every other state. A control that looked like the usual save would get clicked
 * like the usual save, so the consequence is written next to the button rather than left to
 * be inferred from the word.
 *
 * ## "Needs checking" is not a softer approval
 *
 * `drafted-verify` reads like a halfway house and behaves like a refusal: the gate blocks it
 * exactly as hard as `unstated`. The label therefore avoids any word suggesting partial
 * publication, and the badge is the same warning tone as unreviewed rather than a shade of
 * the approved green.
 *
 * ## Its own file rather than more of KnowledgeReviewPanel
 *
 * The queue and one document's review are two responsibilities, and the repo's rule is to
 * split before the 300-line target rather than after the 500-line ceiling.
 */

/** Passages per request. A 400,000-character source is ~330 of them. */
const PAGE = 20;

type ActionState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'blocked'; message: string }
  | { kind: 'failed'; message: string };

export function confidenceBadge(confidence: string, retiredAt: string | null) {
  if (retiredAt) return { tone: 'bg-dark', label: 'Retired' };
  // Only `grounded` gets the approved tone. `drafted-verify` sits with `unstated` because
  // the gate treats them the same, and a green-ish badge would say otherwise.
  if (confidence === 'grounded') return { tone: 'bg-success', label: 'Approved' };
  if (confidence === 'drafted-verify') return { tone: 'bg-warning text-dark', label: 'Needs checking' };
  return { tone: 'bg-secondary', label: 'Unreviewed' };
}

/**
 * Whether this document's text can reach a learner, said in both directions.
 *
 * Exported and separate so it can be asserted without an async harness, the same way
 * `KnowledgeUploadPanel` exports `UploadResultNote`. "Approved" alone leaves a reviewer
 * guessing whether the composer can use it yet, and that guess is the single mistake this
 * whole surface exists to prevent — so it is never left implied.
 */
export function QuotableNote({ quotable }: { quotable: boolean }) {
  return (
    <div className={`small fw-semibold mb-3 ${quotable ? 'text-success' : 'text-muted'}`}>
      {quotable
        ? 'In use — the composer can quote this document now.'
        : 'Not in use — nothing in this document can be quoted yet.'}
    </div>
  );
}

export default function KnowledgeDocumentReview({
  documentId,
  onChanged,
}: {
  documentId: string;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<KnowledgeDocumentDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  const load = useCallback(
    async (at: number) => {
      setLoading(true);
      try {
        setDetail(await getKnowledgeDocument(documentId, { limit: PAGE, offset: at }));
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    },
    [documentId],
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  async function decide(confidence: ReviewVerdict) {
    setAction({ kind: 'working' });
    try {
      const result = await decideKnowledgeDocument(documentId, confidence);
      if (result.status === 'retired') {
        // A refusal the reviewer can act on, not a crash: the document was withdrawn,
        // possibly by someone else, while this panel was open.
        setAction({ kind: 'blocked', message: result.message });
        await load(offset);
        return;
      }
      setAction({ kind: 'idle' });
      await load(offset);
      onChanged?.();
    } catch {
      setAction({ kind: 'failed', message: 'The decision was not saved. Nothing changed.' });
    }
  }

  async function retire() {
    setAction({ kind: 'working' });
    try {
      await retireKnowledgeDocument(documentId);
      setAction({ kind: 'idle' });
      await load(offset);
      onChanged?.();
    } catch {
      setAction({ kind: 'failed', message: 'The document was not retired. Nothing changed.' });
    }
  }

  if (loading && !detail) {
    return <div className="text-muted small p-3">Loading the document…</div>;
  }

  if (!detail) {
    return (
      <div className="alert alert-warning m-3 py-2 px-3 small" role="alert">
        This document could not be loaded.
      </div>
    );
  }

  const { document: doc, passages, passage_total: total } = detail;
  const badge = confidenceBadge(doc.confidence, doc.retired_at);
  const busy = action.kind === 'working';

  return (
    <div className="border-top p-3 bg-light">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className={`badge ${badge.tone}`}>{badge.label}</span>
        <span className="small text-muted">
          {doc.source_ref} · {doc.chunk_count} passage{doc.chunk_count === 1 ? '' : 's'}
        </span>
        {doc.reviewed_by && (
          <span className="small text-muted">· last reviewed by {doc.reviewed_by}</span>
        )}
      </div>

      <QuotableNote quotable={doc.quotable} />

      {doc.hard_cut_count > 0 && (
        <div className="small text-muted mb-2">
          {doc.hard_cut_count} passage{doc.hard_cut_count === 1 ? ' was' : 's were'} cut without
          a sentence break, which usually means a table or a slide dump. Worth reading closely.
        </div>
      )}

      <ol className="list-group list-group-numbered mb-3" start={offset + 1}>
        {passages.map((p) => (
          <li key={p.chunk_index} className="list-group-item py-2">
            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {p.text}
            </div>
            {p.hard_cut && (
              <div className="small text-warning-emphasis mt-1">Cut mid-sentence.</div>
            )}
          </li>
        ))}
        {passages.length === 0 && (
          <li className="list-group-item py-2 small text-muted">
            This document stored no passages, so it can never answer anything. Retire it.
          </li>
        )}
      </ol>

      {total > PAGE && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            Previous
          </button>
          <span className="small text-muted">
            Passages {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={offset + PAGE >= total || loading}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </button>
        </div>
      )}

      {action.kind === 'blocked' && (
        <div className="alert alert-warning py-2 px-3 small" role="alert">
          {action.message}
        </div>
      )}
      {action.kind === 'failed' && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
          {action.message}
        </div>
      )}

      {doc.retired_at ? (
        <div className="small text-muted">
          Retired on {new Date(doc.retired_at).toLocaleDateString()}. A retired document cannot
          be approved.
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={busy}
            onClick={() => void decide('grounded')}
          >
            Approve for quoting
          </button>
          <button
            type="button"
            className="btn btn-outline-warning btn-sm"
            disabled={busy}
            onClick={() => void decide('drafted-verify')}
          >
            Mark as needing checking
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            disabled={busy}
            onClick={() => void retire()}
          >
            Retire
          </button>
          {/* The consequence, next to the control, because "Approve" reads as "save". */}
          <span className="small text-muted">
            Approving lets the composer quote this text to Explorers.
          </span>
        </div>
      )}
    </div>
  );
}
