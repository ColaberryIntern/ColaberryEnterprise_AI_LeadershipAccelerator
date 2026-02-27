import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';

interface DashboardStats {
  totalRevenue: number;
  totalEnrollments: number;
  paidEnrollments: number;
  pendingInvoice: number;
  seatsRemaining: number;
  upcomingCohorts: number;
}

interface CohortSummary {
  id: string;
  name: string;
  start_date: string;
  max_seats: number;
  seats_taken: number;
  status: string;
  created_at: string;
}

function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/cohorts'),
    ])
      .then(([statsRes, cohortsRes]) => {
        setStats(statsRes.data.stats);
        setCohorts(cohortsRes.data.cohorts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-success',
      closed: 'bg-danger',
      completed: 'bg-secondary',
    };
    return (
      <span className={`badge rounded-pill ${colors[status] || 'bg-secondary'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <>
        <div className="row g-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="col-sm-6 col-lg-3">
              <div className="card admin-kpi-card">
                <div className="card-body p-3 d-flex align-items-center">
                  <div className="skeleton me-3" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                  <div className="flex-grow-1">
                    <div className="skeleton mb-2" style={{ width: '60%', height: '12px' }} />
                    <div className="skeleton" style={{ width: '40%', height: '20px' }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        Dashboard
      </h1>

      {/* Stats Cards */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card admin-kpi-card">
              <div className="card-body p-3 d-flex align-items-center" style={{ borderLeft: '4px solid #38a169', background: 'linear-gradient(135deg, rgba(56,161,105,0.04) 0%, transparent 100%)' }}>
                <div className="admin-kpi-icon me-3" style={{ background: 'rgba(56,161,105,0.12)' }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="#38a169"><path d="M4 10.781c.148 1.667 1.513 2.85 3.591 3.003V15h1.043v-1.216c2.27-.179 3.678-1.438 3.678-3.3 0-1.59-.947-2.51-2.956-3.028l-.722-.187V3.467c1.122.11 1.879.714 2.07 1.616h1.47c-.166-1.6-1.54-2.748-3.54-2.875V1H7.591v1.233c-1.939.23-3.27 1.472-3.27 3.156 0 1.454.966 2.483 2.661 2.917l.61.162v4.031c-1.149-.17-1.94-.8-2.131-1.718H4zm3.391-3.836c-1.043-.263-1.6-.825-1.6-1.616 0-.944.704-1.641 1.8-1.828v3.495l-.2-.05zm1.591 1.872c1.287.323 1.852.859 1.852 1.769 0 1.097-.826 1.828-2.2 1.939V8.73l.348.086z" /></svg>
                </div>
                <div>
                  <div className="text-muted small">Total Revenue</div>
                  <div className="h4 fw-bold mb-0" style={{ color: '#38a169' }}>{formatCurrency(stats.totalRevenue)}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card admin-kpi-card">
              <div className="card-body p-3 d-flex align-items-center" style={{ borderLeft: '4px solid #3182ce', background: 'linear-gradient(135deg, rgba(49,130,206,0.04) 0%, transparent 100%)' }}>
                <div className="admin-kpi-icon me-3" style={{ background: 'rgba(49,130,206,0.12)' }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="#3182ce"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 0 1 7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 0 1-.014.002H7.022zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM6.936 9.28a5.88 5.88 0 0 0-1.23-.247A7.35 7.35 0 0 0 5 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 0 1 5 13c0-.779.357-1.85 1.084-2.79.243-.314.52-.6.834-.86zM4.92 10A5.493 5.493 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></svg>
                </div>
                <div>
                  <div className="text-muted small">Total Enrollments</div>
                  <div className="h4 fw-bold mb-0" style={{ color: '#3182ce' }}>{stats.totalEnrollments}</div>
                  {stats.pendingInvoice > 0 && (
                    <div className="small text-warning">{stats.pendingInvoice} pending</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card admin-kpi-card">
              <div className="card-body p-3 d-flex align-items-center" style={{ borderLeft: '4px solid #805ad5', background: 'linear-gradient(135deg, rgba(128,90,213,0.04) 0%, transparent 100%)' }}>
                <div className="admin-kpi-icon me-3" style={{ background: 'rgba(128,90,213,0.12)' }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="#805ad5"><path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z" /><path d="M9.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 1 0v-7a.5.5 0 0 0-.5-.5zm-2 2a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5zm4-1a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.5-.5z" /></svg>
                </div>
                <div>
                  <div className="text-muted small">Seats Remaining</div>
                  <div className="h4 fw-bold mb-0" style={{ color: '#805ad5' }}>{stats.seatsRemaining}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card admin-kpi-card">
              <div className="card-body p-3 d-flex align-items-center" style={{ borderLeft: '4px solid #dd6b20', background: 'linear-gradient(135deg, rgba(221,107,32,0.04) 0%, transparent 100%)' }}>
                <div className="admin-kpi-icon me-3" style={{ background: 'rgba(221,107,32,0.12)' }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="#dd6b20"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 2a1 1 0 0 0-1 1v1h14V3a1 1 0 0 0-1-1H2zm13 3H1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5z" /></svg>
                </div>
                <div>
                  <div className="text-muted small">Upcoming Cohorts</div>
                  <div className="h4 fw-bold mb-0" style={{ color: '#dd6b20' }}>{stats.upcomingCohorts}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cohort Table */}
      <div className="card admin-table-card">
        <div className="card-header fw-bold fs-5 py-3">
          Cohorts
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover table-striped mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Start Date</th>
                  <th>Enrolled</th>
                  <th>Revenue</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cohorts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      No cohorts yet
                    </td>
                  </tr>
                ) : (
                  cohorts.map((cohort) => (
                    <tr key={cohort.id}>
                      <td className="fw-medium">{cohort.name}</td>
                      <td>{formatDate(cohort.start_date)}</td>
                      <td>
                        {cohort.seats_taken} / {cohort.max_seats}
                      </td>
                      <td>{formatCurrency(cohort.seats_taken * 4500)}</td>
                      <td>{statusBadge(cohort.status)}</td>
                      <td>
                        <Link
                          to={`/admin/cohorts/${cohort.id}`}
                          className="btn btn-outline-primary btn-sm"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminDashboardPage;
