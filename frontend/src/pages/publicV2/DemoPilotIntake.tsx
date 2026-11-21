import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IntakeStatus, Meeting, SharedFile, getIntakeStatus } from '../../services/enterpriseIntakeApi';
import { formatHours, hoursPerYear } from './demoPilotModel';
import IntakePurpose from './intake/IntakePurpose';
import IntakePath, { PathState } from './intake/IntakePath';
import InterviewPlan from './intake/InterviewPlan';
import MeetingPicker from './intake/MeetingPicker';
import ResearchUpload from './intake/ResearchUpload';
import InterviewRunner from './intake/InterviewRunner';
import { whenLabel } from './intake/intakeModel';
import './demoPilotIntake.css';

/**
 * DemoPilotIntake - what /demo-pilot shows once the form is in.
 *
 * W28 (Ali, 2026-11-20): their own time figure, then a 10-minute AI interview.
 * v2 (Ali, 2026-11-21): "It's not clear what the interview is for - make it clear", show the
 * AI interview against a 20-30 minute call with everyone, let them upload research they already
 * have, show our research and ROI-ranked options as a step, let them do the AI interview now or
 * later, and have them book the human meeting in the same visit, always after the AI interview.
 *
 * Stages: plan (purpose, path, now/later) -> meeting (book with Ali) -> interview (now) -> done.
 * `resumeStage` picks up where they left off on a reload or from an emailed link.
 */
export type Stage = 'loading' | 'missing' | 'plan' | 'meeting' | 'interview' | 'done';

/** Where a returning visitor belongs. A "later" interview whose time has come opens the interview. */
export function resumeStage(s: IntakeStatus, now = new Date()): Stage {
  if (s.interviewed) return s.meeting ? 'done' : 'meeting';
  if (s.call === 'in_progress' || s.call === 'writing_up') return 'interview';
  if (!s.interviewMode) return 'plan';
  if (!s.meeting) return 'meeting';
  if (s.interviewMode === 'now') return 'interview';
  const at = s.interviewScheduledFor ? new Date(s.interviewScheduledFor).getTime() : 0;
  return at && now.getTime() >= at - 15 * 60_000 ? 'interview' : 'done';
}

export function pathState(s: IntakeStatus, stage: Stage, files: SharedFile[]): PathState {
  return {
    interview: s.interviewed ? 'done' : stage === 'plan' || stage === 'interview' ? 'current' : 'next',
    theirResearch: files.length ? 'done' : 'next',
    ourResearch: 'next',
    meeting: stage === 'meeting' ? 'current' : 'next',
    notes: {
      interview: !s.interviewed && s.interviewMode === 'later' && s.interviewScheduledFor ? `Scheduled: ${whenLabel(s.interviewScheduledFor)}` : undefined,
      theirResearch: files.length ? `${files.length} file${files.length === 1 ? '' : 's'} shared` : undefined,
      ourResearch: s.interviewed ? 'Under way now' : 'Starts as soon as your AI interview is in',
      meeting: s.meeting ? `Booked: ${whenLabel(s.meeting.start)}` : undefined,
    },
  };
}

export interface DemoPilotIntakeProps {
  token: string;
  /** The number they gave, to say back while we call. Absent after a reload. */
  phone?: string;
}

export function DemoPilotIntake({ token, phone }: DemoPilotIntakeProps): React.ReactElement {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);

  const refresh = useCallback(async (next?: Stage): Promise<void> => {
    try {
      const s = await getIntakeStatus(token);
      setStatus(s);
      setFiles(s.files || []);
      setStage(next || resumeStage(s));
    } catch {
      setStage('missing');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const interviewDone = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (stage === 'loading') return <p className="cbv2-dpi__wait">Loading your next steps…</p>;
  if (stage === 'missing' || !status) {
    return (
      <p className="cbv2-dpi__wait">
        We could not find that request. Email <a href="mailto:info@colaberry.com">info@colaberry.com</a> and we will pick it up.
      </p>
    );
  }

  const perYear = hoursPerYear(status.hoursPerWeek ?? null);
  const onBooked = (m: Meeting): void => {
    setStatus({ ...status, meeting: m });
    void refresh(status.interviewMode === 'now' && !status.interviewed ? 'interview' : 'done');
  };

  return (
    <div className="cbv2-dpi" data-testid="demo-pilot-intake">
      {stage === 'plan' ? (
        <>
          {perYear !== null ? (
            <p className="cbv2-dpi__fig" data-testid="intake-savings">
              <span>You told us this process takes</span>
              <b>{formatHours(perYear)} hours a year</b>
              <span>
                {status.peopleCount ? `${status.peopleCount} ${status.peopleCount === 1 ? 'person' : 'people'}, ` : ''}
                {status.hoursPerWeek} hours a week. That is the time a pilot goes after.
              </span>
            </p>
          ) : null}
          <IntakePurpose />
        </>
      ) : null}

      <IntakePath state={pathState(status, stage, files)} />

      {stage === 'plan' ? <InterviewPlan token={token} callAvailable={status.callAvailable} onPlanned={() => void refresh('meeting')} /> : null}

      {stage === 'meeting' ? (
        <MeetingPicker token={token} anchorKey={`${status.interviewMode}-${status.interviewScheduledFor || ''}-${status.interviewed}`} onBooked={onBooked} />
      ) : null}

      {stage === 'interview' ? <InterviewRunner token={token} status={status} phone={phone} onDone={interviewDone} /> : null}

      {stage === 'done' ? (
        <section className="cbv2-dpi__card cbv2-dpi__done" aria-labelledby="dpi-done-title" data-testid="intake-done">
          <h2 id="dpi-done-title" className="cbv2-dpi__h">{status.interviewed ? 'Thank you. You are all set.' : 'You are all set.'}</h2>
          <ul className="cbv2-dpi__summary">
            <li data-testid="done-interview">
              <strong>AI interview:</strong>{' '}
              {status.interviewed
                ? 'done. We are researching your company and drafting your options now.'
                : status.interviewScheduledFor
                  ? `${whenLabel(status.interviewScheduledFor)}. We will email you the link then.`
                  : 'not done yet.'}
            </li>
            {status.meeting ? (
              <li data-testid="done-meeting">
                <strong>Meeting with Ali:</strong> {whenLabel(status.meeting.start)}, 30 minutes on Google Meet. The invite is in your inbox.
              </li>
            ) : null}
          </ul>
          {!status.interviewed ? (
            <button type="button" className="cbv2-btn cbv2-btn--line" onClick={() => setStage('interview')}>
              Do my AI interview now instead
            </button>
          ) : null}
          <p className="cbv2-dpi__wait" data-testid="intake-my-pilot">
            See where your pilot stands any time at <Link to="/my-pilot">My pilot</Link>.
          </p>
        </section>
      ) : null}

      {stage !== 'interview' ? <ResearchUpload token={token} files={files} onChange={setFiles} /> : null}
    </div>
  );
}

export default DemoPilotIntake;
