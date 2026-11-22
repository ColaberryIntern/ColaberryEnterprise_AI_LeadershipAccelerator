/**
 * Career Prep v27 (CP5.4): the platform API for the browser checks, answered in-process from fixtures by Playwright
 * route interception. Nothing here can reach a real server, write a row, send an email or call a model. The state is
 * a tiny in-memory student (one real interview at Acme), so a flow behaves the way the real endpoints do: a plan is
 * built, a session started and moved, a recorded answer scored, and a finished session returns a recap whose numbers
 * equal the dashboard it then serves. Every JSON body sent back is recorded, so the suite can assert that no payload
 * ever carries a fee.
 *
 * Two students: the default one has eight weeks of history (readiness trend, every skill scored, minutes per week, a
 * streak), so Your progress draws every chart; `{ empty: true }` is a student with no data yet (no readiness, every
 * skill short of a score, zero minutes), for the honest empty state. Dates are relative to "now", weeks are Central.
 * `{ placement: true }` (CP8.3) adds an interview an employer BOOKED from the job-search inbox: its prep row (what
 * bookingConfirm links) leads the summary and the anchors, and GET /interviews/placement lists it, in the server's shapes.
 */
const { roomRoute } = require('./fakeRoom');
const { heldInterview, replayRoute, placementKpis } = require('./fakeReplay');

const DAY = 86_400_000;
const CT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The Central calendar date `days` after `now` (dates are never hard-coded, so the suite passes on any day). */
const centralDay = (now, days = 0) => CT.format(new Date(now + days * DAY));

/** The Monday (Central) of the week `weeksAgo` weeks before `now`, as YYYY-MM-DD. */
function centralMonday(now, weeksAgo = 0) {
  const today = centralDay(now - weeksAgo * 7 * DAY);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return new Date(Date.parse(`${today}T12:00:00Z`) - ((dow + 6) % 7) * DAY).toISOString().slice(0, 10);
}

function makeState(now, opts = {}) {
  const empty = !!opts.empty;
  const acme = { id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: new Date(now + 3 * DAY).toISOString(), target: 75, ...(empty ? {} : { readiness: 64 }) };
  const globex = { id: 'i9', source: 'added', company: 'Initech', role: 'Data Analyst', type: 'recruiter', startsAt: new Date(now + 6 * DAY).toISOString(), target: 65, ...(empty ? {} : { readiness: 58 }) };
  const skill = (key, label, score, change30, sources) => (empty
    ? { key, label, count: key === 'pace_clarity' ? 1 : 0, sources: key === 'pace_clarity' ? ['video'] : [] }
    : { key, label, score, change30, count: 4, sources });
  // CP8.3: the booked placement interview (pi-7) and the prep row the booking linked for it (i7), two days out.
  const north = { id: 'i7', source: 'real', company: 'Northwind', role: 'ML Engineer', type: 'recruiter', startsAt: new Date(now + 2 * DAY).toISOString(), target: 65 };
  return {
    empty,
    interviews: opts.placement ? [north, acme, globex] : [acme, globex],
    // CP9.2: `{ held: true }` adds a held interview with a scored replay (fakeReplay.js).
    placement: [...(opts.placement ? [placementBooked(north)] : []), ...(opts.held ? [heldInterview(now)] : [])],
    // CP9.1: the candidate room (fakeRoom.js): no decision yet, and every decision the page sent.
    roomDecision: null,
    roomDecisions: [],
    skills: [
      skill('pace_clarity', 'Pace and clarity', 48, 4, ['video', 'phone_mock']),
      skill('ending_with_number', 'Ending on a result with a number', 57, 9, ['video', 'real_interview']),
      skill('explaining_ai', 'Explaining AI simply', 58, -2, ['video', 'training']),
      skill('composure_followups', 'Composure under follow-ups', 62, 7, ['phone_mock']),
      skill('few_fillers', 'Few filler words', 64, 8, ['video', 'phone_mock']),
      skill('behavioral_stories', 'Behavioral stories', 66, 2, ['video', 'phone_mock']),
      skill('role_knowledge', 'Role knowledge', 70, 6, ['training', 'project']),
      skill('answer_structure', 'Answer structure (STAR)', 72, 4, ['video', 'project']),
      skill('proof_of_work', 'Proof of work', 74, 0, ['project']),
    ],
    readiness: empty ? null : 64,
    plan: null,
    session: null,
    attempts: 0,
    // CP5.8: read-aloud attempt ids, and the uploads the browser sent (to prove audio only, with the line id).
    readAloud: new Set(),
    // CP6.1: no job-search inbox set up yet.
    inbox: { address: null, health: 'setup', healthLabel: 'Not set up yet', verifiedAt: null, forwardingConfirmedAt: null, lastReceivedAt: null, lastTestAt: null, lastTestMs: null, receivedThisMonth: 0, steps: { create: false, added: false, forwarding: false, tested: false } },
    readAloudUploads: [],
    finished: false,
    // R1.1: Try answers the student saved (attempt ids), and how long POST /plans takes (to see the busy state).
    saved: new Set(opts.saved || []),
    // R1.2: saved answers switched on for the public profile (the second opt-in, off by default).
    shown: new Set(),
    planDelayMs: opts.planDelayMs || 0,
    now,
  };
}

