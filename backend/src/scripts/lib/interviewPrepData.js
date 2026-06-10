/* eslint-disable */
/**
 * interviewPrepData.js
 *
 * Pure classifier for the IPBC Interview Preparation management report + nudge
 * engine. Input is the raw recordset from CCPP view
 * `vw_ColaberryInterviewPreparation_UpcomingInterviews`; output is a structured,
 * render-ready object (KPIs, priority-ranked rows, scatter points, heatmap rows).
 *
 * NO I/O. Deterministic. Unit-tested in __tests__/interviewPrepData.test.js so the
 * stage/urgency/priority contract can't drift silently.
 *
 * CCPP view columns consumed (validated against live CCPP 2026-06-10):
 *   Applicant, Company_name, Job_Title, Job_Description, InterviewType,
 *   InterviewDate (datetime), NoofDays (int; >=0 future incl today, <0 past),
 *   Preparationscore (float 0-100), AutoInterviewsCount, MentorInterviewsCount,
 *   AutoMocks_Overall_score_AVG, Mentor, MentorEmail, Recruiter_*,
 *   StudentPrep_Xaxis/Yaxis, SurveyResponse (null = post-interview survey not done),
 *   LogInterviewID, CandidateID.
 *
 * The funnel (from the IPBC "How to prepare" email): logged -> review 10 Qs ->
 * generate answers -> practice -> Auto Mock (repeat) -> Mentor mock -> interview ->
 * post-interview survey. Each step is measurable from the columns above, which is
 * what lets us both prioritize AND nudge to the next step.
 */

// ---- readiness model -------------------------------------------------------
// readiness 0..1 = how prepared this student is for THIS interview. Blends the
// app's own Preparationscore with the two activity counts that move it (auto
// mocks + the mentor mock), so a 0 prep score with real activity still reads as
// progress, and a high prep score with no mentor mock still flags the gap.
const W_PREP = 0.45;   // app Preparationscore (0-100)
const W_AUTO = 0.30;   // auto mock interviews taken (cap at 3 = "enough reps")
const W_MENTOR = 0.25; // instructor/mentor mock done (binary gate before the real thing)
const AUTO_TARGET = 3;

function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)); }
function num(n) { return Number(n) || 0; }

function readiness(row) {
  const prep = clamp01(num(row.prepScore) / 100);
  const auto = clamp01(num(row.autoMocks) / AUTO_TARGET);
  const mentor = num(row.mentorMocks) >= 1 ? 1 : 0;
  return W_PREP * prep + W_AUTO * auto + W_MENTOR * mentor;
}

// ---- funnel stage (what they have DONE) ------------------------------------
const STAGE = {
  COMPLETE: 'COMPLETE',               // interview passed + survey logged
  AWAITING_SURVEY: 'AWAITING_SURVEY', // interview passed, no survey yet
  TODAY: 'TODAY',                     // interview is today
  MENTOR_DONE: 'MENTOR_DONE',         // mentor mock complete, polishing
  AUTO_READY: 'AUTO_READY',           // enough auto mocks, ready for mentor mock
  PRACTICING: 'PRACTICING',           // 1 auto mock in, building reps
  NOT_STARTED: 'NOT_STARTED',         // logged, zero prep activity
};

function funnelStage(row) {
  if (row.days < 0) return row.hasSurvey ? STAGE.COMPLETE : STAGE.AWAITING_SURVEY;
  if (row.days === 0) return STAGE.TODAY;
  if (num(row.mentorMocks) >= 1) return STAGE.MENTOR_DONE;
  if (num(row.autoMocks) >= 2) return STAGE.AUTO_READY;
  if (num(row.autoMocks) >= 1) return STAGE.PRACTICING;
  return STAGE.NOT_STARTED;
}

