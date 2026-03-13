import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import alumniApi from '../../utils/alumniApi';
import { useAlumniAuth } from '../../contexts/AlumniAuthContext';
import AddReferralModal from '../../components/referrals/AddReferralModal';
import ReferralTimeline from '../../components/referrals/ReferralTimeline';

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

function ReferralDashboardPage() {
  const { profile, logout } = useAlumniAuth();
  const navigate = useNavigate();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [earnings, setEarnings] = useState<Earnings>({ total_earned: 0, total_pending: 0, total_paid: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
                          </tr>
                          {expandedId === r.id && (
                            <tr>
                              <td colSpan={6} className="p-0 border-0">
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
              desc: 'We reach out to your contact mentioning your name and Colaberry experience.',
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
    </div>
  );
}

export default ReferralDashboardPage;
