/**
 * Career Prep v27 (CP5.4): the platform API for the browser checks, answered in-process from fixtures by Playwright
 * route interception. Nothing here can reach a real server, write a row, send an email or call a model. The state is
 * a tiny in-memory student (one real interview at Acme), so a flow behaves the way the real endpoints do: a plan is
 * built, a session started and moved, a recorded answer scored, and a finished session returns a recap whose numbers
 * equal the dashboard it then serves. Every JSON body sent back is recorded, so the suite can assert that no payload
 * ever carries a fee.
 */
const DAY = 86_400_000;
const CT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The Central calendar date `days` after `now` (dates are never hard-coded, so the suite passes on any day). */
const centralDay = (now, days = 0) => CT.format(new Date(now + days * DAY));

function makeState(now) {
  const acme = { id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: new Date(now + 3 * DAY).toISOString(), target: 75, readiness: 64 };
  const skill = (key, label, score) => ({ key, label, score, count: 4, sources: ['video'] });
  return {
    interviews: [acme],
    skills: [skill('pace_clarity', 'Pace and clarity', 48), skill('few_fillers', 'Few filler words', 61), skill('explaining_ai', 'Explaining AI simply', 66), skill('role_knowledge', 'Role knowledge', 70), skill('composure_followups', 'Composure under follow-ups', 59)],
    readiness: 64,
    plan: null,
    session: null,
    attempts: 0,
    finished: false,
    now,
  };
}

const segs = (state) => [
  { kind: 'warmup', title: 'Warm up', minutes: 2, state: 'pending' },
  { kind: 'try', title: 'Try it on camera', minutes: 8, targetSkill: 'pace_clarity', state: 'pending' },
  { kind: 'cooldown', title: 'Cool down', minutes: 1, state: 'pending' },
].map((s, i) => ({ ...s, state: state.session && state.session.done.includes(i) ? 'done' : 'pending' }));

function dashboard(state) {
  return {
    anchorId: 'i1',
    readiness: { value: state.readiness, target: 75, trend: [{ week: centralDay(state.now, -7), value: 60 }, { week: centralDay(state.now), value: state.readiness }] },
    interviews: state.interviews.map((i) => (i.id === 'i1' ? { ...i, readiness: state.readiness } : i)),
    skills: [...state.skills].sort((a, b) => a.score - b.score),
    sources: { video: 4 + state.attempts, phone_mock: 0, real_interview: 0, training: 3, project: 1 },
    weeklyMinutes: [{ week: centralDay(state.now, -7), minutes: 40 }, { week: centralDay(state.now), minutes: state.finished ? 11 : 0 }],
    streak: state.finished ? 1 : 0,
    thisWeek: state.finished ? 11 : 0,
  };
}

function finish(state, status) {
  const before = state.readiness;
  const pace = state.skills.find((s) => s.key === 'pace_clarity');
  const paceBefore = pace.score;
  if (state.attempts > 0 && !state.finished) { pace.score = 57; state.readiness = 69; }
  state.finished = true;
  return {
    status, minutes: 11, attempts: state.attempts, pending: 0, firstName: 'Ali',
    readiness: { before, after: state.readiness, interviewId: 'i1', company: 'Acme' },
    skills: state.attempts ? [{ key: 'pace_clarity', label: 'Pace and clarity', before: paceBefore, after: pace.score }] : [],
    streak: 1,
  };
}

function route(state, method, path, query, body) {
  const P = '/api/portal/career-prep';
  // CP_E2E_SELFTEST=flag-off: Career Prep closed, so the suite must FAIL (proves its checks can go red).
  if (path === `${P}/flags`) return { careerPrep: process.env.CP_E2E_SELFTEST !== 'flag-off' };
  if (path === `${P}/summary`) return { firstName: 'Ali', nextInterview: dashboard(state).interviews[0], stops: { readiness: state.readiness, readyAt: 75 }, interviews: dashboard(state).interviews, interviewCount: 1, today: centralDay(state.now) };
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
    state.plan = { id: 'plan-1', interviewId: body.interviewId, plan: { kind: body.kind, minutes: 11, days: [{ date: centralDay(state.now), segments: segs({ session: null }) }, { date: centralDay(state.now, 1), segments: segs({ session: null }) }] } };
    return state.plan;
  }
  if (path === `${P}/sessions` && method === 'POST') {
    state.session = state.session || { id: '22222222-2222-4222-8222-222222222222', done: [], status: 'running' };
    return { session: sessionView(state), resumed: false };
  }
  const attempt = /^\/api\/portal\/career-prep\/sessions\/[^/]+\/attempts(\/[^/]+)?$/.exec(path);
  if (attempt && method === 'POST') { state.attempts += 1; return { attempt: { id: `a${state.attempts}`, status: 'pending', result: null, errorClass: null } }; }
  if (attempt) return { attempt: { id: 'a1', status: 'done', errorClass: null, result: { seconds: 41, notes: ['Good pace; end on the number.'], scores: [{ key: 'pace', label: 'Pace', score: 82, value: '142 words a minute', target: '100 to 165', source: 'your recording' }] } } };
  if (/^\/api\/portal\/career-prep\/sessions\/[^/]+$/.test(path) && method === 'PATCH') {
    if (body.action === 'segment_done' && !state.session.done.includes(body.segmentIndex)) state.session.done.push(body.segmentIndex);
    if (body.action === 'finish' || body.action === 'end') {
      state.session.status = body.action === 'finish' ? 'finished' : 'ended';
      return { session: sessionView(state), recap: finish(state, state.session.status) };
    }
    return { session: sessionView(state) };
  }
  if (path === '/api/portal/career/hire-interviews') return { ok: true, interviews: [] };
  return null; // not a Career Prep call: the caller answers it with an empty 200
}

function sessionView(state) {
  return { id: state.session.id, planId: 'plan-1', status: state.session.status, startedAt: new Date(state.now).toISOString(), secondsActive: 60, segments: segs(state) };
}

/** Install on a Playwright page. Returns { state, sent } (sent = every JSON body served, for the no-fee check). */
async function installFakeApi(page, now = Date.now()) {
  const state = makeState(now);
  const sent = [];
  await page.route('**/api/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    let body = {};
    try { body = req.postDataJSON() || {}; } catch { body = {}; }
    const out = route(state, req.method(), url.pathname, url.searchParams, body);
    const payload = out === null ? {} : out;
    sent.push({ path: url.pathname, payload });
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  return { state, sent };
}

module.exports = { installFakeApi };
