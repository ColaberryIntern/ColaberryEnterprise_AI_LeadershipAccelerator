import React, { useEffect, useState } from 'react';
import api from '../../../../utils/api';

/**
 * R3 - what the outbound channel actually did in the same window as the funnel above: messages sent, failed, and cancelled
 * by WHY. The re-engagement channel sent nothing for 71 days and nobody saw it, because this page had no send counter.
 * Zero is shown as "0 sent", never as a blank, and a cancellation with no recorded reason is counted and named.
 *
 * Its own request (like AdProfitabilityCard), so a slow count never holds up the funnel.
 */

export interface SendOutcomes {
  windowDays: number;
  sent: number;
  failed: number;
  cancelled: number;
  cancelledByReason: { reason: string; count: number }[];
}

export async function fetchSendOutcomes(days: number): Promise<SendOutcomes> {
  return (await api.get<SendOutcomes>('/api/admin/marketing/funnel/send-outcomes', { params: { days } })).data;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/** The reason codes as words. Unknown codes are shown as they are, so a new reason is never hidden. */
export function reasonLabel(reason: string): string {
  if (reason === 'no_reason_recorded') return 'No reason recorded';
  const legacy = reason.startsWith('legacy:') ? reason.slice(7) : reason;
  return legacy.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export default function SendOutcomesCard({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<SendOutcomes | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setError(false);
    fetchSendOutcomes(days).then((d) => { if (live) setData(d); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [days]);

  return (
    <section className="mp-card" aria-labelledby="mp-sends-title" data-testid="send-outcomes">
      <h3 className="mp-card__title" id="mp-sends-title">What the outbound channel did</h3>
      <p className="mp-card__note">Scheduled messages in the same window: sent, failed, and cancelled with the reason.</p>
      {error && <div className="alert alert-danger py-2 small mb-0" data-testid="send-outcomes-error">Could not load send outcomes.</div>}
      {!error && !data && <p className="text-muted small mb-0">Loading...</p>}
      {data && (
        <>
          <div className="d-flex gap-4 flex-wrap mb-2" data-testid="send-outcomes-totals">
            <div><div className="fs-4 fw-semibold" data-testid="send-outcomes-sent">{fmt(data.sent)}</div><div className="small text-muted">sent</div></div>
            <div><div className="fs-4 fw-semibold">{fmt(data.failed)}</div><div className="small text-muted">failed</div></div>
            <div><div className="fs-4 fw-semibold" data-testid="send-outcomes-cancelled">{fmt(data.cancelled)}</div><div className="small text-muted">cancelled</div></div>
          </div>
          {data.sent === 0 && (
            <div className="alert alert-warning py-2 small mb-2" data-testid="send-outcomes-zero">
              Nothing was sent in the last {data.windowDays} days.
            </div>
          )}
          {data.cancelledByReason.length > 0 && (
            <table className="table table-sm mb-0">
              <caption className="small text-muted">Cancelled, by reason. Most first.</caption>
              <thead className="table-light"><tr><th scope="col">Reason</th><th scope="col" className="text-end">Cancelled</th></tr></thead>
              <tbody>
                {data.cancelledByReason.map((r) => (
                  <tr key={r.reason}><td>{reasonLabel(r.reason)}</td><td className="text-end">{fmt(r.count)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
