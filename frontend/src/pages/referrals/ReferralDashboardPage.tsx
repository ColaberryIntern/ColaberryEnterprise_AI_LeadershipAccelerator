import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import alumniApi from '../../utils/alumniApi';
import { useAlumniAuth } from '../../contexts/AlumniAuthContext';
import AddReferralModal from '../../components/referrals/AddReferralModal';
import ReferralTimeline from '../../components/referrals/ReferralTimeline';
import MayaChatWidget from '../../components/MayaChatWidget';

interface Referral {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  job_title: string;
  referral_type: string;
  status: string;
  campaign_status: string | null;
  touchpoint_count: number;
  last_activity_at: string | null;
  created_at: string;
  commission: { commission_amount: number; payment_status: string } | null;
  activityEvents: Array<{ event_type: string; event_timestamp: string }>;
}

interface Earnings {
  total_earned: number;
  total_pending: number;
  total_paid: number;
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted', color: 'secondary' },
  lead_created: { label: 'Lead Added', color: 'info' },
  campaign_assigned: { label: 'Campaign Active', color: 'primary' },
  in_progress: { label: 'In Progress', color: 'primary' },
  meeting_scheduled: { label: 'Meeting Scheduled', color: 'warning' },
  enrolled: { label: 'Deal Closed', color: 'success' },
  closed_lost: { label: 'Closed', color: 'danger' },
};

const TYPE_LABELS: Record<string, string> = {
  corporate_sponsor: 'Corporate Sponsor',
  introduced: 'Introduced',
  anonymous: 'Anonymous',
};

