import * as fs from 'fs';
import * as path from 'path';

const funnel = { getFunnelSnapshot: jest.fn() };
const hyp = { getHypothesisHealth: jest.fn() };

jest.mock('../funnelStageService', () => ({
  getFunnelSnapshot: (...a: unknown[]) => funnel.getFunnelSnapshot(...a),
}));
jest.mock('../hypothesisHealthService', () => ({
  getHypothesisHealth: (...a: unknown[]) => hyp.getHypothesisHealth(...a),
}));

import {
  buildWeeklyReport,
  assertActivityNeverLeads,
  assertEmptyWeekSaysSo,
  assertNoUnevidencedZero,
} from '../weeklyCommercialReport';
import {
  runWeeklyCommercialReport,
  renderReportText,
  isEnabled,
  ENABLE_FLAG,
  AGENT_NAME,
  WEEKLY_SCHEDULE,
} from '../weeklyCommercialReportJob';

/**
 * C8.8's named failure: "reporting activity instead of outcomes, or reporting a number
 * the funnel cannot evidence."
 *
 * Both bite hardest on an empty week, which is the week production is actually having.
 * There are 48,924 recorded sends and zero accounts, so a report with nothing to say has
 * a very large number within reach. These tests exist to keep it out of the headline.
 */
const stage = (key: string, reached: number | null) => ({
  n: 1, key, label: key, evidence: 'live', accountsAtStage: reached, accountsReached: reached,
});

const EMPTY = {
  target: 0, mapped: 0, contacted: 0, engaged: 0, meeting_booked: 0,
  demo_delivered: null, pilot_proposed: 0, contract: 0, pilot_running: null, expansion: 0,
};

function mock(counts: Record<string, number | null>, dying = 5, caveats: string[] = []) {
  funnel.getFunnelSnapshot.mockResolvedValue({
    asOf: '2026-10-24T00:00:00.000Z',
    stages: Object.entries(counts).map(([k, v]) => stage(k, v)),
    totalAccounts: counts.target ?? 0,
    attributionAvailable: true,
    caveats,
  });
  hyp.getHypothesisHealth.mockResolvedValue({
    asOf: '2026-10-24T00:00:00.000Z',
    hypotheses: Array.from({ length: 5 }, (_, i) => ({
      key: `h${i}`, label: `Hypothesis ${i}`,
      verdict: i < dying ? 'no_evidence' : 'in_flight',
      note: 'The pipe is empty rather than slow.',
    })),
    summary: {}, caveats: [],
  });
}

beforeEach(() => {
  funnel.getFunnelSnapshot.mockReset();
  hyp.getHypothesisHealth.mockReset();
});

describe('an empty week says it was empty', () => {
  it('leads with "nothing moved" rather than with a number that happens to be large', async () => {
    mock(EMPTY);
    const r = await buildWeeklyReport(new Date('2026-10-26T08:15:00Z'));
    expect(r.headline).toMatch(/^Nothing moved in the commercial funnel/);
    expect(() => assertEmptyWeekSaysSo(r)).not.toThrow();
  });

  it('says how many parts moved when something did', async () => {
    mock({ ...EMPTY, target: 4, contacted: 2 });
    const r = await buildWeeklyReport(new Date('2026-10-26T08:15:00Z'));
    expect(r.headline).toMatch(/parts? of the funnel moved/);
  });
});

describe('outcomes lead, activity is subordinate', () => {
  it('opens with an outcome section', async () => {
    mock(EMPTY);
    const r = await buildWeeklyReport();
    expect(r.sections[0].kind).toBe('outcome');
    expect(() => assertActivityNeverLeads(r)).not.toThrow();
  });

  it('puts the activity section last, and labels it as not progress', async () => {
    mock(EMPTY);
    const r = await buildWeeklyReport();
    const activity = r.sections[r.sections.length - 1];
    expect(activity.kind).toBe('activity');
    expect(activity.heading).toMatch(/not progress/i);
    expect(activity.lines.join(' ')).toMatch(/Neither figure is an outcome/);
  });

  it('FAILS the guard if an activity section is ever moved above an outcome', async () => {
    // Prove the guard bites rather than trusting it.
    mock(EMPTY);
    const r = await buildWeeklyReport();
    const scrambled = {
      ...r,
      sections: [r.sections[r.sections.length - 1], ...r.sections.slice(0, -1)],
    };
    expect(() => assertActivityNeverLeads(scrambled)).toThrow(/activity section/);
  });
});

