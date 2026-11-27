import React from 'react';
import { Link } from 'react-router-dom';
import { personPath } from '../../../adminOs/personLink';
import { fmtCount } from '../revenueFlow/fmtCount';

/**
 * R7: conversations in progress, on the drill-down.
 *
 * Ali, via the ticket: "try to map in current events like meetings and in talks with. A deal
 * in conversation is the most current signal there is and today it is invisible to every
 * surface."
 *
 * WHAT THE HEADLINE IS BUILT FROM, AND WHY IT IS NOT THE LIFETIME TOTAL
 *
 * The ticket's warning is the thing this component exists to obey: "Expect this surface to
 * be sparse and do not let sparse render as healthy." Measured on production 2026-11-27,
 * the meeting pipeline is dead (nothing booked since 2026-04-28, nothing answered since
 * 2026-04-13) while six replies still land inside the 180-day window.
 *
 * So the headline is built from what falls INSIDE the window, never from the lifetime
 * totals: "6 conversations inside the last 180 days", not "9 meetings booked". Both
 * describe the same rows, and the second is heard as a pipeline with activity in it.
 *
 * The warning tone is reserved for the genuinely dormant case, where nothing at all falls
 * inside the window. Production does not trigger it today. An earlier version of this
 * comment claimed it did; drawing a live color on dead data, or an alarm color on data
 * that is merely thin, are the two lies this card is built to avoid.
 *
 * A TEST ROW IS SHOWN, FLAGGED
 *
 * Three of the nine booked meetings are test rows. They are listed with their reason rather
 * than hidden, the same treatment the government roster gives its test bid: a reader who
 * cannot see the test row cannot tell that the cleanup is still outstanding.
 *
 * NO TIER IS DRAWN FOR "HELD"
 *
 * Not a tier with a zero in it. Nothing in the system records that a meeting took place, and a
 * zero would say the meetings were booked and nobody came. The reason is printed as a sentence
 * instead, where it cannot be read as a measurement.
 */

export interface ConversationEntry {
  id: string;
  kind: string;
  label: string;
  name: string | null;
  leadId: number | null;
  company: string | null;
  at: string;
  suspectReasons: string[];
}

export interface ConversationTier {
  key: string;
  label: string;
  entries: ConversationEntry[];
  suspectCount: number;
  definition: string;
}

export interface ConversationsView {
  headline: string;
  lastAt: string | null;
  daysSince: number | null;
  dormant: boolean;
  tiers: ConversationTier[];
  silentSources: Array<{ label: string; detail: string }>;
  heldNote: string;
  provenance: string;
}

/**
 * The counterparty, linked to their 360.
 *
 * Ali, 2026-09-09: "Everytime we are on the admin side of the app and you see a
 * lead/student/person's name, then clicking on them should take you to the 360 dashboard."
 * The tab is `communications`, because a reader who clicked a name inside a list of meetings
 * and replies wants that person's correspondence, not their invoices.
 *
 * Renders as text when the row carries no lead id, rather than as a link that would 404.
 */
export function Counterparty({ entry }: { entry: ConversationEntry }) {
  const label = entry.name ?? 'No name recorded';
  const to = personPath({ leadId: entry.leadId }, 'communications');

  if (!to) {
    return (
      <span
        style={{ color: entry.name ? 'var(--text-body)' : 'var(--text-muted)' }}
        data-testid={`conversation-name-${entry.id}`}
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      to={to}
      style={{ color: 'var(--text-link)' }}
      data-testid={`conversation-name-${entry.id}`}
    >
      {label}
    </Link>
  );
}

export default function ConversationsPanel({ view }: { view: ConversationsView }) {
  return (
    <div data-testid="conversations">
      {/* The dormancy sentence, before any count. */}
      <div
        className="p-3 mb-3 rounded"
        data-testid="conversations-headline"
        style={{
          background: view.dormant ? 'var(--status-warning-bg)' : 'var(--surface-subtle)',
          borderLeft: `3px solid ${view.dormant ? 'var(--status-warning)' : 'var(--status-info)'}`,
          color: 'var(--text-body)',
          fontSize: 13,
        }}
      >
        {view.dormant && <strong>Needs attention. </strong>}
        {view.headline}
      </div>

      {view.tiers.map((tier) => (
        <div key={tier.key} className="mb-3" data-testid={`conversation-tier-${tier.key}`}>
          <div className="d-flex align-items-baseline gap-2 flex-wrap">
            <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>{tier.label}</strong>
            <span className="small" style={{ color: 'var(--text-muted)' }}>
              {fmtCount(tier.entries.length)} recorded
            </span>
            {tier.suspectCount > 0 && (
              <span
                className="small"
                style={{ color: 'var(--status-warning)' }}
                data-testid={`conversation-suspect-${tier.key}`}
              >
                {tier.suspectCount === 1
                  ? '1 of these does not look real'
                  : `${fmtCount(tier.suspectCount)} of these do not look real`}
              </span>
            )}
          </div>
          <div className="small mb-1" style={{ color: 'var(--text-muted)' }}>{tier.definition}</div>

          {tier.entries.length === 0 ? (
            <div
              className="small"
              style={{ color: 'var(--text-muted)' }}
              data-testid={`conversation-empty-${tier.key}`}
            >
              None recorded. The source was read and held no row of this kind.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                <thead className="table-light">
                  <tr>
                    <th scope="col">Who</th>
                    <th scope="col">Company</th>
                    <th scope="col">When</th>
                    <th scope="col">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {tier.entries.map((e) => (
                    <tr key={e.id} data-testid={`conversation-${e.id}`}>
                      <td style={{ whiteSpace: 'nowrap' }}><Counterparty entry={e} /></td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {e.company ?? 'None recorded'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-body)' }}>{e.at}</td>
                      <td style={{ color: 'var(--status-warning)' }}>
                        {e.suspectReasons.join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div
        className="small p-2 mb-2 rounded"
        data-testid="conversations-held"
        style={{ background: 'var(--surface-subtle)', color: 'var(--text-body)' }}
      >
        <strong>No meeting is shown as held.</strong> {view.heldNote}
      </div>

      <div className="small mb-2" style={{ color: 'var(--text-muted)' }} data-testid="conversations-silent">
        <strong>Other places a meeting could have been recorded:</strong>
        <ul className="mb-0">
          {view.silentSources.map((s) => (
            <li key={s.label}><code>{s.label}</code>: {s.detail}</li>
          ))}
        </ul>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{view.provenance}</div>
    </div>
  );
}
