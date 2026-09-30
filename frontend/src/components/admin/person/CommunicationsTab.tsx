import React, { useState } from 'react';
import { CommunicationMessage, CommunicationOutcome, CommunicationsPanel, MessageAsSent } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDateTime } from './primitives';
import AsSentPanel, { RenderedBody, highlightClicked } from './MessageAsSent';

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

function MessageRow({ m, personRef }: { m: CommunicationMessage; personRef: string }) {
  const [open, setOpen] = useState(false);
  const inbound = m.direction === 'inbound';
  const when = m.sentAt ?? m.scheduledFor;
  const pending = !m.sentAt && !!m.scheduledFor;
  // An open or click on a message we do not hold -- typically a transactional
  // email Mandrill saw but no campaign sent. Not "from us" and not "from them":
  // it is evidence of engagement, labelled as such.
  const engagementOnly = m.source === 'interaction_outcomes';

  return (
    <div className={`border-start border-3 ps-3 py-2 mb-2 ${inbound ? 'border-success' : engagementOnly ? 'border-info-subtle' : 'border-secondary-subtle'}`}>
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="flex-grow-1">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <i className={CHANNEL_ICON[m.channel ?? 'email'] ?? 'ri-mail-line'} aria-hidden="true" />
            {/* Inbound is the half a campaign-scoped view never showed. */}
            {engagementOnly ? (
              <span className={`badge bg-${OUTCOME_TONE[m.status ?? ''] ?? 'info'}-subtle text-${OUTCOME_TONE[m.status ?? ''] ?? 'info'}-emphasis`}
                title="Recorded by Mandrill on a message this platform did not store. Open it to fetch the email as it was sent.">
                {m.status} · message not held
              </span>
            ) : (
              <span className={`badge bg-${inbound ? 'success' : 'secondary'}-subtle text-${inbound ? 'success' : 'secondary'}-emphasis`}>
                {inbound ? 'from them' : 'from us'}
              </span>
            )}
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

      {open && <MessageModal m={m} personRef={personRef} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Every clicked URL the outcomes on this message know about, masked, distinct. */
function clickedUrlsOf(outcomes: CommunicationOutcome[]): string[] {
  const out: string[] = [];
  for (const o of outcomes) for (const u of o.clickedUrls ?? []) if (!out.includes(u)) out.push(u);
  return out;
}

/**
 * What happened to a message, as a small timeline in the outcome colours.
 *
 * One dot per event, left to right in time, coloured with the same tone the
 * badges use everywhere else on this page so a reader learns one vocabulary.
 *
 * Two honesty rules the visual carries:
 *
 *   1. An outcome whose recorded subject DIFFERS from this message is drawn
 *      hollow and labelled with the subject Mandrill actually saw. The poll
 *      that writes these pins every open to the most recent sent email, so a
 *      login-email open lands here -- and a solid dot would claim she opened
 *      THIS email when she did not.
 *   2. "Clicked" names WHICH link when the URL is known -- from the row (rows
 *      the poll wrote from 2026-09-11 on) or, for older rows, from the as-sent
 *      fetch below, whose result is lifted into this component for exactly
 *      that reason. When it is known from neither, it says so rather than
 *      highlighting a guess.
 */
function OutcomeTimeline({ sentAt, outcomes, alsoClicked = [] }: {
  sentAt: string | null;
  outcomes: CommunicationOutcome[];
  /**
   * Clicked URLs the as-sent fetch found, when the stored row had none. Old
   * rows predate the poll keeping URLs, but Mandrill still knows them -- and
   * once it has said so on this screen, this note must not go on claiming the
   * URL is unknown.
   */
  alsoClicked?: string[];
}) {
  const events = [
    ...(sentAt ? [{ outcome: 'sent', at: sentAt, channel: null, subject: null, attributed: true }] : []),
    ...outcomes,
  ].filter((e) => e.at).sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());

  if (events.length === 0) {
    return <p className="text-muted small mb-0">Nothing recorded after sending.</p>;
  }

  const misattributed = outcomes.filter((o) => !o.attributed);
  const clicks = outcomes.filter((o) => o.attributed && o.outcome === 'clicked');
  const tone = (o: string) => OUTCOME_TONE[o] ?? (o === 'sent' ? 'secondary' : 'secondary');
  // The row's own URLs when it has them; otherwise whatever the fetch learned.
  const stored = clickedUrlsOf(clicks);
  const known = stored.length > 0 ? stored : alsoClicked;
  const fromFetch = stored.length === 0 && alsoClicked.length > 0;

  return (
    <>
      <div className="d-flex align-items-start" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        {events.map((e, i) => (
          <div key={`${e.outcome}-${e.at}-${i}`} className="d-flex align-items-start" style={{ minWidth: 0 }}>
            <div className="text-center" style={{ width: 104 }}>
              <div
                title={e.subject && !e.attributed ? `Recorded on: ${e.subject}` : e.outcome}
                className={`rounded-circle d-inline-block border border-2 border-${tone(e.outcome)}`}
                style={{
                  width: 14, height: 14,
                  background: e.attributed ? `var(--bs-${tone(e.outcome)})` : 'transparent',
                }}
              />
              <div className={`small fw-medium text-${tone(e.outcome)}`} style={{ lineHeight: 1.1, marginTop: 4 }}>
                {e.outcome}
              </div>
              <div className="text-muted" style={{ fontSize: '.68rem', lineHeight: 1.2 }}>
                {fmtDateTime(e.at)}
              </div>
            </div>
            {i < events.length - 1 && (
              <div style={{ width: 28, height: 2, background: 'var(--bs-border-color)', marginTop: 6, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      {clicks.length > 0 && (known.length > 0 ? (
        <div className="small mb-1 mt-2">
          <i className="ri-cursor-line me-1 text-success" aria-hidden="true" />
          Clicked {clicks.length === 1 ? 'once' : `${clicks.length} times`}, on:
          <ul className="mb-0 mt-1">
            {known.map((u) => <li key={u}><code style={{ fontSize: '.75rem' }}>{u}</code></li>)}
          </ul>
          {fromFetch && (
            <span className="text-muted">
              The stored row predates the poll keeping URLs; this came back with the message below.
            </span>
          )}
        </div>
      ) : (
        <p className="small text-muted mb-1 mt-2">
          <i className="ri-cursor-line me-1" aria-hidden="true" />
          A link was clicked {clicks.length === 1 ? 'once' : `${clicks.length} times`}, but the tracking
          poll did not keep the URL before 2026-09-11, so nothing in the message is highlighted —
          highlighting a guess would be worse than saying we do not know.
        </p>
      ))}

      {misattributed.length > 0 && (
        <div className="alert alert-warning small py-2 mb-0 mt-2">
          <strong>{misattributed.length} of these {misattributed.length === 1 ? 'was' : 'were'} not on this email.</strong>{' '}
          Hollow dots are opens and clicks Mandrill recorded on a <em>different</em> message
          {' '}({Array.from(new Set(misattributed.map((o) => o.subject).filter(Boolean))).join('; ')}) that the
          tracking poll pinned to this one because it was the most recent send. They are shown so the
          discrepancy is visible, not hidden.
        </div>
      )}
    </>
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
function MessageModal({ m, personRef, onClose }: { m: CommunicationMessage; personRef: string; onClose: () => void }) {
  const inbound = m.direction === 'inbound';
  const clicked = clickedUrlsOf(m.outcomes);
  // What the as-sent fetch learned, lifted here so the timeline above and the
  // message below are one account rather than two that disagree.
  const [fetched, setFetched] = useState<MessageAsSent | null>(null);
  const fetchedClicks = fetched?.found ? fetched.clickedUrls : [];
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

            <div className="mb-3">
              <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                What happened to it
              </div>
              <OutcomeTimeline sentAt={m.sentAt} outcomes={m.outcomes} alsoClicked={fetchedClicks} />
            </div>

            <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
              Message — as it looked to them
            </div>
            {m.body ? (
              <>
                {clicked.length > 0 && (
                  <p className="small mb-2">
                    <span className="badge bg-success-subtle text-success-emphasis me-1">
                      <i className="ri-cursor-line me-1" aria-hidden="true" />clicked
                    </span>
                    The highlighted {clicked.length === 1 ? 'link is the one' : 'links are the ones'} they clicked.
                  </p>
                )}
                <RenderedBody body={highlightClicked(m.body, clicked)} />
              </>
            ) : (
              /* Not held here. A cancelled send has nothing to fetch; a
                 message Mandrill sent can be fetched from Mandrill, as sent,
                 on demand -- the panel says which it is. */
              <AsSentPanel personRef={personRef} m={m} onLoaded={setFetched} />
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

export default function CommunicationsTab({ communications, personRef }: {
  communications: CommunicationsPanel | null | undefined;
  /** The ref this page was opened with; the modal sends it back to fetch a message as sent. */
  personRef: string;
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
              t.messages.map((m) => <MessageRow key={m.id} m={m} personRef={personRef} />)
            )}
          </div>
        </div>
      ))}
    </>
  );
}
