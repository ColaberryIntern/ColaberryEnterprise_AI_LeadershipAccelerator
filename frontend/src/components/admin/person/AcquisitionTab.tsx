import React from 'react';
import { Link } from 'react-router-dom';
import { AcquisitionPanel, TempEntry, VisitorData } from '../../../adminOs/personTypes';
import { TEMPERATURE_TONE } from '../../../adminOs/personStages';
import SectionCard from '../shell/SectionCard';
import { Field, Unknown, fmtDate, fmtDateTime } from './primitives';

/**
 * How this person arrived, and what we know about the arrival.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212). It was 191 lines
 * inline — the largest single block in a 1,076-line file, against CLAUDE.md's
 * 500-line hard ceiling — and the rule is that the next change to an oversize
 * file splits it before adding new code. Behaviour is unchanged by the move;
 * the one addition is the GoHighLevel linkage below.
 *
 * ── THE GHL LINKAGE, AND WHY ITS ABSENCE IS A SENTENCE ──────────────────────
 *
 * `ghlContactId` is null for most people, because most were never pushed to the
 * CRM. That is a fact about them, not a gap in the page, so it renders as "Not
 * linked to GoHighLevel" rather than through the generic `Unknown` ("Not
 * recorded") — the two read the same to a careless eye but mean different
 * things, and an operator deciding whether to look for someone in GHL needs the
 * difference. Nothing here throws when it is absent: a missing linkage is the
 * common path, not the error path.
 */
