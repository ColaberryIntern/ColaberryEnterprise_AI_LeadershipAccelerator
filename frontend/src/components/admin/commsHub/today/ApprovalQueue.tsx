import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage, rejectHubMessage, type BoardRow } from '../../../../services/commsHubApi';
import { SectionCard, EmptyState } from '../../shell';
import MessageStatus from '../board/MessageStatus';
import ListState from '../board/ListState';
import { includesLabel, whenOf, whereLabel } from '../board/boardDisplay';
import type { BoardList } from '../board/useBoard';

/**
 * "Needs your approval" on Today (design 01, CH7.4). Each draft shows its exact text, where it goes,
 * when, and what it includes. Review & approve and Edit open it in Compose (where approval happens,
 * with the validator); Reject asks for an optional note first and sends it back as a draft.
 */
const compose = (id: string): string => `/admin/comms-hub/compose?message=${id}`;

function RejectForm({ row, onDone, onCancel }: { row: BoardRow; onDone: () => void; onCancel: () => void }): React.ReactElement {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `ch-reject-${row.id}`;
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await rejectHubMessage(row.id, note.trim() || null); onDone(); } catch (err) { setError(apiErrorMessage(err, 'It was not rejected. Try again.')); setBusy(false); }
  };
  return (
    <form className="ch-reject mt-2" onSubmit={submit}>
      <label className="form-label small fw-bold" htmlFor={id}>What should change? (optional)</label>
      <textarea id={id} className="form-control form-control-sm mb-2" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="text-danger small mb-2" role="alert">{error}</p>}
      <div className="d-flex flex-wrap gap-2">
        <button type="submit" className="btn btn-sm btn-outline-danger comms-hub-action" disabled={busy}>Reject and send back</button>
        <button type="button" className="btn btn-sm btn-link comms-hub-action" onClick={onCancel} disabled={busy}>Keep it</button>
      </div>
    </form>
  );
}

function ApprovalCard({ row, onChanged }: { row: BoardRow; onChanged: () => void }): React.ReactElement {
  const [rejecting, setRejecting] = useState(false);
  const titleId = `ch-aq-${row.id}`;
  return (
    <li className="ch-aq-card" aria-labelledby={titleId}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
        <h3 id={titleId} className="ch-aq-title mb-0">{row.title}</h3>
        <MessageStatus status={row.status} />
      </div>
      {row.preview && <p className="ch-aq-preview mb-2">&ldquo;{row.preview}&rdquo;</p>}
      <dl className="ch-aq-facts">
        <div><dt>Where:</dt><dd>{whereLabel(row)}</dd></div>
        <div><dt>When:</dt><dd>{whenOf(row.send_at)}</dd></div>
        <div><dt>Includes:</dt><dd>{includesLabel(row)}</dd></div>
      </dl>
      <div className="d-flex flex-wrap gap-2">
        <Link className="btn btn-sm btn-primary comms-hub-action" to={compose(row.id)}>Review &amp; approve<span className="visually-hidden">: {row.title}</span></Link>
        <Link className="btn btn-sm btn-outline-secondary comms-hub-action" to={compose(row.id)}>Edit<span className="visually-hidden">: {row.title}</span></Link>
        {!rejecting && (
          <button type="button" className="btn btn-sm btn-outline-danger comms-hub-action" onClick={() => setRejecting(true)}>
            Reject<span className="visually-hidden">: {row.title}</span>
          </button>
        )}
      </div>
      {rejecting && <RejectForm row={row} onDone={onChanged} onCancel={() => setRejecting(false)} />}
    </li>
  );
}

export default function ApprovalQueue({ list, onChanged }: { list: BoardList; onChanged: () => void }): React.ReactElement {
  const n = list.rows?.length ?? 0;
  return (
    <SectionCard title="Needs your approval" icon="checkbox-circle-line" actions={list.rows ? <span className="text-muted small">{n} waiting</span> : undefined}>
      <ListState list={list} what="approval queue" />
      {list.rows && n === 0 && (
        <EmptyState icon="inbox-line" title="Nothing is waiting for your approval" description="Drafts for your events and messages appear here. Nothing goes out until you approve it." tone="quiet" />
      )}
      {list.rows && n > 0 && <ul className="list-unstyled mb-0 ch-aq">{list.rows.map((r) => <ApprovalCard key={r.id} row={r} onChanged={onChanged} />)}</ul>}
    </SectionCard>
  );
}