describe('a stage the funnel cannot evidence is never reported as zero', () => {
  it('says "not measurable" for pilots, which have no source at all', async () => {
    mock(EMPTY);
    const r = await buildWeeklyReport();
    const pilots = r.sections.find((s) => s.key === 'pilots')!;
    expect(pilots.lines.join(' ')).toMatch(/Not measurable/);
    expect(pilots.lines.join(' ')).toMatch(/instrumentation gap, not a report of zero/);
    expect(pilots.lines.join(' ')).not.toMatch(/Pilots running: 0/);
  });

  it('passes the unevidenced-zero guard', async () => {
    mock(EMPTY);
    const report = await buildWeeklyReport();
    expect(() => assertNoUnevidencedZero(report)).not.toThrow();
  });

  it('FAILS that guard if a line ever calls something unmeasurable AND reports zero', () => {
    // Prove the guard bites. The two statements are contradictory, and shipping both in
    // one sentence is how an instrumentation gap gets read as a measured result.
    const bad = {
      asOf: '', headline: '', caveats: [],
      sections: [{
        key: 'pilots', heading: 'Pilots', kind: 'outcome' as const, empty: true,
        lines: ['Pilots running: 0 (Not measurable)'],
      }],
    };
    expect(() => assertNoUnevidencedZero(bad)).toThrow(/not measurable/i);
  });

  it('carries the funnel caveats so an unmeasurable line is explainable', async () => {
    mock(EMPTY, 5, ['delivery_contracts is absent.']);
    const r = await buildWeeklyReport();
    expect(r.caveats.join(' ')).toMatch(/delivery_contracts is absent/);
  });
});

describe('the report asks for a decision when one is waiting', () => {
  it('names the dying hypotheses as a decision, and says it is Ali’s', async () => {
    mock(EMPTY, 5);
    const r = await buildWeeklyReport();
    const d = r.sections.find((s) => s.key === 'decisions')!;
    expect(d.lines.join(' ')).toMatch(/5 revenue hypotheses have no evidence/);
    expect(d.lines.join(' ')).toMatch(/it is yours/);
  });

  it('says "none this week" rather than inventing one', async () => {
    mock(EMPTY, 0);
    const r = await buildWeeklyReport();
    expect(r.sections.find((s) => s.key === 'decisions')!.lines).toEqual(['None this week.']);
  });
});

describe('the job sends nothing until Ali approves the recipients', () => {
  it('is disabled by default', () => {
    expect(isEnabled({})).toBe(false);
    expect(isEnabled({ [ENABLE_FLAG]: 'false' })).toBe(false);
    expect(isEnabled({ [ENABLE_FLAG]: 'true' })).toBe(true);
  });

  it('no-ops with the flag unset, and does NOT build or deliver', async () => {
    mock(EMPTY);
    const deliver = jest.fn();
    const r = await runWeeklyCommercialReport({ env: {}, deliver });
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/recipient list is Ali/);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('refuses to send when no recipient has been approved, and does not throw', async () => {
    // Returning rather than throwing matters: a dark job that threw every Monday would
    // fill the cron error log and make a healthy job look broken.
    mock(EMPTY);
    const deliver = jest.fn();
    const r = await runWeeklyCommercialReport({
      env: { [ENABLE_FLAG]: 'true' }, loadRecipients: async () => [], deliver,
    });
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/no approved recipients/);
    expect(deliver).not.toHaveBeenCalled();
    expect(r.report).toBeDefined();
  });

  it('delivers once per approved recipient when switched on', async () => {
    mock(EMPTY);
    const deliver = jest.fn();
    const r = await runWeeklyCommercialReport({
      env: { [ENABLE_FLAG]: 'true' },
      loadRecipients: async () => ['a@x.test', 'b@x.test'],
      deliver,
    });
    expect(r.ran).toBe(true);
    expect(r.recipients).toBe(2);
    expect(deliver).toHaveBeenCalledTimes(1);
    const [recipients, subject, body] = deliver.mock.calls[0];
    expect(recipients).toHaveLength(2);
    expect(subject).toMatch(/Commercialization weekly report/);
    expect(body).toMatch(/Nothing moved/);
  });
});

describe('the rendered text leads with the headline', () => {
  it('puts the headline on the first line', async () => {
    mock(EMPTY);
    const text = renderReportText(await buildWeeklyReport());
    expect(text.split('\n')[0]).toMatch(/^Nothing moved/);
  });

  it('says no figure was typed in by hand', async () => {
    mock(EMPTY);
    expect(renderReportText(await buildWeeklyReport()))
      .toMatch(/No figure in this report was typed in by hand/);
  });
});

describe('it reuses the existing scheduler rather than adding one', () => {
  const scheduler = fs.readFileSync(
    path.join(__dirname, '..', '..', 'aiOpsScheduler.ts'), 'utf8',
  );

  it('registers in the existing registry with the agreed name and schedule', () => {
    expect(scheduler).toContain(`agentName: '${AGENT_NAME}'`);
    expect(scheduler).toContain(`hardcodedSchedule: '${WEEKLY_SCHEDULE}'`);
  });

  it('does not collide with the two existing briefing slots', () => {
    // 6:45 daily and 7:45 weekly already collided once and sent Ali both at once.
    expect(WEEKLY_SCHEDULE).not.toBe('45 6 * * *');
    expect(WEEKLY_SCHEDULE).not.toBe('45 7 * * 1');
  });

  it('adds no second scheduler, which the ticket puts out of scope', () => {
    const job = fs.readFileSync(
      path.join(__dirname, '..', 'weeklyCommercialReportJob.ts'), 'utf8',
    );
    expect(job).not.toMatch(/node-cron|cron\.schedule|setInterval/);
  });

  it('adds no new transport: it goes through the existing chokepoint', () => {
    const job = fs.readFileSync(
      path.join(__dirname, '..', 'weeklyCommercialReportJob.ts'), 'utf8',
    );
    expect(job).toMatch(/guardedSendMail/);
    expect(job).not.toMatch(/nodemailer|createTransport/);
  });
});
