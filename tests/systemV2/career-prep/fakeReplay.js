/**
 * Career Prep v27, CP9.2: a HELD placement interview with a scored replay, for the browser checks (the server's shapes:
 * placementInterviewsView.toView with `replay`, and routes/placementReplayRoutes.ts CandidateReplayResponse), answered
 * in-process like the rest of fakeApi.js. `{ held: true }` adds it beside the booked one. The recording is a signed
 * path on OUR server (never the meeting provider's link, never Zoom's file location); the page only loads it on play.
 * A test fixture: the question, the answer and the numbers are made up for the check, not taken from any interview.
 */
const DAY = 86_400_000;
const HELD_ID = 'pi-8';

function heldInterview(now) {
  const start = new Date(now - 2 * DAY).toISOString();
  return { id: HELD_ID, company: 'Contoso', role: 'Data Engineer', state: 'done', stateLabel: 'Held', startsAt: start, minutes: 30, readAs: 'Technical',
    confidence: 0.98, roomPage: null, joinOpensAt: null, joinClosesAt: null, prepId: null,
    history: [{ at: new Date(now - 5 * DAY).toISOString(), label: 'Found in your job-search inbox' }, { at: new Date(now - 4 * DAY).toISOString(), label: 'Booked' },
      { at: new Date(now - 2 * DAY + 3600_000).toISOString(), label: 'Held' }],
    replay: { status: 'scored', note: 'Scored from the audio and the words only, never the video.', score: 84 } };
}

function replayView(iv) {
  return { replay: { interviewId: iv.id, company: iv.company, role: iv.role, startsAt: iv.startsAt, status: 'scored', note: iv.replay.note, score: 84,
    recording: `/api/public/replays/${iv.id}/recording?p=c&x=1&t=${'A'.repeat(43)}`,
    questions: [
      { n: 1, question: 'Tell me about a data pipeline you built and how you measured its impact.', answer: 'I built a pipeline that moved sales data from three systems into one warehouse every night, and the wait for reports dropped from two days to one hour.',
        at: 67, seconds: 20, pace: { score: 100, value: '117 wpm', target: '100 to 165 wpm' }, fillers: { score: 100, value: '0 (0%)', target: 'under 3% of words' }, content: { score: 100, covered: 5, of: 5 } },
      { n: 2, question: 'How did you handle failures when the pipeline broke overnight?', answer: 'Um, I added alerts and a retry with a limit, so a failure paged me and the next run picked up where it stopped.',
        at: 154, seconds: 12, pace: { score: 75, value: '180 wpm', target: '100 to 165 wpm' }, fillers: { score: 64, value: '2 (7.4%)', target: 'under 3% of words' }, content: { score: 50, covered: 2, of: 4 } },
    ] } };
}

/** { status, body } for a replay call, or null when the path is not the replay (fakeApi answers it). */
function replayRoute(state, method, path) {
  const m = /^\/api\/portal\/career-prep\/replays\/([^/]+)$/.exec(path);
  if (!m || method !== 'GET') return null;
  const iv = state.placement.find((p) => p.id === m[1] && p.replay);
  return iv ? { status: 200, body: replayView(iv) } : { status: 404, body: { error: 'Not found' } };
}

/** The Interviews sheet's KPIs from the fixture rows, as the server counts them. */
function placementKpis(list) {
  return { upcoming: list.filter((p) => p.state === 'booked').length, waiting: 0, recruiter: 0, held: list.filter((p) => p.state === 'done').length,
    scored: list.filter((p) => p.replay && p.replay.status === 'scored').length };
}

module.exports = { heldInterview, replayRoute, placementKpis, HELD_ID };