/** The server's shape (placementInterviewsView.toView) for a booked interview; Join is the consent-room page. */
function placementBooked(prep) {
  const start = Date.parse(prep.startsAt);
  return { id: 'pi-7', company: prep.company, role: prep.role, state: 'booked', stateLabel: 'Booked', startsAt: prep.startsAt, minutes: 30, readAs: 'Recruiter screen',
    confidence: 0.97, roomPage: '/portal/career/interview/pi-7', joinOpensAt: new Date(start - 10 * 60_000).toISOString(), joinClosesAt: new Date(start + 30 * 60_000).toISOString(),
    prepId: prep.id, history: [{ at: new Date(start - 3 * DAY).toISOString(), label: 'Found in your job-search inbox' }, { at: new Date(start - 2.5 * DAY).toISOString(), label: 'Booked' }] };
}

const segs = (state) => [
  { kind: 'warmup', title: 'Warm up', minutes: 2, state: 'pending' },
  { kind: 'try', title: 'Try it on camera', minutes: 8, targetSkill: 'pace_clarity', state: 'pending' },
  { kind: 'cooldown', title: 'Cool down', minutes: 1, state: 'pending' },
].map((s, i) => ({ ...s, state: state.session && state.session.done.includes(i) ? 'done' : 'pending' }));

const TREND = [52, 55, 54, 58, 60, 61, 63];
const MINUTES = [20, 15, 35, 30, 55, 45, 70];

function dashboard(state) {
  const thisWeek = state.finished ? 11 : 0;
  if (state.empty) {
    return {
      anchorId: 'i1',
      interviews: state.interviews,
      skills: state.skills,
      sources: { video: state.attempts, phone_mock: 0, real_interview: 0, training: 0, project: 0, read_aloud: 0 },
      weeklyMinutes: Array.from({ length: 8 }, (_, k) => ({ week: centralMonday(state.now, 7 - k), minutes: k === 7 ? thisWeek : 0 })),
      streak: state.finished ? 1 : 0,
      thisWeek,
    };
  }
  return {
    anchorId: 'i1',
    readiness: { value: state.readiness, target: 75, changeSinceFirst: state.readiness - TREND[0],
      trend: [...TREND.map((value, k) => ({ week: centralMonday(state.now, 7 - k), value })), { week: centralMonday(state.now), value: state.readiness }] },
    interviews: state.interviews.map((i) => (i.id === 'i1' ? { ...i, readiness: state.readiness } : i)),
    skills: [...state.skills].sort((a, b) => (a.score ?? 101) - (b.score ?? 101)),
    sources: { video: 15 + state.attempts, phone_mock: 6, real_interview: 2, training: 18, project: 3, read_aloud: 0 },
    weeklyMinutes: [...MINUTES.map((minutes, k) => ({ week: centralMonday(state.now, 7 - k), minutes })), { week: centralMonday(state.now), minutes: 60 + thisWeek }],
    streak: state.finished ? 5 : 4,
    thisWeek: 60 + thisWeek,
  };
}