function generateSponsorKit(referral: Referral, alumniName: string) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Enterprise AI Leadership Accelerator</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#2d3748;padding:48px;max-width:800px;margin:0 auto}
.header{text-align:center;border-bottom:3px solid #1a365d;padding-bottom:24px;margin-bottom:32px}
.header h1{color:#1a365d;font-size:24px;margin-bottom:4px}
.header .sub{color:#718096;font-size:14px}
.intro{background:#f7fafc;border-left:4px solid #1a365d;padding:16px 20px;margin-bottom:28px;font-size:14px;line-height:1.6}
.intro strong{color:#1a365d}
h2{color:#1a365d;font-size:16px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px}
.section{margin-bottom:28px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
.card{background:#f7fafc;border-radius:8px;padding:16px}
.card h3{color:#1a365d;font-size:14px;margin-bottom:6px}
.card p{font-size:13px;color:#4a5568;line-height:1.5;margin:0}
.outcomes li{font-size:13px;line-height:1.8;color:#4a5568}
.outcomes li strong{color:#2d3748}
.highlight{background:#1a365d;color:#fff;border-radius:8px;padding:20px;text-align:center;margin:28px 0}
.highlight .price{font-size:28px;font-weight:700}
.highlight .compare{font-size:13px;color:#a0aec0;margin-top:4px}
.cta{text-align:center;margin-top:32px;padding-top:24px;border-top:2px solid #e2e8f0}
.cta p{font-size:14px;color:#4a5568;margin-bottom:8px}
.cta .link{color:#1a365d;font-weight:600;font-size:16px}
.footer{text-align:center;margin-top:32px;font-size:12px;color:#a0aec0}
@media print{body{padding:32px}@page{margin:0.5in}}
</style></head><body>
<div class="header">
<h1>Enterprise AI Leadership Accelerator</h1>
<div class="sub">Colaberry Enterprise AI Division</div>
</div>

<div class="intro">
<strong>${alumniName}</strong>, a Colaberry graduate, thought this program would be valuable for
<strong>${referral.contact_name}</strong> at <strong>${referral.company_name}</strong>.
As someone who experienced Colaberry's approach to hands-on learning firsthand, they wanted to share this opportunity.
</div>

<div class="section">
<h2>Program Overview</h2>
<div class="grid">
<div class="card"><h3>Format</h3><p>5-day intensive program. Live, instructor-led sessions with hands-on labs and executive coaching.</p></div>
<div class="card"><h3>Who It's For</h3><p>Directors, VPs, CTOs, and senior leaders responsible for AI strategy and execution.</p></div>
<div class="card"><h3>Cohort Size</h3><p>Limited to 15 participants per cohort for personalized attention and peer-level discussion.</p></div>
<div class="card"><h3>Deliverables</h3><p>Working AI proof of concept, executive presentation deck, and a 90-day implementation roadmap.</p></div>
</div>
</div>

<div class="section">
<h2>What Graduates Have Achieved</h2>
<ul class="outcomes">
<li><strong>VP of Engineering, Fortune 500:</strong> Built AI document analysis system saving 70% processing time</li>
<li><strong>Director of Data Science:</strong> Created AI readiness dashboard that secured $2M budget approval</li>
<li><strong>CTO, Mid-Market SaaS:</strong> Deployed churn prediction model with 89% accuracy within 30 days</li>
<li><strong>Head of Operations:</strong> Automated supply chain forecasting, reducing inventory costs by 35%</li>
</ul>
</div>

<div class="highlight">
<div class="price">$4,500</div>
<div class="compare">vs. $50K–$150K for comparable consulting engagements</div>
</div>

<div class="section">
<h2>Why This Program Is Different</h2>
<div class="grid">
<div class="card"><h3>Build, Don't Just Learn</h3><p>Leave with a working proof of concept — not just slides and theory.</p></div>
<div class="card"><h3>Executive-Level Peers</h3><p>Learn alongside other senior leaders facing the same AI adoption challenges.</p></div>
</div>
</div>

<div class="cta">
<p>Schedule a 15-minute strategy call to explore if this is the right fit.</p>
<div class="link">enterprise.colaberry.ai</div>
</div>

<div class="footer">Colaberry Enterprise AI Division &bull; enterprise.colaberry.ai</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AI-Leadership-Accelerator_${referral.company_name.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ReferralDashboardPage() {
  const { profile, logout } = useAlumniAuth();
  const navigate = useNavigate();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [earnings, setEarnings] = useState<Earnings>({ total_earned: 0, total_pending: 0, total_paid: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState(profile?.alumni_phone || '');
  const [profileCohort, setProfileCohort] = useState(profile?.alumni_cohort || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDismissed, setProfileDismissed] = useState(false);

  const profileIncomplete = !profileDismissed && (!profile?.alumni_phone || !profile?.alumni_cohort);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await alumniApi.patch('/api/referrals/profile', {
        alumni_phone: profilePhone.trim() || undefined,
        alumni_cohort: profileCohort.trim() || undefined,
      });
      setProfileDismissed(true);
    } catch {}
    setProfileSaving(false);
  };

  const fetchData = useCallback(async () => {
    try {
      const [refRes, earnRes] = await Promise.allSettled([
        alumniApi.get('/api/referrals/list'),
        alumniApi.get('/api/referrals/earnings'),
      ]);
      if (refRes.status === 'fulfilled') setReferrals(refRes.value.data);
      if (earnRes.status === 'fulfilled') {
        setEarnings({
          total_earned: earnRes.value.data.total_earned,
          total_pending: earnRes.value.data.total_pending,
          total_paid: earnRes.value.data.total_paid,
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = () => {
    logout();
    navigate('/referrals/login', { replace: true });
  };

  return (
    <div style={{ backgroundColor: '#f7fafc', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav className="navbar" style={{ backgroundColor: 'var(--color-primary)', padding: '0.75rem 1.5rem' }}>
        <div className="container-fluid">
          <span className="navbar-brand text-white fw-bold mb-0">AI Champion Network</span>
          <div className="d-flex align-items-center gap-3">
            <span className="text-white small">{profile?.alumni_name || profile?.alumni_email}</span>
            <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </nav>

      <div className="container py-4" style={{ maxWidth: 1000 }}>
        {/* Profile Completion Banner */}
        {profileIncomplete && (
          <div className="alert alert-info d-flex align-items-start gap-3 mb-4" role="alert">
            <div className="flex-grow-1">
              <strong className="d-block mb-2">Complete your profile</strong>
              <div className="row g-2">
                <div className="col-sm-5">
                  <input
                    type="tel"
                    className="form-control form-control-sm"
                    placeholder="Phone number"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                  />
                </div>
                <div className="col-sm-5">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Program graduated from (e.g. Data Analytics 2024)"
                    value={profileCohort}
                    onChange={(e) => setProfileCohort(e.target.value)}
                  />
                </div>
                <div className="col-sm-2">
                  <button
                    className="btn btn-sm btn-primary w-100"
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Dismiss"
              onClick={() => setProfileDismissed(true)}
            />
          </div>
        )}

        {/* Earnings Summary */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Earned', value: earnings.total_earned, color: 'var(--color-primary)' },
            { label: 'Pending', value: earnings.total_pending, color: '#d69e2e' },
            { label: 'Paid', value: earnings.total_paid, color: 'var(--color-accent)' },
          ].map((stat) => (
            <div key={stat.label} className="col-md-4">
              <div className="card border-0 shadow-sm">
                <div className="card-body text-center py-3">
                  <div className="small text-muted mb-1">{stat.label}</div>
                  <div className="fs-4 fw-bold" style={{ color: stat.color }}>
                    ${stat.value.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Referrals Section */}
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>My Referrals</h6>
            <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>
              + Add Referral
            </button>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Loading referrals...</span>
                </div>
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-5">
                <p className="text-muted mb-2">No referrals yet. Start earning $250 per referral!</p>
                <button className="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>
                  Add Your First Referral
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Company</th>
                      <th className="small fw-medium">Contact</th>
                      <th className="small fw-medium">Type</th>
                      <th className="small fw-medium">Status</th>
                      <th className="small fw-medium">Last Activity</th>
                      <th className="small fw-medium">Commission</th>
                      <th className="small fw-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => {
                      const statusConfig = STATUS_BADGES[r.status] || { label: r.status, color: 'secondary' };
                      const commissionStatus = r.commission
                        ? `$${Number(r.commission.commission_amount).toFixed(0)} (${r.commission.payment_status})`
                        : '—';

                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="small">{r.company_name}</td>
                            <td className="small">
                              <div>{r.contact_name}</div>
                              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.contact_email}</div>
                            </td>
                            <td>
                              <span className="badge bg-info bg-opacity-10 text-info small">
                                {TYPE_LABELS[r.referral_type] || r.referral_type}
                              </span>
                            </td>
                            <td>
                              <span className={`badge bg-${statusConfig.color}`}>{statusConfig.label}</span>
                            </td>
                            <td className="small text-muted">
                              {r.last_activity_at
                                ? new Date(r.last_activity_at).toLocaleDateString()
                                : r.activityEvents?.[0]?.event_timestamp
                                  ? new Date(r.activityEvents[0].event_timestamp).toLocaleDateString()
                                  : '—'}
                            </td>
                            <td className="small">{commissionStatus}</td>
                            <td>
                              {(r.referral_type === 'introduced' || r.referral_type === 'corporate_sponsor') && (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    generateSponsorKit(r, profile?.alumni_name || 'A Colaberry Graduate');
                                  }}
                                >
                                  Download Kit
                                </button>
                              )}
                            </td>
                          </tr>
                          {expandedId === r.id && (
                            <tr>
                              <td colSpan={7} className="p-0 border-0">
                                <ReferralTimeline
                                  referralId={r.id}
                                  onClose={() => setExpandedId(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Three Referral Paths Info */}
        <div className="row g-3 mt-4">
          {[
            {
              title: 'Corporate Sponsor',
              desc: 'Introduce the program to your company leadership. Download a sponsor kit after adding your referral contact.',
              type: 'corporate_sponsor',
            },
            {
              title: 'Introduced Referral',
              desc: 'We reach out to your contact mentioning your name and Colaberry experience. Download a presentation kit to share with them directly.',
              type: 'introduced',
            },
            {
              title: 'Anonymous Referral',
              desc: 'Submit a company lead anonymously. They enter our standard corporate outreach.',
              type: 'anonymous',
            },
          ].map((path) => (
            <div key={path.type} className="col-md-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  <h6 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>{path.title}</h6>
                  <p className="small text-muted mb-0">{path.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddReferralModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchData}
      />
      <MayaChatWidget />
    </div>
  );
}

export default ReferralDashboardPage;
