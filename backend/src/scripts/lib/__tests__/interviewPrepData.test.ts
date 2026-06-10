/* eslint-disable */
// Unit tests for the interview-prep classifier (pure, deterministic).
// Covers happy path, the day/readiness tier boundaries, the survey funnel, and
// determinism (same input -> same output). The classifier is the contract the
// report and the nudge engine both depend on, so it must not drift silently.

const { classify, normalize, STAGE, TIER } = require('../interviewPrepData');

function raw(over: any = {}) {
  return {
    LogInterviewID: 1, CandidateID: 100, Applicant: 'Test Student',
    Company_name: 'Acme', Job_Title: 'BI Dev', InterviewType: 'Technical',
    InterviewDate: '2026-06-15T00:00:00', NoofDays: 5, Preparationscore: 0,
    AutoInterviewsCount: 0, MentorInterviewsCount: 0, AutoMocks_Overall_score_AVG: null,
    Mentor: 'Pierre Ehe', MentorEmail: 'p@x.com', SurveyResponse: null, ...over,
  };
}

describe('interviewPrepData.normalize — funnel stage', () => {
  it('NOT_STARTED when upcoming with zero prep activity', () => {
    expect(normalize(raw({ NoofDays: 5 })).stage).toBe(STAGE.NOT_STARTED);
  });
  it('PRACTICING after one auto mock', () => {
    expect(normalize(raw({ NoofDays: 5, AutoInterviewsCount: 1 })).stage).toBe(STAGE.PRACTICING);
  });
  it('AUTO_READY at two auto mocks', () => {
    expect(normalize(raw({ NoofDays: 5, AutoInterviewsCount: 2 })).stage).toBe(STAGE.AUTO_READY);
  });
  it('MENTOR_DONE once the mentor mock is logged', () => {
    expect(normalize(raw({ NoofDays: 5, AutoInterviewsCount: 2, MentorInterviewsCount: 1 })).stage).toBe(STAGE.MENTOR_DONE);
  });
  it('TODAY when NoofDays is 0', () => {
    expect(normalize(raw({ NoofDays: 0 })).stage).toBe(STAGE.TODAY);
  });
  it('AWAITING_SURVEY when past and no survey', () => {
    expect(normalize(raw({ NoofDays: -2, SurveyResponse: null })).stage).toBe(STAGE.AWAITING_SURVEY);
  });
  it('COMPLETE when past and survey on file', () => {
    expect(normalize(raw({ NoofDays: -2, SurveyResponse: 'Yes it went well' })).stage).toBe(STAGE.COMPLETE);
  });
});

describe('interviewPrepData.normalize — urgency tier boundaries', () => {
  it('CRITICAL: <=2 days out and under-prepared', () => {
    expect(normalize(raw({ NoofDays: 2, Preparationscore: 0 })).tier).toBe(TIER.CRITICAL);
  });
  it('IMMINENT: <=2 days out but well prepared', () => {
    const r = normalize(raw({ NoofDays: 2, Preparationscore: 100, AutoInterviewsCount: 3, MentorInterviewsCount: 1 }));
    expect(r.readinessPct).toBe(100);
    expect(r.tier).toBe(TIER.IMMINENT);
  });
  it('AT_RISK: 3-5 days out and behind', () => {
    expect(normalize(raw({ NoofDays: 4, Preparationscore: 0 })).tier).toBe(TIER.AT_RISK);
  });
  it('SURVEY: past interview with no survey', () => {
    expect(normalize(raw({ NoofDays: -3, SurveyResponse: null })).tier).toBe(TIER.SURVEY);
  });
});

describe('interviewPrepData.classify — aggregation + ordering', () => {
  const rows = [
    raw({ LogInterviewID: 1, NoofDays: 7, Preparationscore: 0 }),               // BEHIND
    raw({ LogInterviewID: 2, NoofDays: 0 }),                                     // TODAY
    raw({ LogInterviewID: 3, NoofDays: 1, Preparationscore: 0 }),               // CRITICAL
    raw({ LogInterviewID: 4, NoofDays: -5, SurveyResponse: null }),             // SURVEY
    raw({ LogInterviewID: 5, NoofDays: -1, SurveyResponse: 'done' }),           // COMPLETE
  ];
  const data = classify(rows, new Date('2026-06-10T12:00:00Z'));

  it('counts today, critical, and survey-owed', () => {
    expect(data.kpis.todayCount).toBe(1);
    expect(data.kpis.surveyOwedCount).toBe(1);
    expect(data.kpis.criticalCount).toBeGreaterThanOrEqual(2); // today + critical
  });
  it('orders today first, then critical, then survey', () => {
    const order = data.rows.filter((r: any) => r.stage !== STAGE.COMPLETE).map((r: any) => r.tier);
    expect(order[0]).toBe(TIER.TODAY);
    expect(order.indexOf(TIER.CRITICAL)).toBeLessThan(order.indexOf(TIER.SURVEY));
  });
  it('excludes COMPLETE from the active/scatter set', () => {
    expect(data.scatter.find((p: any) => p.y === undefined)).toBeUndefined();
    expect(data.rows.length).toBe(5);
    expect(data.upcoming.every((r: any) => r.stage !== STAGE.COMPLETE)).toBe(true);
  });
  it('is deterministic — same input yields identical KPIs', () => {
    const again = classify(rows, new Date('2026-06-10T12:00:00Z'));
    expect(again.kpis).toEqual(data.kpis);
  });
});