// The "secret push": each label is framed as info/coaching but names the single
// next action that moves the student one step down the funnel.
function nextStep(row) {
  switch (row.stage) {
    case STAGE.NOT_STARTED:
      return { action: 'Take your first Auto Mock interview', detail: 'Review the 10 questions, draft answers, then run an Auto Mock to get scored.' };
    case STAGE.PRACTICING:
      return { action: 'Get to 2+ Auto Mocks and raise your score', detail: 'Repeat the Auto Mock until you can deliver all 10 answers smoothly.' };
    case STAGE.AUTO_READY:
      return { action: `Book your mentor mock with ${row.mentor || 'your mentor'}`, detail: 'You have the reps in. The instructor mock is the last gate before the real interview.' };
    case STAGE.MENTOR_DONE:
      return { action: 'Final polish — one more Auto Mock', detail: 'Mentor mock done. Keep the answers warm with a final run-through.' };
    case STAGE.TODAY:
      return { action: 'Interview today — then log how it went', detail: 'Right after the interview, complete your post-interview survey while it is fresh.' };
    case STAGE.AWAITING_SURVEY:
      return { action: 'Complete your post-interview survey', detail: '2 minutes. Tells us how it went so we can line up the next step.' };
    case STAGE.COMPLETE:
      return { action: 'Survey logged — nothing owed', detail: '' };
    default:
      return { action: '', detail: '' };
  }
}

// ---- urgency tier (priority for the manager) -------------------------------
const TIER = {
  TODAY: 'TODAY',
  CRITICAL: 'CRITICAL',     // <=2 days out AND under-prepared
  IMMINENT: 'IMMINENT',     // <=2 days out, prepared
  AT_RISK: 'AT_RISK',       // 3-5 days out AND behind
  SOON: 'SOON',             // 3-5 days out, on pace
  BEHIND: 'BEHIND',         // >5 days but little/no prep
  ON_TRACK: 'ON_TRACK',     // >5 days, progressing
  SURVEY: 'SURVEY',         // past interview, survey owed
  DONE: 'DONE',
};

const TIER_RANK = {
  TODAY: 0, CRITICAL: 1, IMMINENT: 2, SURVEY: 3, AT_RISK: 4, BEHIND: 5, SOON: 6, ON_TRACK: 7, DONE: 8,
};

function urgencyTier(row) {
  if (row.stage === STAGE.COMPLETE) return TIER.DONE;
  if (row.stage === STAGE.AWAITING_SURVEY) return TIER.SURVEY;
  if (row.days === 0) return TIER.TODAY;
  const r = row.readiness;
  if (row.days <= 2) return r < 0.6 ? TIER.CRITICAL : TIER.IMMINENT;
  if (row.days <= 5) return r < 0.5 ? TIER.AT_RISK : TIER.SOON;
  return r < 0.4 ? TIER.BEHIND : TIER.ON_TRACK;
}

// ---- normalize one CCPP row ------------------------------------------------
function normalize(raw) {
  const row = {
    id: num(raw.LogInterviewID),
    candidateId: num(raw.CandidateID),
    student: (raw.Applicant || '').trim(),
    company: (raw.Company_name || '').trim(),
    jobTitle: (raw.Job_Title || '').trim(),
    jobDesc: (raw.Job_Description || '').trim(),
    type: (raw.InterviewType || '').trim() || 'Interview',
    interviewISO: raw.InterviewDate ? new Date(raw.InterviewDate).toISOString() : null,
    days: raw.NoofDays == null ? 0 : Math.trunc(Number(raw.NoofDays)),
    prepScore: Math.round(num(raw.Preparationscore)),
    autoMocks: num(raw.AutoInterviewsCount),
    mentorMocks: num(raw.MentorInterviewsCount),
    autoScoreAvg: raw.AutoMocks_Overall_score_AVG == null ? null : num(raw.AutoMocks_Overall_score_AVG),
    mentor: (raw.Mentor || '').trim(),
    mentorEmail: (raw.MentorEmail || '').trim(),
    recruiter: `${(raw.Recruiter_First_Name || '').trim()} ${(raw.Recruiter_Last_Name || '').trim()}`.trim(),
    recruiterEmail: (raw.Recruiter_Email_Address || '').trim(),
    hasSurvey: raw.SurveyResponse != null && String(raw.SurveyResponse).trim() !== '',
  };
  row.readiness = readiness(row);
  row.readinessPct = Math.round(row.readiness * 100);
  row.stage = funnelStage(row);
  row.tier = urgencyTier(row);
  row.next = nextStep(row);
  return row;
}

