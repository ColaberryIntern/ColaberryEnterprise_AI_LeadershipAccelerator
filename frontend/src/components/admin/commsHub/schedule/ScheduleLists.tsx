import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage, messageAction, retryHubMessage, type BoardRow } from '../../../../services/commsHubApi';
import { SectionCard, EmptyState } from '../../shell';
import MessageStatus from '../board/MessageStatus';
import ListState from '../board/ListState';
import { groupByDay, retryLabel, timeOf, whenOf, whereLabel } from '../board/boardDisplay';
import type { BoardList } from '../board/useBoard';

/**
 * Schedule & history's two lists (design 04, CH7.4). "Going out, next 7 days" is grouped by Central
 * day: an approved message can be cancelled (after a confirm), a draft or one waiting for approval
 * opens in Compose. History shows each finished message with plain failure words and, when some or
 * all recipients missed it, a Retry that tries only those again (the CH7.2 retry route).
 */
const compose = (id: string): string => `/admin/comms-hub/compose?message=${id}`;

function useRowAction(onChanged: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, fallback: string): Promise<void> => {
    setBusy(id); setError(null);
    try { await fn(); onChanged(); } catch (err) { setError(apiErrorMessage(err, fallback)); } finally { setBusy(null); }
  };
  return { busy, error, run };
}

function CancelButton({ row, busy, onCancel }: { row: BoardRow; busy: boolean; onCancel: () => void }): React.ReactElement {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={() => setAsking(true)}>Cancel<span className="visually-hidden">: {row.title}</span></button>;
  return (
    <span className="d-inline-flex flex-wrap gap-2" role="group" aria-label={`Cancel ${row.title}?`}>
      <button type="button" className="btn btn-sm btn-danger comms-hub-action" disabled={busy} onClick={onCancel}>Yes, cancel it</button>
      <button type="button" className="btn btn-sm btn-link comms-hub-action" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
    </span>
  );
}

function NextAction({ row, busy, onCancel }: { row: BoardRow; busy: boolean; onCancel: () => void }): React.ReactElement | null {
  if (row.status === 'approved' || row.status === 'scheduled') return <CancelButton row={row} busy={busy} onCancel={onCancel} />;
  if (row.status === 'needs_approval') return <Link className="btn btn-sm btn-primary comms-hub-action" to={compose(row.id)}>Review<span className="visually-hidden">: {row.title}</span></Link>;
  if (row.status === 'draft') return <Link className="btn btn-sm btn-outline-secondary comms-hub-action" to={compose(row.id)}>Open<span className="visually-hidden">: {row.title}</span></Link>;
  return null;
}

export function NextSevenDays({ list, onChanged }: { list: BoardList; onChanged: () => void }): React.ReactElement {
  const act = useRowAction(onChanged);
  return (
    <SectionCard title="Going out, next 7 days" icon="calendar-schedule-line" subtitle="Central time. Sends from the server, even when this page is closed.">
      {act.error && <div className="alert alert-danger py-2" role="alert">{act.error}</div>}
      <ListState list={list} what="schedule" />
      {list.rows && list.rows.length === 0 && <EmptyState icon="calendar-schedule-line" title="Nothing is scheduled" description="Approved messages wait here until their send time." tone="quiet" />}
      {list.rows && groupByDay(list.rows).map((g) => (
        <section key={g.key} className="ch-day" aria-labelledby={`ch-day-${g.key}`}>
          <h3 id={`ch-day-${g.key}`} className="ch-day-h">{g.heading}</h3>
          <ul className="list-unstyled mb-0">
            {g.rows.map((r) => (
              <li key={r.id} className="ch-sched-row">
                <span className="ch-sched-time">{r.send_at ? timeOf(r.send_at) : 'On approval'}</span>
                <span className="ch-sched-main"><span className="fw-bold d-block">{r.title}</span><span className="small text-muted">{whereLabel(r)}</span></span>
                <MessageStatus status={r.status} />
                <NextAction row={r} busy={act.busy === r.id} onCancel={() => { void act.run(r.id, () => messageAction(r.id, 'cancel'), 'It was not cancelled. Try again.'); }} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SectionCard>
  );
}

function HistoryAction({ row, busy, onRetry }: { row: BoardRow; busy: boolean; onRetry: () => void }): React.ReactElement {
  const label = retryLabel(row);
  if (label) return <button type="button" className="btn btn-sm btn-primary comms-hub-action" disabled={busy} onClick={onRetry}>{busy ? 'Retrying...' : label}<span className="visually-hidden">: {row.title}</span></button>;
  return <Link className="btn btn-sm btn-outline-secondary comms-hub-action" to={compose(row.id)}>Details<span className="visually-hidden">: {row.title}</span></Link>;
}

export function HistoryTable({ list, onChanged }: { list: BoardList; onChanged: () => void }): React.ReactElement {
  const act = useRowAction(onChanged);
  return (
    <SectionCard title="History" icon="history-line">
      {act.error && <div className="alert alert-danger py-2" role="alert">{act.error}</div>}
      <ListState list={list} what="history" />
      {list.rows && list.rows.length === 0 && <EmptyState icon="history-line" title="Nothing has gone out yet" description="Every send, failure and cancellation is kept here." tone="quiet" />}
      {list.rows && list.rows.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0 ch-history">
            <caption className="visually-hidden">Messages that have finished, newest first</caption>
            <thead><tr><th scope="col">When</th><th scope="col">Message</th><th scope="col">Went to</th><th scope="col">Status</th><th scope="col">Approved by</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-nowrap">{whenOf(r.send_at ?? r.updated_at)}</td>
                  <td>
                    <span className="fw-bold d-block">{r.title}</span>
                    {r.failure && (
                      <span className="small d-block ch-failure">
                        {r.failure.reason}
                        {r.failure.missed.length > 0 && ` Did not receive it: ${r.failure.missed.join(', ')}.`}
                        {r.failure.attempts > 1 && ` Tried ${r.failure.attempts} times.`}
                      </span>
                    )}
                  </td>
                  <td>{whereLabel(r)}</td>
                  <td><MessageStatus status={r.status} /></td>
                  <td>{r.approved_by ?? 'Not recorded'}</td>
                  <td><HistoryAction row={r} busy={act.busy === r.id} onRetry={() => { void act.run(r.id, () => retryHubMessage(r.id), 'The retry did not start. Try again.'); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