function finish(state, status) {
  const before = state.readiness;
  const pace = state.skills.find((s) => s.key === 'pace_clarity');
  const paceBefore = pace.score;
  if (state.empty) {
    // A new student: the answer counts toward pace and fillers, but no skill has a number yet (it needs 3 results).
    if (state.attempts > 0 && !state.finished) pace.count += state.attempts;
    state.finished = true;
    return {
      status, minutes: 11, attempts: state.attempts, pending: 0, firstName: 'Ali', skills: [],
      building: state.attempts ? [{ key: 'pace_clarity', label: 'Pace and clarity', count: pace.count, needed: 3 }, { key: 'few_fillers', label: 'Few filler words', count: state.attempts, needed: 3 }] : [],
      streak: 1,
    };
  }
  if (state.attempts > 0 && !state.finished) { pace.score = 57; pace.change30 = 13; state.readiness = 69; }
  state.finished = true;
  return {
    status, minutes: 11, attempts: state.attempts, pending: 0, firstName: 'Ali',
    readiness: { before, after: state.readiness, interviewId: 'i1', company: 'Acme' },
    skills: state.attempts ? [{ key: 'pace_clarity', label: 'Pace and clarity', before: paceBefore, after: pace.score }] : [],
    building: [],
    streak: 5,
  };
}