// ---- priority sort ---------------------------------------------------------
// Manager view: today first, then nearest interviews with the LEAST prep first
// (those are where a nudge changes the outcome), then survey-owed by how long
// they have been waiting, then the rest.
function byPriority(a, b) {
  if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
  if (a.tier === TIER.SURVEY) return a.days - b.days;           // most negative (longest waiting) first
  if (a.days !== b.days) return a.days - b.days;                 // sooner first
  return a.readiness - b.readiness;                              // least prepared first
}

// ---- top-level classify ----------------------------------------------------
function classify(rawRows, now = new Date()) {
  const rows = (rawRows || []).map(normalize).sort(byPriority);

  const upcoming = rows.filter((r) => r.days >= 0 && r.stage !== STAGE.COMPLETE);
  const awaitingSurvey = rows.filter((r) => r.stage === STAGE.AWAITING_SURVEY);
  const today = rows.filter((r) => r.tier === TIER.TODAY);
  const critical = rows.filter((r) => r.tier === TIER.CRITICAL || r.tier === TIER.TODAY);
  const atRisk = upcoming.filter((r) => r.readiness < 0.5);

  const students = Array.from(new Set(rows.map((r) => r.student).filter(Boolean)));
  const mentors = Array.from(new Set(rows.map((r) => r.mentor).filter(Boolean)));

  const avgPrepUpcoming = upcoming.length
    ? Math.round(upcoming.reduce((s, r) => s + r.prepScore, 0) / upcoming.length) : 0;
  const avgReadinessUpcoming = upcoming.length
    ? Math.round((upcoming.reduce((s, r) => s + r.readiness, 0) / upcoming.length) * 100) : 0;

  // scatter: X = days to interview (negative = past/survey-owed), Y = readiness%
  const scatter = rows
    .filter((r) => r.stage !== STAGE.COMPLETE)
    .map((r) => ({ x: r.days, y: r.readinessPct, tier: r.tier, student: r.student, company: r.company }));

  // per-mentor rollup (coaching load + how prepared their students are)
  const mentorMap = {};
  rows.filter((r) => r.stage !== STAGE.COMPLETE).forEach((r) => {
    const key = r.mentor || 'Unassigned';
    mentorMap[key] = mentorMap[key] || { mentor: key, email: r.mentorEmail, count: 0, readinessSum: 0, critical: 0, surveyOwed: 0 };
    mentorMap[key].count++;
    mentorMap[key].readinessSum += r.readiness;
    if (r.tier === TIER.CRITICAL || r.tier === TIER.TODAY) mentorMap[key].critical++;
    if (r.tier === TIER.SURVEY) mentorMap[key].surveyOwed++;
  });
  const mentorRollup = Object.values(mentorMap)
    .map((m) => ({ ...m, avgReadiness: Math.round((m.readinessSum / Math.max(1, m.count)) * 100) }))
    .sort((a, b) => b.critical - a.critical || b.count - a.count);

  return {
    runAt: now,
    rows,
    upcoming,
    awaitingSurvey,
    today,
    critical,
    atRisk,
    scatter,
    mentorRollup,
    kpis: {
      totalActive: rows.filter((r) => r.stage !== STAGE.COMPLETE).length,
      upcomingCount: upcoming.length,
      todayCount: today.length,
      criticalCount: critical.length,
      atRiskCount: atRisk.length,
      surveyOwedCount: awaitingSurvey.length,
      studentsCount: students.length,
      mentorsCount: mentors.length,
      avgPrepUpcoming,
      avgReadinessUpcoming,
    },
  };
}

module.exports = {
  classify, normalize, readiness, funnelStage, urgencyTier, nextStep, byPriority,
  STAGE, TIER, TIER_RANK,
};
