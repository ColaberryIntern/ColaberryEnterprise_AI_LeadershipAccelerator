import React from 'react';
import { SectionCard, StatCard } from './shell';
import { OutcomeMeasurementsSummary } from '../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (spec 20.4). Pure/presentational, same
// convention as GovernanceShadowPanel.tsx. Every done ticket gets a scheduled 7-day
// recurrence-check follow-up; this panel is the read-only summary of where those
// checks stand.

interface Props {
  summary: OutcomeMeasurementsSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function OutcomeMeasurementsPanel({ summary, loading, error, onRefresh }: Props) {
  return (
    <SectionCard padded={false} className="mt-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Outcome follow-up (7-day recurrence checks)</span>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger mx-3 my-3">{error}</div>
      ) : !summary || (summary.scheduled === 0 && summary.observed === 0) ? (
        <div className="text-muted text-center py-4 px-3">
          No tickets have reached "done" yet — nothing scheduled.
        </div>
      ) : (
        <div className="row g-3 px-3 pb-3">
          <div className="col-6 col-lg-2">
            <StatCard label="Scheduled" value={summary.scheduled} icon="time-line" tone="neutral" />
          </div>
          <div className="col-6 col-lg-2">
            <StatCard label="Observed" value={summary.observed} icon="checkbox-circle-line" tone="neutral" />
          </div>
          <div className="col-6 col-lg-2">
            <StatCard label="Stable" value={summary.stable} icon="shield-check-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Recurrence detected"
              value={summary.recurrence_detected}
              icon="error-warning-line"
              tone={summary.recurrence_detected > 0 ? 'warning' : 'neutral'}
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Insufficient data" value={summary.insufficient_data} icon="question-line" tone="neutral" />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
