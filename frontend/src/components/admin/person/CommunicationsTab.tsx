import React, { useState } from 'react';
import { CommunicationMessage, CommunicationsPanel } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDateTime } from './primitives';

/**
 * Every communication with this person, threaded by campaign.
 *
 * The campaign lead modal already showed this — for ONE campaign. A person in
 * four campaigns had four places to look and no single history, and anything
 * sent outside a campaign appeared nowhere. This is the same detail, keyed on
 * the person.
 *
 * Bodies are collapsed by default and expand in place: the point of the tab is
 * to READ the messages, but a thread of thirty full emails is unusable as a
 * wall of text.
 */

const OUTCOME_TONE: Record<string, string> = {
  opened: 'info', clicked: 'success', replied: 'success',
  bounced: 'danger', unsubscribed: 'danger', failed: 'danger',
};

const CHANNEL_ICON: Record<string, string> = {
  email: 'ri-mail-line', sms: 'ri-message-2-line', voice: 'ri-phone-line',
  linkedin: 'ri-linkedin-box-line',
};

function MessageRow({ m }: { m: CommunicationMessage }) {
  const [open, setOpen] = useState(false);
  const inbound = m.direction === 'inbound';
  const when = m.sentAt ?? m.scheduledFor;
  const pending = !m.sentAt && !!m.scheduledFor;

  return (
    <div className={`border-start border-3 ps-3 py-2 mb-2 ${inbound ? 'border-success' : 'border-secondary-subtle'}`}>
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="flex-grow-1">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <i className={CHANNEL_ICON[m.channel ?? 'email'] ?? 'ri-mail-line'} aria-hidden="true" />
            {/* Inbound is the half a campaign-scoped view never showed. */}
            <span className={`badge bg-${inbound ? 'success' : 'secondary'}-subtle text-${inbound ? 'success' : 'secondary'}-emphasis`}>
              {inbound ? 'from them' : 'from us'}
            </span>
            {m.subject
              ? <span className="fw-medium">{m.subject}</span>
              : <span className="text-muted fst-italic">{m.status ?? 'no subject'}</span>}
            {m.aiGenerated && (
              <span className="badge bg-info-subtle text-info-emphasis" title="Drafted by AI">AI</span>
            )}
            {m.stepIndex !== null && (
              <span className="text-muted small">step {m.stepIndex + 1}</span>
            )}
            {pending && (
              <span className="badge bg-warning-subtle text-warning-emphasis">scheduled</span>
            )}
          </div>

          <div className="text-muted small mt-1">
            {fmtDateTime(when) ?? 'no timestamp'}
            {m.toAddress && <> · {m.toAddress}</>}
            <> · <code style={{ fontSize: '.7rem' }}>{m.source}</code></>
          </div>

          {m.outcomes.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-1">
              {m.outcomes.map((o, i) => (
                <span key={`${o.outcome}-${i}`}
                  className={`badge bg-${OUTCOME_TONE[o.outcome] ?? 'secondary'}-subtle text-${OUTCOME_TONE[o.outcome] ?? 'secondary'}-emphasis`}
                  title={fmtDateTime(o.at) ?? undefined}>
                  {o.outcome}
                </span>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="btn btn-sm btn-link text-decoration-none p-0 flex-shrink-0"
          onClick={() => setOpen(true)}>
          Open
        </button>
      </div>

      {open && <MessageModal m={m} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * One message in full.
 *
 * Matches the campaign lead modal's shape -- the message on the left, its
 * delivery facts on the right -- because that is the layout Ali already reads
 * these in, and a second arrangement for the same content is a second thing to
 * learn. What it deliberately does NOT repeat is the campaign-level summary
 * (step progress, touchpoints, enrolment status): that sits on the thread
 * header above, and printing it again in every message is noise.
 */
function MessageModal({ m, onClose }: { m: CommunicationMessage; onClose: () => void }) {
  const inbound = m.direction === 'inbound';
  return (
    <div className="modal d-block" tabIndex={-1} role="dialog"
      style={{ background: 'rgba(0,0,0,.4)' }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-0">
                {m.subject || <span className="text-muted fst-italic">No subject</span>}
              </h5>
              <div className="text-muted small mt-1">
                <span className={`badge bg-${inbound ? 'success' : 'secondary'}-subtle text-${inbound ? 'success' : 'secondary'}-emphasis me-2`}>
                  {inbound ? 'from them' : 'from us'}
                </span>
                {fmtDateTime(m.sentAt ?? m.scheduledFor) ?? 'no timestamp'}
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="text-muted text-uppercase" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>Channel</div>
                <div className="fw-medium">{m.channel ?? '—'}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted text-uppercase" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>Status</div>
                <div className="fw-medium">{m.status ?? '—'}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted text-uppercase" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>Step</div>
                <div className="fw-medium">{m.stepIndex !== null ? m.stepIndex + 1 : '—'}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-muted text-uppercase" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>Written by</div>
                <div className="fw-medium">{m.aiGenerated ? 'AI' : 'Human'}</div>
              </div>
              <div className="col-12">
                <div className="text-muted text-uppercase" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>To</div>
                <div className="fw-medium">{m.toAddress ?? '—'}</div>
              </div>
            </div>

            {m.outcomes.length > 0 && (
              <div className="mb-3">
                <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  What happened to it
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {m.outcomes.map((o, i) => (
                    <span key={`${o.outcome}-${i}`}
                      className={`badge bg-${OUTCOME_TONE[o.outcome] ?? 'secondary'}-subtle text-${OUTCOME_TONE[o.outcome] ?? 'secondary'}-emphasis`}>
                      {o.outcome}{o.at ? ` · ${fmtDateTime(o.at)}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
              Message
            </div>
            {m.body ? (
              <div className="p-3 bg-light rounded small"
                style={{ whiteSpace: 'pre-wrap', maxHeight: 460, overflowY: 'auto' }}>
                {m.body}
              </div>
            ) : (
              /* Absent, stated. Cancelled sends and some logged mail genuinely
                 store no body -- that is not a rendering failure. */
              <p className="text-muted small mb-0">
                No body was stored for this message, so there is nothing to read.
              </p>
            )}

            <p className="text-muted small mb-0 mt-3">
              Read from <code>{m.source}</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CommunicationsTab({ communications }: {
  communications: CommunicationsPanel | null | undefined;
}) {
  if (!communications) {
    return <EmptyPanel>No lead record, so there is no communication history to show.</EmptyPanel>;
  }

  const { threads, totalMessages, totalCampaigns, totalOutcomes, inboundCount, truncated } = communications;

  if (threads.length === 0) {
    return <EmptyPanel>Nothing has ever been sent to this person, and nothing received from them.</EmptyPanel>;
  }

  return (
    <>
      <div className="row g-3 mb-4">
        <Stat label="Messages" value={totalMessages} />
        <Stat label="Campaigns" value={totalCampaigns} />
        <Stat label="Replies from them" value={inboundCount}
          tone={inboundCount > 0 ? 'success' : undefined} />
        <Stat label="Opens & clicks" value={totalOutcomes} />
      </div>

      {truncated && (
        <div className="alert alert-warning small">
          Showing the most recent messages only — this person has more than the page limit.
          Said plainly rather than implying this is the whole history.
        </div>
      )}

      {threads.map((t) => (
        <div key={t.campaignId ?? 'none'} className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white">
            <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
              <div>
                <span className="fw-semibold">{t.campaignName}</span>
                {t.enrollmentStatus && (
                  <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">
                    {t.enrollmentStatus}
                  </span>
                )}
              </div>
              <div className="text-muted small">
                {t.totalSteps ? <>Step {(t.stepIndex ?? 0) + 1} of {t.totalSteps} · </> : null}
                {t.touchpoints !== null && <>{t.touchpoints} touchpoints · </>}
                {t.responses !== null && <>{t.responses} responses</>}
              </div>
            </div>
          </div>
          <div className="card-body">
            {t.messages.length === 0 ? (
              <EmptyPanel>Enrolled, but nothing has been sent yet.</EmptyPanel>
            ) : (
              t.messages.map((m) => <MessageRow key={m.id} m={m} />)
            )}
          </div>
        </div>
      ))}
    </>
  );
}
