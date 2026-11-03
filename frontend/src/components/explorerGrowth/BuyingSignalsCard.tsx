import React from 'react';
import type { BuyingSignals } from '../../services/explorerGrowthApi';

/**
 * BuyingSignalsCard — C100. Two facts for the person deciding whether to reach out: an abandoned checkout and clicks
 * on the "Enroll to unlock" link. Read live, never scored, never sent anything: showing them is the whole job.
 *
 * A source that could not be read says so; it is never shown as "none", because "we could not look" and "we looked
 * and found nothing" are different answers to the same question.
 */

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) + ' CT' : '';

function Row({ label, count, lastAt, extra, unavailable }: {
  label: string; count: number; lastAt: string | null; extra?: string; unavailable: boolean;
}) {
  return (
    <tr>
      <td className="text-muted">{label}</td>
      <td data-testid={`buying-${label.toLowerCase().replace(/\W+/g, '-')}`}>
        {unavailable ? <span className="text-warning">could not be read</span>
          : count === 0 ? <span className="text-muted">none</span>
            : <><strong>{count}</strong>{lastAt ? <span className="text-muted">, last {when(lastAt)}</span> : null}{extra ? <span className="text-muted"> ({extra})</span> : null}</>}
      </td>
    </tr>
  );
}

export default function BuyingSignalsCard({ signals }: { signals: BuyingSignals }) {
  const { checkout_abandoned: c, enroll_link_click: e, unavailable } = signals;
  return (
    <table className="table table-sm mb-0" aria-label="Buying signals">
      <tbody>
        <Row label="Abandoned checkout" count={c.count} lastAt={c.last_at} unavailable={unavailable.includes('checkout_abandoned')}
          extra={c.plans.length ? `${c.plans.join(', ')} plan` : undefined} />
        <Row label="Enroll link clicks" count={e.count} lastAt={e.last_at} unavailable={unavailable.includes('enroll_link_click')} />
      </tbody>
    </table>
  );
}
