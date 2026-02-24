import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';

interface CohortDetail {
  id: string;
  name: string;
  start_date: string;
  core_day: string;
  core_time: string;
  optional_lab_day: string | null;
  max_seats: number;
  seats_taken: number;
  status: string;
  enrollments: Participant[];
}

interface Participant {
  id: string;
  full_name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  company_size: string;
  payment_status: string;
  payment_method: string;
  created_at: string;
}

function AdminCohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cohort, setCohort] = useState<CohortDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCohort = () => {
    api
      .get(`/api/admin/cohorts/${id}`)
      .then((res) => setCohort(res.data.cohort))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCohort();
  }, [id]); // eslint-disable-line

  const handleCloseEnrollment = async () => {
    if (!window.confirm('Are you sure you want to close enrollment for this cohort?')) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/admin/cohorts/${id}`, { status: 'closed' });
      fetchCohort();
    } catch (err) {
      console.error(err);
      alert('Failed to close enrollment. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get(`/api/admin/cohorts/${id}/export`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `cohort-${id}-enrollments.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const paymentBadge = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-success',
      pending_invoice: 'bg-warning text-dark',
      failed: 'bg-danger',
    };
    const labels: Record<string, string> = {
      paid: 'Paid',
      pending_invoice: 'Pending Invoice',
      failed: 'Failed',
    };
    return (
      <span className={`badge ${colors[status] || 'bg-secondary'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-success',
      closed: 'bg-danger',
      completed: 'bg-secondary',
    };
    return (
      <span className={`badge ${colors[status] || 'bg-secondary'} fs-6`}>
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

  if (!cohort) {
    return (
      <div className="text-center py-5">
        <h2>Cohort not found</h2>
        <Link to="/admin/dashboard" className="btn btn-primary mt-3">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const participants = cohort.enrollments || [];

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-4">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/admin/dashboard">Dashboard</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {cohort.name}
          </li>
        </ol>
      </nav>

      {/* Cohort Header */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <h1 className="h3 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
                {cohort.name}
              </h1>
              <div className="d-flex gap-3 flex-wrap text-muted">
                <span>📅 {formatDate(cohort.start_date)}</span>
                <span>
                  👥 {cohort.seats_taken} / {cohort.max_seats} enrolled
                </span>
                <span>{statusBadge(cohort.status)}</span>
              </div>
              <div className="text-muted mt-2">
                <span>🕐 {cohort.core_day} at {cohort.core_time}</span>
                {cohort.optional_lab_day && (
                  <span className="ms-3">🔧 Optional lab: {cohort.optional_lab_day}</span>
                )}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={handleExportCSV}
                disabled={participants.length === 0}
              >
                📥 Export CSV
              </button>
              {cohort.status === 'open' && (
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleCloseEnrollment}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Closing...' : '🔒 Close Enrollment'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Participants Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold fs-5 py-3">
          Participants ({participants.length})
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Payment</th>
                  <th>Method</th>
                  <th>Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      No participants enrolled yet
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-medium">{p.full_name}</td>
                      <td>
                        <a href={`mailto:${p.email}`}>{p.email}</a>
                      </td>
                      <td>{p.company}</td>
                      <td className="text-muted">{p.title || '—'}</td>
                      <td>{paymentBadge(p.payment_status)}</td>
                      <td className="text-muted small">
                        {p.payment_method === 'credit_card' ? '💳' : '🏢'}{' '}
                        {p.payment_method === 'credit_card' ? 'Card' : 'Invoice'}
                      </td>
                      <td className="text-muted small">
                        {formatDateTime(p.created_at)}
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

export default AdminCohortDetailPage;
