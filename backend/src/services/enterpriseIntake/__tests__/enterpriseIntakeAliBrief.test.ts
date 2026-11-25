const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockUpdate = jest.fn();
const mockRecord = jest.fn();
const mockSend = jest.fn();

jest.mock('../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai' } }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a), findAll: (...a: any[]) => mockFindAll(...a), update: (...a: any[]) => mockUpdate(...a) },
}));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockRecord(...a) } }));
const mockDemoView = jest.fn();
jest.mock('../enterpriseIntakeDemo', () => ({ clientDemoView: (...a: any[]) => mockDemoView(...a) }));
jest.mock('../enterpriseIntakeEmails', () => ({ sendAliBrief: (s: string, h: string) => mockSend(s, h) }));

import { FREE_WORD_RULE } from '../../content/bannedCopyRule';
import { MAX_BRIEF_ATTEMPTS, briefSubject, buildAliBriefHtml, daysAway, resetSentForTest, sendAliBriefOnce, syncAliBriefs } from '../enterpriseIntakeAliBrief';

const NOW = new Date('2026-11-21T16:00:00Z'); // Saturday 10:00 AM CT
const MEETING = new Date('2026-11-23T15:00:00Z'); // Monday 9:00 AM CT

function intake(over: Record<string, any> = {}): any {
  return {
    id: 'i-1', full_name: 'Pat Doe', role: 'COO', company: 'Acme Logistics', email: 'pat@acme.com', phone: '+15555550100',
    website: 'acme.com', service: 'Build', department: 'Operations', start_timing: 'This quarter', other_deciders: 'CFO',
    process: 'We re-key orders from email into McLeod.', people_count: 4, hours_per_week: 20, required_return: 'Hours back',
    meeting_start: MEETING, meeting_end: new Date('2026-11-23T15:30:00Z'), meeting_link: 'https://meet.google.com/abc',
    interviewed_at: new Date('2026-11-21T15:00:00Z'), interviewed_via: 'chat', interview_mode: 'now', interview_scheduled_for: null,
    researched_at: new Date('2026-11-21T15:05:00Z'), understanding_id: 'u-1',
    research: { summary: 'Acme moves freight.', industry: 'Logistics', size_signals: 'not stated', systems: ['McLeod'], open_questions: ['Who approves?'],
      news: [{ headline: 'Acme opens Dallas hub', date: '2026-10-01', why_it_matters: 'More orders.' }], ai_trends: [] },
    pilot_options: [
      { title: 'Order intake agent', service: 'Build', what_it_does: 'Reads order emails.', first_step: 'Pull 50 emails.', roi: { share_low: 30, share_high: 50, hours_low: 312, hours_high: 520 } },
      { title: 'Coaching', service: 'Train', what_it_does: 'Teaches review.', first_step: 'One workshop.', roi: { share_low: 5, share_high: 10, hours_low: 52, hours_high: 104 } },
    ],
    client_files: [{ name: 'Q3 plan.pdf', size: 20480 }],
    ali_brief_sent_at: null, ali_brief_claimed_at: null, ali_brief_attempts: 0, lost_at: null, signed_at: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSentForTest();
  mockUpdate.mockResolvedValue([1]);
  mockRecord.mockResolvedValue({ items: [{ dimension: 'systems', value: 'McLeod TMS' }] });
  mockSend.mockResolvedValue(undefined);
  mockDemoView.mockResolvedValue({ state: 'ready', message: 'The Command Center and demo are ready to show.', commandCenterUrl: 'https://enterprise.colaberry.ai/api/platform-view/SECRET/', demoUrl: 'https://enterprise.colaberry.ai/api/platform-view/SECRET/demo/', linkExpiresAt: 'T' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the brief', () => {
  const html = () => buildAliBriefHtml({ intake: intake(), facts: [{ dimension: 'systems', value: 'McLeod TMS' }], now: NOW, adminUrl: 'https://enterprise.colaberry.ai/admin/enterprise-clients/i-1' });

  it('leads with the meeting date in Central time, before anything else', () => {
    const h = html();
    const hero = h.indexOf('Monday');
    expect(hero).toBeGreaterThan(-1);
    expect(h).toContain('November 23, 2026');
    expect(h).toContain('9:00 AM Central, 30 minutes');
    expect(h).toContain('in 2 days');
    expect(h).toContain('href="https://meet.google.com/abc"');
    expect(hero).toBeLessThan(h.indexOf('The client'));
  });

  it('shows the numbers, interview facts, files, news and options ranked by return', () => {
    const h = html();
    expect(h).toContain('1,040 hours a year');
    expect(h).toContain('McLeod TMS');
    expect(h).toContain('Q3 plan.pdf');
    expect(h).toContain('Acme opens Dallas hub');
    expect(h.indexOf('Order intake agent')).toBeLessThan(h.indexOf('Coaching'));
    expect(h).toContain('about 312 to 520 hours a year');
    expect(h).toContain('/admin/enterprise-clients/i-1');
  });

  it('flags a missing interview in red', () => {
    const h = buildAliBriefHtml({ intake: intake({ interviewed_at: null, researched_at: null, interview_mode: 'later', interview_scheduled_for: new Date('2026-11-22T20:00:00Z') }), facts: [], now: NOW, adminUrl: 'x' });
    expect(h).toContain('AI interview NOT done yet (scheduled Sunday, November 22 at 2:00 PM Central)');
    expect(h).toContain('No interview yet');
    expect(h).toContain('Not ready yet');
  });

  it('escapes client text and keeps the copy rules', () => {
    const h = buildAliBriefHtml({ intake: intake({ company: '<script>x</script>', process: 'A — B' }), facts: [], now: NOW, adminUrl: 'x' });
    expect(h).not.toContain('<script>x');
    expect(h).toContain('&lt;script&gt;');
    expect(h).not.toMatch(/[–—]/);
    expect(buildAliBriefHtml({ intake: intake(), facts: [], now: NOW, adminUrl: 'x' })).not.toMatch(new RegExp(`\\b${FREE_WORD_RULE.word}\\b`, 'i'));
  });

  it('subject names the day, time and client', () => {
    expect(briefSubject(intake())).toBe('Pilot meeting Mon, Nov 23, 9:00 AM CT: Acme Logistics (Pat Doe)');
  });

  it('days away in Central calendar days', () => {
    expect(daysAway(MEETING, new Date('2026-11-23T06:00:00Z'))).toBe('today');
    expect(daysAway(MEETING, new Date('2026-11-22T16:00:00Z'))).toBe('tomorrow');
    expect(daysAway(MEETING, NOW)).toBe('in 2 days');
  });
});

describe('L13.7: the demo in the brief', () => {
  it('says it is ready, links to Admin, and never carries a demo link', async () => {
    mockFindByPk.mockResolvedValue(intake());
    await sendAliBriefOnce('i-1', NOW);
    const h = mockSend.mock.calls[0][1];
    expect(h).toContain('Demo ready');
    expect(h).toContain('The Command Center and demo are ready to show.');
    expect(h).toContain('/admin/enterprise-clients/i-1');
    expect(h).not.toContain('platform-view');
    expect(h).not.toContain('SECRET');
  });

  it.each([['building', 'Demo not ready yet'], ['unknown', 'Demo not ready yet'], ['failed', 'Demo NOT ready'], ['refused', 'Demo NOT ready']])('%s reads as %s', (state, label) => {
    const h = buildAliBriefHtml({ intake: intake(), facts: [], now: NOW, adminUrl: 'x', demo: { state: state as any, message: 'Why <b>' } });
    expect(h).toContain(label);
    expect(h).toContain('Why &lt;b&gt;');
    expect(h).not.toContain('Demo ready');
  });
});

describe('sendAliBriefOnce', () => {
  it('sends once research is done and a meeting is booked, then marks it sent', async () => {
    mockFindByPk.mockResolvedValue(intake());
    expect(await sendAliBriefOnce('i-1', NOW)).toBe('sent');
    expect(mockSend).toHaveBeenCalledWith('Pilot meeting Mon, Nov 23, 9:00 AM CT: Acme Logistics (Pat Doe)', expect.stringContaining('McLeod TMS'));
    expect(mockUpdate.mock.calls[0][0]).toEqual({ ali_brief_claimed_at: NOW, ali_brief_attempts: 1 });
    expect(mockUpdate).toHaveBeenLastCalledWith({ ali_brief_sent_at: NOW }, { where: { id: 'i-1' } });
  });

  it('waits for the research, unless the meeting is within 24 hours', async () => {
    mockFindByPk.mockResolvedValue(intake({ researched_at: null }));
    expect(await sendAliBriefOnce('i-1', NOW)).toBe('not_due');
    expect(await sendAliBriefOnce('i-1', new Date('2026-11-22T16:00:00Z'))).toBe('sent');
  });

  it('never for no meeting, a sent brief, a past meeting, or a closed client', async () => {
    for (const over of [{ meeting_start: null }, { ali_brief_sent_at: NOW }, { meeting_start: new Date('2026-11-20T15:00:00Z') }, { lost_at: NOW }, { signed_at: NOW }]) {
      mockFindByPk.mockResolvedValue(intake(over));
      expect(await sendAliBriefOnce('i-1', NOW)).toBe('not_due');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a second sweep whose claim loses sends nothing', async () => {
    mockFindByPk.mockResolvedValue(intake());
    mockUpdate.mockResolvedValueOnce([0]);
    expect(await sendAliBriefOnce('i-1', NOW)).toBe('claimed_elsewhere');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it(`a failure releases the claim; the ${MAX_BRIEF_ATTEMPTS}rd is dead-lettered and never retried`, async () => {
    mockSend.mockRejectedValue(new Error('smtp down'));
    mockFindByPk.mockResolvedValue(intake());
    expect(await sendAliBriefOnce('i-1', NOW)).toBe('failed');
    expect(mockUpdate).toHaveBeenLastCalledWith({ ali_brief_claimed_at: null }, { where: { id: 'i-1', ali_brief_sent_at: null } });
    mockFindByPk.mockResolvedValue(intake({ ali_brief_attempts: MAX_BRIEF_ATTEMPTS - 1 }));
    await sendAliBriefOnce('i-1', NOW);
    expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('enterprise_intake_dead_letter'))).toBe(true);
    mockFindByPk.mockResolvedValue(intake({ ali_brief_attempts: MAX_BRIEF_ATTEMPTS }));
    mockSend.mockClear();
    expect(await sendAliBriefOnce('i-1', NOW)).toBe('not_due');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('once the email is out, a failed sent_at write never releases the claim and never resends', async () => {
    jest.useFakeTimers();
    try {
      mockFindByPk.mockResolvedValue(intake());
      mockUpdate.mockImplementation(async (values: any) => {
        if (values.ali_brief_sent_at) throw new Error('db blip');
        return [1];
      });
      const p = sendAliBriefOnce('i-1', NOW);
      await jest.runAllTimersAsync();
      expect(await p).toBe('sent');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockUpdate.mock.calls.some((c) => 'ali_brief_claimed_at' in c[0] && c[0].ali_brief_claimed_at === null)).toBe(false);
      expect(mockUpdate.mock.calls.filter((c) => c[0].ali_brief_sent_at).length).toBe(3);
      expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('ali_brief_mark_sent'))).toBe(true);
      // The next sweep sees the row unchanged (sent_at still null), and still does not send.
      expect(await sendAliBriefOnce('i-1', NOW)).toBe('not_due');
      expect(mockSend).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the sweep visits upcoming booked meetings without a brief', async () => {
    mockFindAll.mockResolvedValue([{ id: 'i-1' }]);
    mockFindByPk.mockResolvedValue(intake());
    expect(await syncAliBriefs(20, NOW)).toEqual({ sent: 1, failed: 0 });
    expect(mockFindAll.mock.calls[0][0].where).toMatchObject({ ali_brief_sent_at: null, lost_at: null, signed_at: null });
  });
});
