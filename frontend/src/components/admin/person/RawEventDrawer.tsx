import React from 'react';
import { CommunicationsPanel, TimelineEvent } from '../../../adminOs/personTypes';
import { DOMAIN_TONE } from '../../../adminOs/personStages';
import { Field, fmtDateTime } from './primitives';

/**
 * The record behind one timeline row.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * ── WHY TWO CALLBACKS AND NOT `setTab` ──────────────────────────────────────
 *
 * This drawer is a *reverse* wire: it does not merely read page state, it
 * changes which tab the page renders. It takes `onClose` and
 * `onOpenCommunications` rather than the page's `setTab`, because handing a
 * child the parent's tab setter would drag `TabKey` — the page's whole
 * navigation vocabulary — into a component that needs exactly one destination.
 *
 * ── NAMING THE TABLE IS THE POINT ───────────────────────────────────────────
 *
 * Every row carries the table it was read from, so any figure on the profile
 * can be traced back to rows. That is the difference between a dashboard a
 * reader believes and one they have to take on faith, and it is why the source
 * is shown as a field AND restated in prose at the bottom.
 */
export default function RawEventDrawer({
  event, personName, personEmail, communications, onClose, onOpenCommunications,
}: {
  event: TimelineEvent;
  personName: string | null;
  personEmail: string;
  communications: CommunicationsPanel | null | undefined;
  onClose: () => void;
  onOpenCommunications: () => void;
}) {
  const tone = DOMAIN_TONE[event.domain] || 'secondary';

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      role="dialog"
      style={{ background: 'rgba(0,0,0,.4)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-0">{event.type}</h5>
              <div className="text-muted small">
                <span className={`badge bg-${tone}-subtle text-${tone}-emphasis me-2`}>
                  {event.domain}
                </span>
                {fmtDateTime(event.occurredAt)}
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="row">
              <Field label="When" value={fmtDateTime(event.occurredAt)} />
              <Field label="Domain" value={event.domain} />
              <Field label="Source table" value={<code>{event.source}</code>} />
              <Field label="Event type" value={<code>{event.type}</code>} />
              {/* A collapsed fan-out says how many it stands for, so the
                  reader is never left wondering what the row hides. */}
              <Field
                label="Identical events collapsed"
                value={event.occurrences > 1
                  ? `${event.occurrences} in the same second`
                  : 'None — this is a single event'} />
              <Field label="Person" value={personName || personEmail} />
              <Field label="Detail" wide value={event.summary} />
            </div>

            {/* A communication event has a whole thread behind it, and the
                reader almost always wants to read the message rather than
                admire its metadata. */}
            {event.domain === 'communication' && communications && (
              <div className="alert alert-light border d-flex justify-content-between align-items-center gap-2">
                <span className="small">
                  This is a communication. The full message, its campaign and any reply
                  are on the Communications tab.
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary flex-shrink-0"
                  onClick={onOpenCommunications}
                >
                  Open thread
                </button>
              </div>
            )}

            {/* Naming the table is the point: any figure on this page can be
                traced to the rows behind it. */}
            <p className="text-muted small mb-0">
              This event came from <code>{event.source}</code>. Every row in the
              timeline is labelled with the table it was read from, so any number here
              can be checked against the data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
