import React from 'react';
import { SectionCard, StatusBadge } from '../../components/admin/shell';

/**
 * EnterpriseClientMeetingCard - what the client planned in their visit (intake v2, 2026-11-21):
 * the meeting with Ali (on his calendar), the AI interview time, the research files they shared,
 * and whether Ali's meeting brief has gone out. Its own file so the clients page stays small.
 */
export interface ClientPlan {
  interviewMode: 'now' | 'later' | null;
  interviewScheduledFor: string | null;
  meeting: { start: string; end: string | null; link: string | null } | null;
  files: Array<{ name: string; size: number; chars: number; uploadedAt: string }>;
  aliBriefSentAt: string | null;
}

const central = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', ...opts });
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function EnterpriseClientMeetingCard({ plan, interviewed }: { plan?: ClientPlan | null; interviewed: boolean }): React.ReactElement | null {
  if (!plan) return null;
  const m = plan.meeting;
  return (
    <SectionCard title="Meeting and plan" icon="calendar-event-line">
      <div data-testid="meeting-card">
        {m ? (
          <div className="mb-2">
            <div className="small text-muted text-uppercase">Meeting with Ali</div>
            <div className="fs-4 fw-bold">{central(m.start, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <div className="fw-semibold">{central(m.start, { hour: 'numeric', minute: '2-digit' })} Central, 30 minutes</div>
            {m.link ? (
              <a className="small" href={m.link} target="_blank" rel="noopener noreferrer">
                Google Meet link
              </a>
            ) : null}
          </div>
        ) : (
          <p className="small text-muted mb-2">No meeting booked yet.</p>
        )}
        <div className="small mb-2">
          <strong>AI interview:</strong>{' '}
          {interviewed ? (
            <StatusBadge label="Done" tone="success" />
          ) : plan.interviewMode === 'later' && plan.interviewScheduledFor ? (
            <>
              <StatusBadge label="Scheduled" tone="warning" /> {central(plan.interviewScheduledFor, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
            </>
          ) : (
            <StatusBadge label="Not done" tone="danger" />
          )}
        </div>
        <div className="small mb-2">
          <strong>Their research files:</strong>{' '}
          {plan.files.length ? (
            <ul className="mb-0">
              {plan.files.map((f, n) => (
                <li key={n}>
                  {f.name} <span className="text-muted">({size(f.size)}{f.chars ? '' : ', no text read'})</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">none</span>
          )}
        </div>
        <div className="small text-muted">
          Ali&apos;s meeting brief: {plan.aliBriefSentAt ? `sent ${central(plan.aliBriefSentAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT` : 'not sent yet (goes once research is done and a meeting is booked)'}
        </div>
      </div>
    </SectionCard>
  );
}

export default EnterpriseClientMeetingCard;
