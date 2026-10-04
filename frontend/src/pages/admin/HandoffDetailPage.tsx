import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/admin/shell/PageHeader';
import AsyncPanel from '../../components/explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from '../../components/growthJourney/useGrowthJourneyData';
import { safeText } from '../../components/growthJourney/journeyText';
import {
  acceptHandoff,
  dispositionHandoff,
  getHandoff,
  handoffConflict,
  releaseHandoff,
  type HandoffDetail,
  type HandoffRow,
} from '../../services/growthJourneyApi';

/**
 * One handoff, and the three moves an operator can make on it (Phase 6, T613).
 *
 * ── THE 409 IS AN ANSWER, NOT A FAILURE ─────────────────────────────────────
 *
 * The state machine decides what is legal, and an illegal move answers 409 with
 * the status the row was actually in (`from`). That is the single most useful
 * sentence this page can show - "you cannot release a queued handoff, it is
 * queued" tells an operator what to do next, where a red "request failed" sends
 * them to Slack. So a conflict renders as its own calm notice carrying `from`,
 * and only a genuine fault renders as an error.
 *
 * ── THE PACKET IS REDACTED HERE, AND THE PLAN SAID IT NEED NOT BE ───────────
 *
 * T613's plan states "the packet already carries no address". That is not true,
 * and T612's privacy sweep is the evidence: `GET /handoffs/:id` serves the
 * `evidence` column whole, and this repo's own access-suite fixtures seed it with
 * `{ contact: 'lead@example.com' }` - because an evidence packet is exactly where
 * a human would record how to reach someone. Nine admin read routes behave this
 * way; whether the API should scrub is Ali's decision, because it changes an
 * admin payload with consumers.
 *
 * Until that is decided, this page does not render an address it was handed. The
 * redaction is structural: every packet string is masked on the way to the DOM -
 * KEYS AS WELL AS VALUES.
 *
 * The keys were NOT masked in the first version of this file, and the caption under
 * the packet table claimed they were. T613's verifier moved the address out of a
 * packet value and into a packet KEY and it rendered verbatim, directly beneath that
 * caption. The backend shares the blind spot: `services/growthJourney/noAddress.ts`
 * recurses `Object.entries(...)` VALUES and never inspects a key, so
 * `assertPacketCarriesNoAddress` would not refuse such a row either. It is not a live
 * leak today because the writer builds packets from a frozen field list - but
 * `packet` is free-form JSONB, and "not trusted to be address-free" is this page's
 * own stated contract.
 */

/*
 * `safeText` and its `ADDRESS` regex moved to `components/growthJourney/journeyText.ts`
 * in T614, unchanged, because the classification, decisions and content tabs are the
 * third through fifth call sites. What the mask does NOT catch - `@handle`,
 * `lead @example.com`, `lead@`, full-width `＠` - is documented there and pinned by
 * `journeyText.test.ts`, which asserts those shapes still pass through so that
 * widening the pattern has to break a named test. The captions below are written
 * against that limit and must not be loosened without it.
 */

const FIELDS: { key: keyof HandoffRow; label: string }[] = [
  { key: 'subject_ref', label: 'Subject' },
  { key: 'owner_queue', label: 'Queue' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'expected_value', label: 'Expected value' },
  { key: 'reason', label: 'Reason' },
  { key: 'best_channel', label: 'Best channel' },
  { key: 'consent_basis', label: 'Consent basis' },
  { key: 'sla_due_at', label: 'SLA due' },
  { key: 'assigned_to_id', label: 'Assigned to' },
  { key: 'ticket_id', label: 'Ticket' },
  { key: 'decision_id', label: 'Decision' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'disposition_reason', label: 'Disposition reason' },
  { key: 'created_at', label: 'Created' },
];

type Notice =
  | { kind: 'conflict'; message: string; from: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; message: string };

