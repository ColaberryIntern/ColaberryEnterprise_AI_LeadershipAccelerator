import React from 'react';
import { loadBookings, setInterviewType, type BookingLine } from './careerDeskApi';
import { DeskAnswerLine, DeskError, Pill, PrepLink, stateTone } from './DeskParts';
import { useDeskAction, useDeskData } from './useDesk';

/**
 * Bookings (kit F9): every interview across learners, in Central time (the server's labels), with its type, length and
 * interviewers, its state and its recording note. Staff can set the interview type (the learner's card shows it). The
 * Zoom-permission notice shows when the server reports the recording scope missing.
 */
export const TYPES: Array<[string, string]> = [['recruiter', 'Recruiter screen'], ['hiring_manager', 'Hiring manager'], ['technical', 'Technical'], ['behavioral', 'Behavioral']];

const BookingRow: React.FC<{ b: BookingLine; busy: string | null; onType: (b: BookingLine, t: string) => void }> = ({ b, busy, onType }) => (
  <tr data-testid={`cdesk-bk-row-${b.interviewId}`}>
    <td data-label="When · Central" className="cdesk-small">{b.startsLabel}</td>
    <td data-label="Learner">{b.learner || 'Unnamed learner'} <PrepLink enrollmentId={b.enrollmentId} name={b.learner} /></td>
    <td data-label="Company"><b>{b.company || 'Company not named'}</b>{b.position && <div className="cdesk-small cdesk-muted">{b.position}</div>}</td>
    <td data-label="Type" className="cdesk-small">
      <div data-testid={`cdesk-bk-type-${b.interviewId}`}>{b.typeLine}</div>
      <label className="visually-hidden" htmlFor={`cdesk-bk-set-${b.interviewId}`}>Interview type for {b.company || 'this interview'}</label>
      <select id={`cdesk-bk-set-${b.interviewId}`} className="cdesk-select-sm" value={b.type ?? ''} disabled={busy !== null || ['done', 'cancelled'].includes(b.state)}
        onChange={(e) => e.target.value && onType(b, e.target.value)}>
        <option value="">Set the type</option>
        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </td>
    <td data-label="Status"><Pill tone={stateTone(b.state)}>{b.stateLabel}</Pill>{b.recording && <div className="cdesk-small cdesk-muted">{b.recording}</div>}</td>
  </tr>
);

const DeskBookingsTab: React.FC = () => {
  const data = useDeskData(loadBookings, 'bookings');
  const act = useDeskAction();
  if (data.error) return <DeskError text={data.error} onRetry={data.reload} testId="cdesk-bk-error" />;
  if (!data.data) return <p className="cdesk-muted">Loading bookings...</p>;
  const onType = (b: BookingLine, t: string) => act.run(`type:${b.interviewId}`, () => setInterviewType(b.interviewId, t), data.reload);
  return (
    <div className="cdesk-stackgap">
      {data.data.recording && <p className="cdesk-callout cdesk-warnline" data-testid="cdesk-bk-recording">{data.data.recording.note}</p>}
      <DeskAnswerLine result={act.result} testId="cdesk-bk-answer" />
      <div className="cdesk-card">
        {data.data.bookings.length === 0 ? <p data-testid="cdesk-bk-empty">No interview has a booked time yet.</p> : (
          <table className="cdesk-tbl cdesk-stack">
            <thead><tr><th scope="col">When · Central</th><th scope="col">Learner</th><th scope="col">Company</th><th scope="col">Type</th><th scope="col">Status</th></tr></thead>
            <tbody>{data.data.bookings.map((b) => <BookingRow key={b.interviewId} b={b} busy={act.busy} onType={onType} />)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DeskBookingsTab;
