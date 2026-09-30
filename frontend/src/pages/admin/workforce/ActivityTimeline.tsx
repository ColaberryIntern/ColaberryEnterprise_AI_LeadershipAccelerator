import React from 'react';
import { fmtCentralDateTime } from '../../../utils/centralTime';

/**
 * ActivityTimeline — Org Chart v4 (2026-08-20, session CC-20260818-x4nk
 * continued). Ali, live: "the Activity Timeline needs pizzazz and
 * coloring and capability. It should show stages and have the ability to
 * open it quickly in a new tab. It should look like an active timeline. I
 * want to see when tickets are created, updated, closed out." Replaces
 * WorkforceOSPage's old flat one-row-per-ticket list (current status only)
 * with a real vertical dots-and-connectors timeline driven by
 * `TicketActivity` rows — see backend/src/services/workforce/
 * liveAgentsTimelineService.ts. v1 scope: created / status_change / closed
 * event kinds (see that file's own header comment for why `commented`/
 * `agent_output`/field-edit `updated` actions are out of scope for now).
 */

export interface LiveAgentTimelineEvent {
  id: string;
  ticket_id: string;
  ticket_number: number | null;
  ticket_title: string;
  kind: 'created' | 'status_change' | 'closed';
  action: string;
  from_value: string | null;
  to_value: string | null;
  actor_display_name: string;
  occurred_at: string | null;
}

function eventLabel(ev: LiveAgentTimelineEvent): string {
  if (ev.kind === 'created') return 'Ticket created';
  if (ev.kind === 'closed') return ev.from_value ? `Closed (was: ${ev.from_value})` : 'Closed';
  return `Status: ${ev.from_value ?? '—'} → ${ev.to_value ?? '—'}`;
}

const OPEN_IN_NEW_TAB_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width={13} height={13}>
    <path d="M14 4h6v6M20 4l-9 9M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Reuses the EXISTING `?open=<ticketId>` deep-link `AdminTicketBoardPage.tsx`
 * already reads on mount (confirmed in this run's execution-contract.md) —
 * zero backend change needed for this specific link. Opens in a NEW TAB
 * (`noopener,noreferrer`) per this run's explicit requirement — the OLD flat
 * list used a same-tab `<Link>` for this; "quickly in a new tab" is Ali's own
 * ask for this redesign specifically.
 */
function openTicketInNewTab(ticketId: string): void {
  window.open(`/admin/tickets?open=${encodeURIComponent(ticketId)}`, '_blank', 'noopener,noreferrer');
}

interface ActivityTimelineProps {
  events: LiveAgentTimelineEvent[];
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return <div className="wf-muted">No activity yet.</div>;
  }

  return (
    <div className="wf-tl">
      {events.map((ev) => (
        <div className="wf-tl-item" key={ev.id}>
          <div className="wf-tl-rail">
            <span className={`wf-tl-dot ${ev.kind}`} aria-hidden="true" />
            <span className="wf-tl-line" aria-hidden="true" />
          </div>
          <div className="wf-tl-body">
            <div style={{ minWidth: 0 }}>
              <div className="wf-tl-rt">
                {ev.actor_display_name} · TK-{ev.ticket_number ?? '—'} · {ev.occurred_at ? fmtCentralDateTime(ev.occurred_at) : ''}
              </div>
              <div className={`wf-tl-label ${ev.kind}`}>{eventLabel(ev)}</div>
              <div className="wf-muted" style={{ fontSize: 12.5 }}>{ev.ticket_title}</div>
            </div>
            <button
              type="button"
              className="wf-tl-open"
              title="Open ticket in a new tab"
              aria-label={`Open ticket TK-${ev.ticket_number ?? ev.ticket_id} in a new tab`}
              onClick={() => openTicketInNewTab(ev.ticket_id)}
            >
              {OPEN_IN_NEW_TAB_ICON}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ActivityTimeline;
