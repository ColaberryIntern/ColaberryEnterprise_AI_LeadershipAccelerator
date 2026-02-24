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
      <span className={`badge ${colors[status] || 'bg-secondary'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        Dashboard
      </h1>

      {/* Stats Cards */}
      {stats && (
        <div className="row g-4 mb-5">
          <div className="col-md-3">
            <div className="card border-0 shadow-sm p-4 text-center">
              <div className="text-muted small mb-1">Total Revenue</div>
              <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>
                {formatCurrency(stats.totalRevenue)}
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm p-4 text-center">
              <div className="text-muted small mb-1">Total Enrollments</div>
              <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                {stats.totalEnrollments}
              </div>
              {stats.pendingInvoice > 0 && (
                <div className="small text-warning mt-1">
                  {stats.pendingInvoice} pending invoice
                </div>
              )}
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm p-4 text-center">
              <div className="text-muted small mb-1">Seats Remaining</div>
              <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                {stats.seatsRemaining}
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm p-4 text-center">
              <div className="text-muted small mb-1">Upcoming Cohorts</div>
              <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                {stats.upcomingCohorts}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cohort Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold fs-5 py-3">
          Cohorts
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
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
