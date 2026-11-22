import React, { useEffect, useRef } from 'react';
import type { PlacementInterview } from '../interviewsApi';
import { InterviewReplay } from './InterviewReplay';

/**
 * Career Prep v27, CP8.3: one interview's history, opened from its row in the Interviews sheet. Every line is a state
 * change the platform recorded (placement_events, worded by the server), with its time in Central. Focus moves to the
 * drawer's title when it opens; Close returns focus to the row's History button (the caller passes it back).
 */
export const centralTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function interviewName(i: PlacementInterview): string {
  return [i.company ?? 'An employer', i.role].filter(Boolean).join(' · ');
}

export function InterviewHistory({ interview, onClose }: { interview: PlacementInterview; onClose: () => void }): React.ReactElement {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [interview.id]);
  return (
    <section className="cp-ivs-history" aria-labelledby="cp-ivs-history-title" data-testid="cp-ivs-history">
      <div className="cp-ivs-history-head">
        <h4 id="cp-ivs-history-title" ref={title} tabIndex={-1}>History: {interviewName(interview)}</h4>
        <button type="button" className="cp-ghost sm" onClick={onClose} data-testid="cp-ivs-history-close">Close</button>
      </div>
      {interview.history.length ? (
        <ol className="cp-ivs-history-list">{interview.history.map((h, k) => (
          <li key={`${h.at}-${k}`}><time dateTime={h.at}>{centralTime(h.at)} Central</time> {h.label}</li>
        ))}</ol>
      ) : <p className="cp-muted">Nothing recorded for this interview yet.</p>}
      {interview.replay && <InterviewReplay interviewId={interview.id} summary={interview.replay} />}
    </section>
  );
}
