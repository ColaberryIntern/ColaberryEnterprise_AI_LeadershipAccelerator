import React from 'react';
import api from '../../utils/api';

interface AppointmentData {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  status: string;
  outcome_notes: string;
  lead?: { id: number; name: string; email: string; company: string };
}

interface AppointmentCardProps {
  appointment: AppointmentData;
  onUpdated: () => void;
  showLeadName?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  strategy_call: 'Strategy Call',
  demo: 'Demo',
  follow_up: 'Follow Up',
  enrollment_close: 'Enrollment Close',
};

const STATUS_BADGES: Record<string, string> = {
  scheduled: 'bg-primary',
  completed: 'bg-success',
  cancelled: 'bg-secondary',
  no_show: 'bg-danger',
};

function AppointmentCard({ appointment, onUpdated, showLeadName }: AppointmentCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/api/admin/appointments/${appointment.id}`, { status: newStatus });
      onUpdated();
    } catch (err) {
      console.error('Failed to update appointment:', err);
    }
  };

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start mb-1">
          <div>
            <span className="fw-medium small">{appointment.title}</span>
            {showLeadName && appointment.lead && (
              <span className="text-muted small ms-2">
                — {appointment.lead.name}
              </span>
            )}
          </div>
          <span className={`badge ${STATUS_BADGES[appointment.status] || 'bg-secondary'}`}>
            {appointment.status}
          </span>
        </div>

        <div className="d-flex gap-3 text-muted small mb-1">
          <span>{formatDate(appointment.scheduled_at)}</span>
          <span>{appointment.duration_minutes}min</span>
          <span className="badge bg-light text-dark">{TYPE_LABELS[appointment.type] || appointment.type}</span>
        </div>

        {appointment.description && (
          <div className="text-muted small mb-2">{appointment.description}</div>
        )}

        {appointment.status === 'scheduled' && (
          <div className="d-flex gap-2 mt-2">
            <button
              className="btn btn-success btn-sm"
              onClick={() => handleStatusChange('completed')}
              style={{ fontSize: '0.75rem' }}
            >
              Complete
            </button>
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => handleStatusChange('no_show')}
              style={{ fontSize: '0.75rem' }}
            >
              No Show
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => handleStatusChange('cancelled')}
              style={{ fontSize: '0.75rem' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AppointmentCard;
