import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

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

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'success',
  pending_invoice: 'warning',
  failed: 'danger',
};

const PAYMENT_LABEL: Record<string, string> = {
  paid: 'Paid',
  pending_invoice: 'Pending Invoice',
  failed: 'Failed',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  open: 'success',
  closed: 'danger',
  completed: 'neutral',
};

function AdminCohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [cohort, setCohort] = useState<CohortDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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

  // Per-page trust signal (Basecamp todo 10027085963) derived from the cohort record.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'cohort',
    updatedAt: new Date().toISOString(),
    summary: cohort
      ? `${cohort.seats_taken}/${cohort.max_seats} seats filled · status ${cohort.status}.`
      : 'Live cohort enrollment and roster.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Enrollment',
        status: 'live',
        evidence: [
          { label: 'Seats filled', value: cohort ? `${cohort.seats_taken}/${cohort.max_seats}` : '—' },
        ],
      },
    ],
  }), [cohort]);

  const handleCloseEnrollment = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/api/admin/cohorts/${id}`, { status: 'closed' });
      showToast('Enrollment closed successfully.', 'success');
      fetchCohort();
    } catch (err) {
      showToast('Failed to close enrollment. Please try again.', 'error');
    } finally {
      setActionLoading(false);
      setShowCloseConfirm(false);
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
      showToast('Failed to export CSV. Please try again.', 'error');
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
      <PageHeader
        title={cohort.name || 'Cohort Detail'}
        icon="group-line"
        subtitle={`${cohort.core_day} at ${cohort.core_time}${cohort.optional_lab_day ? ` · Optional lab: ${cohort.optional_lab_day}` : ''}`}
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Accelerator', to: '/admin/accelerator' },
          { label: 'Cohort' },
        ]}
        trust={trust}
        actions={
          <>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={handleExportCSV}
              disabled={participants.length === 0}
            >
              <i className="ri-download-line" aria-hidden="true" /> Export CSV
            </button>
            {cohort.status === 'open' && (
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => setShowCloseConfirm(true)}
                disabled={actionLoading}
              >
                <i className="ri-lock-line" aria-hidden="true" />{' '}
                {actionLoading ? 'Closing...' : 'Close Enrollment'}
              </button>
            )}
          </>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Start Date" value={formatDate(cohort.start_date)} icon="calendar-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Enrolled"
              value={`${cohort.seats_taken} / ${cohort.max_seats}`}
              icon="group-line"
              tone="primary"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Seats Remaining"
              value={Math.max(0, cohort.max_seats - cohort.seats_taken)}
              icon="user-add-line"
              tone="success"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Status"
              value={<StatusBadge label={cohort.status} tone={STATUS_TONE[cohort.status] || 'neutral'} />}
              icon="checkbox-circle-line"
              tone="neutral"
            />
          </div>
        </div>
      </PageHeader>

      {/* Participants Table */}
      <SectionCard
        title={`Participants (${participants.length})`}
        icon="team-line"
        padded={false}
      >
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
                    <td>
                      <StatusBadge
                        label={PAYMENT_LABEL[p.payment_status] || p.payment_status}
                        tone={PAYMENT_TONE[p.payment_status] || 'neutral'}
                      />
                    </td>
                    <td className="text-muted small">
                      <i
                        className={`ri-${p.payment_method === 'credit_card' ? 'bank-card-line' : 'building-line'}`}
                        aria-hidden="true"
                      />{' '}
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
      </SectionCard>

      <ConfirmModal
        show={showCloseConfirm}
        title="Close Enrollment"
        message="Are you sure you want to close enrollment for this cohort? No new participants will be able to enroll."
        confirmLabel="Close Enrollment"
        confirmVariant="danger"
        onConfirm={handleCloseEnrollment}
        onCancel={() => setShowCloseConfirm(false)}
        loading={actionLoading}
      />
    </>
  );
}

export default AdminCohortDetailPage;