export default function HandoffDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const detail = useGrowthJourneyData<HandoffDetail>(() => getHandoff(id), `handoff:${id}`);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  /** One move, one place that turns a 409 into a sentence rather than a failure. */
  const move = async (label: string, run: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await run();
      setNotice({ kind: 'done', message: `${label} recorded.` });
      detail.reload();
    } catch (err) {
      const conflict = handoffConflict(err);
      if (conflict) {
        setNotice({ kind: 'conflict', message: conflict.error, from: conflict.from });
      } else {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          || (err as Error)?.message
          || 'Request failed';
        setNotice({ kind: 'error', message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <PageHeader
        title="Handoff"
        icon="user-shared-line"
        subtitle="One packet, and the three moves the state machine allows on it."
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Growth Journey', to: '/admin/growth-journey' },
          { label: 'Handoff' },
        ]}
      />

      {notice && (
        <div
          className={`alert ${notice.kind === 'error' ? 'alert-danger' : notice.kind === 'conflict' ? 'alert-warning' : 'alert-success'} mt-3`}
          role="status"
        >
          {notice.kind === 'conflict' ? (
            <>
              <strong>That move is not legal from here.</strong> {notice.message} The row is{' '}
              <code>{notice.from}</code>, and the state machine — not this page — decides what follows it.
            </>
          ) : (
            notice.message
          )}
        </div>
      )}

      <AsyncPanel state={detail} onRetry={detail.reload}>
        {(d) => (
          <div className="row g-3 mt-1">
            <div className="col-lg-7">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white fw-semibold">Handoff</div>
                <div className="card-body">
                  <table className="table table-sm mb-0">
                    <caption className="small text-muted">
                      Ids, counts and ranks. Addresses are masked on the way out - see this file&rsquo;s
                      header for the shapes the mask does not catch.
                    </caption>
                    <thead className="visually-hidden">
                      <tr><th scope="col">Field</th><th scope="col">Value</th></tr>
                    </thead>
                    <tbody>
                      {FIELDS.map((f) => (
                        <tr key={String(f.key)}>
                          <th scope="row" className="fw-normal text-muted" style={{ width: '40%' }}>{f.label}</th>
                          <td>{safeText(d.handoff[f.key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(d.handoff.talking_points?.length ?? 0) > 0 && (
                <div className="card border-0 shadow-sm mt-3">
                  <div className="card-header bg-white fw-semibold">Talking points</div>
                  <ul className="list-group list-group-flush">
                    {(d.handoff.talking_points ?? []).map((t, i) => (
                      <li className="list-group-item" key={i}>{safeText(t)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="col-lg-5">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white fw-semibold">Packet</div>
                <div className="card-body">
                  {Object.keys(d.packet).length === 0 ? (
                    <p className="text-muted mb-0">The packet is empty.</p>
                  ) : (
                    <table className="table table-sm mb-0">
                      <caption className="small text-muted">
                        Rendered through a redaction, not trusted to be address-free — see this file&rsquo;s header.
                      </caption>
                      <thead className="visually-hidden">
                        <tr><th scope="col">Key</th><th scope="col">Value</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(d.packet).map(([k, v]) => (
                          <tr key={k}>
                            <th scope="row" className="fw-normal text-muted" style={{ width: '40%' }}><code>{safeText(k)}</code></th>
                            <td className="text-break">{safeText(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="card border-0 shadow-sm mt-3">
                <div className="card-header bg-white fw-semibold">Moves</div>
                <div className="card-body d-grid gap-2">
                  <label className="form-label small fw-medium mb-0" htmlFor="gj-handoff-reason">
                    Reason (required to disposition)
                  </label>
                  <input
                    id="gj-handoff-reason"
                    className="form-control form-control-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="what happened, in a sentence"
                  />
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                    onClick={() => move('Accept', () => acceptHandoff(id))}>
                    Accept
                  </button>
                  <button type="button" className="btn btn-success btn-sm" disabled={busy || !reason}
                    onClick={() => move('Disposition', () => dispositionHandoff(id, { disposition: 'qualified', reason }))}>
                    Disposition as qualified
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                    onClick={() => move('Release', () => releaseHandoff(id, reason ? { reason } : {}))}>
                    Release
                  </button>
                  <p className="small text-muted mb-0">
                    Nothing here notifies anyone. A qualified disposition reaches the delivery systems
                    through the machine&rsquo;s one door, never from this page.
                  </p>
                </div>
              </div>

              <p className="mt-3 mb-0">
                <Link to="/admin/growth-journey?tab=handoffs">Back to the handoff queue</Link>
              </p>
            </div>
          </div>
        )}
      </AsyncPanel>
    </div>
  );
}