export default function AcquisitionTab({
  acq, email, company, intentSuppressedReason, visitor, tempHistory,
}: {
  acq: AcquisitionPanel | null | undefined;
  email: string;
  company: string | null;
  intentSuppressedReason: string | undefined;
  visitor: VisitorData | null;
  tempHistory: TempEntry[] | null;
}) {
  if (!acq) {
    return (
      <SectionCard title="How they found us">
        <p className="text-muted small mb-0">
          No lead record for this person, so nothing is recorded about how they arrived.
          They enrolled without ever being captured as a lead.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <SectionCard title="Contact">
          <div className="row">
            <Field label="Email" value={email} />
            <Field label="Phone" value={acq.phone} />
            <Field label="Role" value={acq.role} />
            <Field label="Company" value={company} />
            <Field label="Company size" value={acq.companySize} />
            <Field label="Industry" value={acq.industry} />
            <Field
              label="LinkedIn"
              value={acq.linkedinUrl
                ? <a href={acq.linkedinUrl} target="_blank" rel="noreferrer">Profile</a>
                : null}
            />
            <Field label="Evaluating in 90 days" value={
              acq.evaluating90Days === null ? null : (acq.evaluating90Days ? 'Yes' : 'No')} />
            <Field label="Lead created" value={fmtDate(acq.createdAt)} />
            <Field
              label="Consent to contact"
              value={acq.consentContact === null ? null : (
                <span className={`badge text-bg-${acq.consentContact ? 'success' : 'danger'}`}>
                  {acq.consentContact ? 'Given' : 'Not given'}
                </span>
              )}
            />
            {/* T212. Said as a sentence when absent, not as a blank field. */}
            <Field
              label="GoHighLevel contact"
              wide
              value={acq.ghlContactId ?? (
                <span className="text-muted small">Not linked to GoHighLevel</span>
              )}
            />
          </div>
        </SectionCard>
      </div>

      <div className="col-lg-6">
        <SectionCard title="Qualification">
          {/* Said out loud. A missing score with no explanation reads as
              a data gap; this is a deliberate omission. */}
          {intentSuppressedReason && (
            <div className="alert alert-light border py-2 px-3 small mb-3">
              <i className="ri-information-line me-1" />
              {intentSuppressedReason}
            </div>
          )}
          <div className="row">
            <Field label="Pipeline stage" value={acq.pipelineStage} />
            <Field label="Status" value={acq.status} />
            <Field label="Lead score" value={acq.leadScore === null ? null
              : `${acq.leadScore} of ${acq.leadScoreMax}`} />
            <Field
              label="Temperature"
              value={acq.temperature ? (
                <span className={`badge text-bg-${TEMPERATURE_TONE[acq.temperature] ?? 'secondary'}`}>
                  {acq.temperature}
                </span>
              ) : null}
            />
            <Field label="Temperature set" value={fmtDate(acq.temperatureUpdatedAt)} />
            <Field label="Qualification" value={acq.qualificationLevel} />
            <Field label="Interest level" value={acq.interestLevel} />
            <Field label="Maturity score" value={acq.maturityScore} />
            <Field label="Owner" value={acq.assignedAdmin} />
            <Field label="Last contacted" value={fmtDate(acq.lastContactedAt)} />
          </div>
        </SectionCard>
      </div>

      <div className="col-lg-6">
        <SectionCard title="How they found us">
          <div className="row">
            <Field label="Source" value={acq.source} />
            <Field label="Form" value={acq.formType} />
            <Field label="UTM source" value={acq.utmSource} />
            <Field label="UTM campaign" value={acq.utmCampaign} />
            <Field label="Interest area" value={acq.interestArea} />
            <Field label="First seen" value={fmtDate(acq.firstSeen)} />
            <Field label="Landing page" wide value={acq.pageUrl} />
          </div>
        </SectionCard>
      </div>

      {/* Website activity, from the same endpoint the Lead page reads. */}
      {visitor && (
        <div className="col-12">
          <SectionCard
            title="Website activity"
            actions={visitor.intent_score !== undefined && !intentSuppressedReason ? (
              <span className="badge text-bg-danger">
                Intent {visitor.intent_score}/100{visitor.intent_level ? ` (${visitor.intent_level})` : ''}
              </span>
            ) : undefined}
          >
            <div className="row">
              <Field label="Total sessions" value={visitor.total_sessions ?? null} />
              <Field label="Total pageviews" value={visitor.total_pageviews ?? null} />
              <Field label="First seen" value={fmtDateTime(visitor.first_seen_at)} />
              <Field label="Last seen" value={fmtDateTime(visitor.last_seen_at)} />
              <Field label="Device" value={visitor.device_type} />
            </div>

            {Array.isArray(visitor.behavioral_signals) && visitor.behavioral_signals.length > 0 && (
              <>
                <div className="text-muted small fw-medium mb-2">Behavioural signals</div>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  {visitor.behavioral_signals.map((sig, i) => (
                    <span key={i} className="badge text-bg-light">
                      {typeof sig === 'string' ? sig : (sig.signal_type ?? 'signal')}
                    </span>
                  ))}
                </div>
              </>
            )}

            {Array.isArray(visitor.sessions) && visitor.sessions.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm mb-0 align-middle">
                  <thead className="table-light">
                    <tr><th>Date</th><th>Duration</th><th>Pages</th><th>Entry</th><th>Exit</th></tr>
                  </thead>
                  <tbody>
                    {visitor.sessions.map((sess, i) => (
                      <tr key={i}>
                        <td className="text-nowrap small">{fmtDateTime(sess.started_at) || <Unknown />}</td>
                        <td className="small">{sess.duration_seconds
                          ? `${Math.round(sess.duration_seconds / 60)}m` : <Unknown />}</td>
                        <td className="small">{sess.pageview_count ?? <Unknown />}</td>
                        <td className="small text-truncate" style={{ maxWidth: 220 }}>
                          {sess.entry_page || <Unknown />}</td>
                        <td className="small text-truncate" style={{ maxWidth: 220 }}>
                          {sess.exit_page || <Unknown />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {visitor.id && (
              <Link className="small" to={`/admin/visitors/${visitor.id}`}>View full visitor profile →</Link>
            )}
          </SectionCard>
        </div>
      )}

      {/* Temperature history — hidden for enrolled people, same rule as
          the score itself: it is a record of conversion likelihood. */}
      {tempHistory && tempHistory.length > 0 && !intentSuppressedReason && (
        <div className="col-lg-6">
          <SectionCard title="Temperature history" padded={false}>
            <div className="table-responsive" style={{ maxHeight: '18rem', overflowY: 'auto' }}>
              <table className="table table-sm mb-0 align-middle">
                <tbody>
                  {tempHistory.map((h, i) => (
                    <tr key={i}>
                      <td>
                        <span className={`badge text-bg-${TEMPERATURE_TONE[h.from_temperature ?? ''] ?? 'light'}`}>
                          {h.from_temperature ?? '—'}
                        </span>
                        <span className="mx-2 text-muted">→</span>
                        <span className={`badge text-bg-${TEMPERATURE_TONE[h.to_temperature ?? ''] ?? 'light'}`}>
                          {h.to_temperature ?? '—'}
                        </span>
                        {h.lead_score !== undefined && h.lead_score !== null && (
                          <div className="text-muted small mt-1">Score: {h.lead_score}</div>
                        )}
                      </td>
                      <td className="text-end text-muted small">{h.changed_by || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      <div className="col-lg-6">
        <SectionCard title="What they told us">
          <div className="row">
            <Field label="Message" wide value={acq.message} />
            <Field label="Notes" wide value={acq.notes} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
