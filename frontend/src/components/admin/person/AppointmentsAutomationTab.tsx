import React from 'react';
import { AppointmentRow, AutomationRow } from '../../../adminOs/personTypes';
import SectionCard from '../shell/SectionCard';
import { Unknown, fmtDateTime } from './primitives';

/**
 * What has been booked with this person, and what the system did to them.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * Both halves say "nothing yet" rather than rendering an empty table, because
 * an empty table with headers reads as a load failure.
 */
export default function AppointmentsAutomationTab({ appointments, automation }: {
  appointments: AppointmentRow[] | undefined;
  automation: AutomationRow[] | undefined;
}) {
  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <SectionCard title="Appointments" padded={false}>
          {(appointments?.length ?? 0) === 0 ? (
            <p className="text-muted small p-4 mb-0 text-center">Nothing booked.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0 align-middle">
                <thead className="table-light">
                  <tr><th>When</th><th>What</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {appointments!.map((a, i) => (
                    <tr key={`${a.kind}-${i}`}>
                      <td className="text-nowrap small">{fmtDateTime(a.scheduledAt) || <Unknown />}</td>
                      <td>
                        <div className="fw-medium">{a.title || a.kind}</div>
                        {a.notes && <div className="text-muted small">{a.notes}</div>}
                        {a.meetLink && (
                          <a className="small" href={a.meetLink} target="_blank" rel="noreferrer">Meet link</a>
                        )}
                      </td>
                      <td><span className="badge text-bg-light">{a.status || 'unknown'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
      <div className="col-lg-6">
        <SectionCard title="Automation history" padded={false}>
          {(automation?.length ?? 0) === 0 ? (
            <p className="text-muted small p-4 mb-0 text-center">No automation events yet.</p>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
              <table className="table table-sm mb-0 align-middle">
                <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                  <tr><th>When</th><th>Type</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {automation!.map((a, i) => (
                    <tr key={`${a.type}-${i}`}>
                      <td className="text-nowrap small text-muted">{fmtDateTime(a.createdAt)}</td>
                      <td>
                        <div className="fw-medium">{a.type}</div>
                        {a.detail && <div className="text-muted small">{a.detail}</div>}
                      </td>
                      <td><span className="badge text-bg-light">{a.status || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