function route(state, method, path, query, body) {
  const P = '/api/portal/career-prep';
  // CP_E2E_SELFTEST=flag-off: Career Prep closed, so the suite must FAIL (proves its checks can go red).
  if (path === `${P}/flags`) return { careerPrep: process.env.CP_E2E_SELFTEST !== 'flag-off' };
  if (path === `${P}/summary`) return { firstName: 'Ali', nextInterview: dashboard(state).interviews[0], stops: { ...(state.readiness ? { readiness: state.readiness } : {}), readyAt: 75 }, interviews: dashboard(state).interviews, interviewCount: state.interviews.length, today: centralDay(state.now) };
  if (path === `${P}/dashboard`) return dashboard(state);
  if (path === `${P}/reminders` && method === 'GET') return { reminders: [] };
  if (path === `${P}/reminders`) return { reminder: { id: 'r1', kind: body.kind, sendAt: new Date(state.now + DAY).toISOString(), status: 'pending' } };
  if (path === `${P}/cora`) return { messages: ['Here is what I would work on first.'], cards: [] }; // the server's shape
  if (path === `${P}/interviews` && method === 'POST') {
    const id = `i${state.interviews.length + 1}`;
    const iv = body.mode === 'practice' || !body.company
      ? { id, source: 'practice', company: 'Practice interview', role: body.role, type: body.type || 'behavioral', target: 70 }
      : { id, source: 'added', company: body.company, role: body.role, type: body.type || 'recruiter', target: 65, ...(body.startsAt ? { startsAt: body.startsAt } : {}) };
    state.interviews.push(iv);
    return { id, source: iv.source };
  }
  if (path === `${P}/plans` && method === 'GET') return { plan: state.plan };
  if (path === `${P}/plans`) {
    state.plan = { id: 'plan-1', interviewId: body.interviewId, ...(body.focusSkill ? { focusSkill: body.focusSkill } : {}), plan: { kind: body.kind, minutes: 11, days: [{ date: centralDay(state.now), segments: segs({ session: null }) }, { date: centralDay(state.now, 1), segments: segs({ session: null }) }] } };
    return state.plan;
  }
  if (path === `${P}/sessions` && method === 'POST') {
    state.session = state.session || { id: '22222222-2222-4222-8222-222222222222', done: [], status: 'running' };
    return { session: sessionView(state), resumed: false };
  }
  const attempt = /^\/api\/portal\/career-prep\/sessions\/[^/]+\/attempts(\/[^/]+)?$/.exec(path);
  // CP6.1: the job-search inbox (the server's shape: inboxService.getInbox); nothing received in the fixture.
  if (path === `${P}/inbox` && method === 'PUT') { state.inbox = { ...state.inbox, address: String(body.address || '').trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com'), health: 'setup', healthLabel: 'Not set up yet', steps: { create: true, added: true, forwarding: false, tested: false } }; return { inbox: state.inbox }; }
  if (path === `${P}/inbox`) return { inbox: state.inbox };
  if (path === `${P}/inbox/received`) return { items: [] };
  if (path === `${P}/interviews/placement`) return { kpis: placementKpis(state.placement), interviews: state.placement };
  if (path === `${P}/read-aloud/line`) return { line: { id: 'ra-02', text: 'The problem was simple to describe and hard to solve, so I started by talking to the people who lived with it.' } };
  const line = /name="lineId"\r?\n\r?\n([^\r\n]+)/.exec((body && body.raw) || '');
  if (attempt && method === 'POST' && line) {
    const id = `ra${state.readAloud.size + 1}`; state.readAloud.add(id);
    state.readAloudUploads.push({ lineId: line[1], audio: /Content-Type: audio\//.test(body.raw), video: /Content-Type: video\//.test(body.raw) });
    return { attempt: { id, status: 'pending', result: null, errorClass: null } };
  }
  if (attempt && method === 'POST') { state.attempts += 1; return { attempt: { id: `a${state.attempts}`, status: 'pending', result: null, errorClass: null } }; }
  // The read-aloud scorer's real shape (attempts.readAloudResult): three parts and the one score that counts.
  if (attempt && attempt[1] && state.readAloud.has(attempt[1].slice(1))) return { attempt: { id: attempt[1].slice(1), status: 'done', errorClass: null, result: { seconds: 9.2, notes: [], readAloud: { score: 91, lineId: 'ra-02' }, scores: [
    { key: 'pace', label: 'Pace', score: 100, value: '137 wpm', target: '100 to 165 wpm', source: 'Career Prep read-aloud warm-up' },
    { key: 'smoothness', label: 'Smoothness', score: 70, value: '2 pause(s) of 1 s or more', target: 'no pauses of 1 s or more', source: 'Career Prep read-aloud warm-up' },
    { key: 'completeness', label: 'Completeness', score: 100, value: '21 of 21 words', target: 'every word of the line', source: 'Career Prep read-aloud warm-up' },
  ] } } };
  // The scorer's real shape (attempts.attemptResult): pace, fillers and repetition against their published targets, and its notes.
  // R1.1: a scored attempt says whether its recording is saved, or still saveable (pending).
  if (attempt) return { attempt: { id: 'a1', status: 'done', errorClass: null, recording: state.saved.has('a1') ? 'saved' : 'pending', result: { seconds: 41, scores: [
    { key: 'pace', label: 'Pace', score: 100, value: '142 wpm', target: '100 to 165 wpm', source: 'Microsoft Speaker Coach: 100 to 165 words a minute' },
    { key: 'fillers', label: 'Filler words', score: 100, value: '1 (1.1%)', target: 'under 3% of words', source: 'Yoodli: fillers under 3% of words' },
    { key: 'repetition', label: 'Repetition', score: 66, value: '8.1%', target: 'under 4% of words', source: 'Yoodli: repetition under 4% of words' },
  ], notes: ['About 142 words a minute, a comfortable pace.', 'Very few filler words. Nice.', '4.2 seconds before your first word. Start talking right away.', 'You repeated "the project" 5 times. Vary the wording.'] } } };
  if (/^\/api\/portal\/career-prep\/sessions\/[^/]+$/.test(path) && method === 'PATCH') {
    if (body.action === 'segment_done' && !state.session.done.includes(body.segmentIndex)) state.session.done.push(body.segmentIndex);
    if (body.action === 'finish' || body.action === 'end') {
      state.session.status = body.action === 'finish' ? 'finished' : 'ended';
      return { session: sessionView(state), recap: finish(state, state.session.status) };
    }
    return { session: sessionView(state) };
  }
  // R1.1: where a skill's number comes from (the server's shape: skillSources.describe), and saved Try answers.
  const src = /^\/api\/portal\/career-prep\/skills\/([^/]+)\/sources$/.exec(path);
  if (src) {
    const at = (d) => new Date(state.now - d * DAY).toISOString();
    if (query.get('source') !== 'video') return { items: [{ at: at(2), value: 70, kind: 'other', label: 'A lesson quiz' }] };
    return { items: [
      { at: at(0), value: 52, kind: 'try_answer', label: 'A Try answer in Career Prep', notKept: true },
      ...(state.saved.has('a1') ? [{ at: at(0), value: 57, kind: 'try_answer', label: 'Try answer: Walk me through a project.', video: { streamUrl: '/media/none.mp4', posterUrl: '/media/none.jpg' } }] : []),
      { at: at(3), value: 41, kind: 'intro_video', label: 'Your intro video', link: '/portal/portfolio?tab=hire&section=video' },
    ] };
  }
  const save = /^\/api\/portal\/career-prep\/attempts\/([^/]+)\/save$/.exec(path);
  if (save && method === 'POST') { state.saved.add(save[1]); return { answer: { attemptId: save[1], question: body.question || null, delivery: 89, seconds: 41, savedAt: new Date(state.now).toISOString(), streamUrl: '/media/none.mp4', posterUrl: '/media/none.jpg' } }; }
  if (save && method === 'DELETE') { state.saved.delete(save[1]); state.shown.delete(save[1]); return { ok: true }; }
  const savedView = (id) => ({ attemptId: id, question: 'Walk me through a project.', delivery: 89, seconds: 41, savedAt: new Date(state.now).toISOString(), streamUrl: '/media/none.mp4', posterUrl: '/media/none.jpg', showPublic: state.shown.has(id) });
  const pub = /^\/api\/portal\/career-prep\/attempts\/([^/]+)\/public$/.exec(path);
  if (pub && method === 'PUT') {
    if (body.on === true) state.shown.add(pub[1]); else state.shown.delete(pub[1]);
    return { answer: savedView(pub[1]) };
  }
  if (path === `${P}/answers`) return { answers: [...state.saved].map(savedView) };
  if (path === '/api/portal/career/hire-interviews') return { ok: true, interviews: [] };
  // R1.2: the smallest honest career profile, so /portal/portfolio (Hire studio > Video) renders: nothing on record.
  if (path === '/api/portal/career/profile') {
    return { state: 'ready', visibility: 'private', identity: null, capabilities: [], artifacts: [], projects: [], github: null, delivery_experience: [],
      readiness: null, narrative: null, recent_activity: null, publication: { status: 'not_published', note: '' }, degraded: [], generated_at: new Date(state.now).toISOString() };
  }
  return null; // not a Career Prep call: the caller answers it with an empty 200
}

function sessionView(state) {
  return { id: state.session.id, planId: 'plan-1', status: state.session.status, startedAt: new Date(state.now).toISOString(), secondsActive: 60, segments: segs(state) };
}

/** Install on a Playwright page. Returns { state, sent } (sent = every JSON body served, for the no-fee check). */
async function installFakeApi(page, now = Date.now(), opts = {}) {
  const state = makeState(now, opts);
  const sent = [];
  await page.route('**/api/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    let body = {};
    // A multipart upload is not JSON: keep its raw text so the read-aloud fixture can see the lineId field (CP5.8).
    try { body = req.postDataJSON() || {}; } catch { body = { raw: req.postData() || '' }; }
    if (state.planDelayMs && req.method() === 'POST' && url.pathname === '/api/portal/career-prep/plans') await new Promise((ok) => setTimeout(ok, state.planDelayMs));
    const room = roomRoute(state, req.method(), url.pathname, body) || replayRoute(state, req.method(), url.pathname);
    if (room) { sent.push({ path: url.pathname, payload: room.body }); await r.fulfill({ status: room.status, contentType: 'application/json', body: JSON.stringify(room.body) }); return; }
    const out = route(state, req.method(), url.pathname, url.searchParams, body);
    const payload = out === null ? {} : out;
    sent.push({ path: url.pathname, payload });
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  return { state, sent };
}

module.exports = { installFakeApi };
