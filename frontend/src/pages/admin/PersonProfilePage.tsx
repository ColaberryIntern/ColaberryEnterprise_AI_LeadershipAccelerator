import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';

/**
 * One person, everything we can honestly say about them.
 *
 * The panels this page renders are the panels the API SENT. It does not hide
 * anything — a panel the caller may not see was never fetched and is not in the
 * payload. So this component cannot widen access, and the "withheld" note below
 * is a statement about permissions rather than a filter.
 */

interface AcquisitionPanel {
  source: string | null;
  formType: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  pipelineStage: string | null;
  leadScore: number | null;
  firstSeen: string | null;
}

interface LearningRow {
  enrollmentId: string;
  cohortId: string | null;
  status: string | null;
  tier: string | null;
  enrollmentType: string | null;
  enrolledAt: string | null;
}

interface BillingRow {
  enrollmentId: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  amountPaid: number | null;
}

interface Profile {
  email: string;
  name: string | null;
  stage: string;
  tracedToLead: boolean;
  company: string | null;
  title: string | null;
  acquisition?: AcquisitionPanel | null;
  learning?: LearningRow[];
  billing?: BillingRow[];
  engagement?: { sessions: number; firstSeen: string | null; lastSeen: string | null; sites: string[] } | null;
  withheldPanels: string[];
}

const STAGE_LABEL: Record<string, string> = {
  anonymous_visitor: 'Anonymous visitor',
  identified_visitor: 'Identified visitor',
  lead: 'Lead',
  applicant: 'Applicant',
  enrolled_student: 'Enrolled',
  active_learner: 'Active learner',
  graduate: 'Graduate',
  returning_customer: 'Returning customer',
};

/** A value we do not have. Never rendered as an empty cell or a zero. */
const Unknown = () => <span className="text-muted">Not recorded</span>;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="col-6 col-md-4 mb-3">
      <div className="text-muted small text-uppercase" style={{ letterSpacing: '.04em' }}>{label}</div>
      <div>{empty ? <Unknown /> : value}</div>
    </div>
  );
}

export default function PersonProfilePage() {
  const { email: rawEmail } = useParams<{ email: string }>();
  const email = rawEmail ? decodeURIComponent(rawEmail) : '';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/people/profile?email=${encodeURIComponent(email)}`);
      setProfile(res.data);
    } catch (err) {
      setProfile(null);
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 404
          ? 'No such person, or not visible to your role.'
          : status === 403
            ? 'Your role does not include access to person records.'
            : 'Could not load this profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title={profile?.name || email}
        subtitle={profile ? `${STAGE_LABEL[profile.stage] ?? profile.stage} · ${profile.email}` : email}
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'People', to: '/admin/people' }, { label: 'Profile' }]}
      />

      {loading && !profile && <div className="text-muted py-5 text-center">Loading…</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {profile && (
        <>
          {/* Stated plainly. Somebody who cannot see the billing panel should
              know it exists and that they lack access, rather than concluding
              this person has no billing history. */}
          {profile.withheldPanels.length > 0 && (
            <div className="alert alert-secondary py-2 px-3 small">
              Your role does not include: {profile.withheldPanels.join(', ')}. Those sections
              are not shown here and were not loaded.
            </div>
          )}

          <SectionCard title="Identity">
            <div className="row">
              <Field label="Name" value={profile.name} />
              <Field label="Email" value={profile.email} />
              <Field label="Stage" value={STAGE_LABEL[profile.stage] ?? profile.stage} />
              <Field label="Company" value={profile.company} />
              <Field label="Title" value={profile.title} />
              <Field
                label="Acquisition"
                value={
                  profile.tracedToLead
                    ? 'Traced to a lead'
                    : // The 86. Said on the profile, because it changes how you
                      // read everything else about where this person came from.
                      <span className="text-warning">No acquisition record</span>
                }
              />
            </div>
          </SectionCard>

          {profile.acquisition !== undefined && (
            <SectionCard title="How they found us">
              {profile.acquisition ? (
                <div className="row">
                  <Field label="Source" value={profile.acquisition.source} />
                  <Field label="Form" value={profile.acquisition.formType} />
                  <Field label="UTM source" value={profile.acquisition.utmSource} />
                  <Field label="UTM campaign" value={profile.acquisition.utmCampaign} />
                  <Field label="Pipeline stage" value={profile.acquisition.pipelineStage} />
                  <Field
                    label="First seen"
                    value={profile.acquisition.firstSeen
                      ? new Date(profile.acquisition.firstSeen).toLocaleDateString()
                      : null}
                  />
                </div>
              ) : (
                <p className="text-muted mb-0 small">
                  No lead record for this person, so there is nothing recorded about how they
                  arrived.
                </p>
              )}
            </SectionCard>
          )}

          {profile.learning !== undefined && (
            <SectionCard title="Programme">
              {profile.learning.length === 0 ? (
                <p className="text-muted mb-0 small">No enrolments visible to you.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr><th>Status</th><th>Tier</th><th>Type</th><th>Enrolled</th></tr>
                    </thead>
                    <tbody>
                      {profile.learning.map((e) => (
                        <tr key={e.enrollmentId}>
                          <td>
                            <span className={`badge text-bg-${e.status === 'active' ? 'success' : 'secondary'}`}>
                              {e.status || 'unknown'}
                            </span>
                          </td>
                          <td>{e.tier || <Unknown />}</td>
                          <td>{e.enrollmentType || <Unknown />}</td>
                          <td>{e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : <Unknown />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {profile.billing !== undefined && (
            <SectionCard title="Billing">
              {profile.billing.length === 0 ? (
                <p className="text-muted mb-0 small">No enrolment records, so nothing to bill.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr><th>Payment status</th><th>Method</th><th>Amount paid</th></tr>
                    </thead>
                    <tbody>
                      {profile.billing.map((b) => (
                        <tr key={b.enrollmentId}>
                          <td>{b.paymentStatus || <Unknown />}</td>
                          <td>{b.paymentMethod || <Unknown />}</td>
                          {/* Not £0. An unrecorded amount and a zero payment are
                              different facts. */}
                          <td>{b.amountPaid === null || b.amountPaid === undefined
                            ? <Unknown />
                            : `$${Number(b.amountPaid).toLocaleString()}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {profile.engagement !== undefined && profile.engagement && (
            <SectionCard title="Site activity">
              <div className="row">
                <Field label="Sessions" value={profile.engagement.sessions || <Unknown />} />
                <Field
                  label="First visit"
                  value={profile.engagement.firstSeen
                    ? new Date(profile.engagement.firstSeen).toLocaleDateString() : null}
                />
                <Field
                  label="Last visit"
                  value={profile.engagement.lastSeen
                    ? new Date(profile.engagement.lastSeen).toLocaleDateString() : null}
                />
                <Field label="Properties" value={profile.engagement.sites.join(', ')} />
              </div>
            </SectionCard>
          )}

          <Link to="/admin/people" className="btn btn-sm btn-outline-secondary mt-2">
            Back to People
          </Link>
        </>
      )}
    </div>
  );
}
