import React, { useEffect, useState } from 'react';
import { fetchReplayApi, replayMediaUrl, type CandidateReplay, type ReplayPart, type ReplayQuestion, type ReplaySummary } from '../interviewsApi';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): a held interview's replay, inside its History drawer. The summary line
 * comes with the Interviews list (why there is no replay, or that Zoom is still preparing it); a scored or recorded
 * replay is loaded on open: the recording (played through our own server, never the meeting link) and one card per
 * answer: the question asked, what was heard, pace and filler words against their published targets, and how many of
 * the question's key words the answer covered. Feedback only the student sees. Audio and words only, never the video.
 * A failed load is an alert, never an empty replay.
 */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

function PartLine({ label, p }: { label: string; p: ReplayPart | null }): React.ReactElement | null {
  if (!p) return null;
  return <li><b>{label}</b> {p.score}: {p.value} <span className="cp-muted">(target {p.target})</span></li>;
}

export function QuestionCard({ q }: { q: ReplayQuestion }): React.ReactElement {
  return (
    <li className="cp-ivs-qcard" data-testid={`cp-ivs-q-${q.n}`}>
      <p className="cp-ivs-q"><b>Question {q.n}</b>{q.question ? `: ${q.question}` : ': (no question before this answer)'}</p>
      <p className="cp-muted">At {clock(q.at)}, {q.seconds} seconds. You said: {q.answer}</p>
      <ul className="cp-ivs-parts">
        <PartLine label="Pace" p={q.pace} />
        <PartLine label="Filler words" p={q.fillers} />
        {q.content && <li><b>Covered the question</b> {q.content.score}: {q.content.covered} of {q.content.of} key words</li>}
      </ul>
    </li>
  );
}

const loadable = (s: ReplaySummary) => s.status === 'scored' || s.status === 'no_score';

export function InterviewReplay({ interviewId, summary }: { interviewId: string; summary: ReplaySummary }): React.ReactElement {
  const [replay, setReplay] = useState<CandidateReplay | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!loadable(summary)) return undefined;
    let live = true;
    setReplay(null); setFailed(false);
    fetchReplayApi(interviewId).then((r) => { if (live) setReplay(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [interviewId, summary]);
  return (
    <section className="cp-ivs-replay" aria-labelledby="cp-ivs-replay-h" data-testid="cp-ivs-replay">
      <h5 id="cp-ivs-replay-h">Replay{summary.score !== null ? `: score ${summary.score}` : ''}</h5>
      <p className="cp-muted" data-testid="cp-ivs-replay-note">{summary.note}</p>
      {failed && <p role="alert" className="cp-form-problem" data-testid="cp-ivs-replay-failed">Could not load the replay. Try again in a moment.</p>}
      {loadable(summary) && !replay && !failed && <p className="cp-muted" aria-live="polite">Loading the replay...</p>}
      {replay?.recording && (
        <video className="cp-ivs-video" controls playsInline preload="none" src={replayMediaUrl(replay.recording)}
          aria-label={`Recording of your interview with ${replay.company ?? 'the employer'}`} data-testid="cp-ivs-replay-video" />
      )}
      {replay && replay.questions.length > 0 && (
        <>
          <p className="cp-muted">Zoom's transcript may leave out some filler words, so the count is what the transcript shows.</p>
          <ol className="cp-ivs-qcards" data-testid="cp-ivs-qcards">{replay.questions.map((q) => <QuestionCard key={q.n} q={q} />)}</ol>
        </>
      )}
    </section>
  );
}
