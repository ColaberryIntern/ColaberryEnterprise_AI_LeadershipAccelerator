/**
 * W30 (Phase 3): "we research your company and draft options before we meet." The AI reads
 * their site, writes a brief, 2-3 pilot options and a DRAFT email. Nothing is sent from here.
 */
const mockEnv: Record<string, unknown> = {};
const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockStaticUpdate = jest.fn();
const mockRecordFind = jest.fn();
const mockChat = jest.fn();
const mockFetchPage = jest.fn();
const mockBcPost = jest.fn();
const mockTick = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockFindByPk(...a),
    findAll: (...a: any[]) => mockFindAll(...a),
    update: (...a: any[]) => mockStaticUpdate(...a),
  },
}));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockRecordFind(...a) } }));
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChat(...a) }));
jest.mock('../companySiteFetch', () => ({ fetchCompanyPage: (...a: any[]) => mockFetchPage(...a) }));
jest.mock('../../ops/basecampClient', () => ({ bcPost: (...a: any[]) => mockBcPost(...a), bcGet: jest.fn(), bcGetAll: jest.fn() }));
jest.mock('../enterpriseIntakeBasecamp', () => ({
  esc: (v: unknown) => String(v ?? '').replace(/</g, '&lt;'),
  intakeBasecampEnabled: () => Boolean(mockEnv.enterpriseIntakeBcProjectId),
  tickStep: (...a: any[]) => mockTick(...a),
}));
const mockNews = jest.fn();
const mockBriefSoon = jest.fn();
jest.mock('../enterpriseIntakeAliBrief', () => ({ aliBriefSoon: (id: string) => mockBriefSoon(id) }));
jest.mock('../enterpriseIntakeNews', () => ({
  ...jest.requireActual('../enterpriseIntakeNews'),
  companyAndIndustryNews: (...a: any[]) => mockNews(...a),
}));
jest.mock('../enterpriseIntakeService', () => ({ writtenBrief: () => 'Company: Acme Logistics\nProcess to start with:\nRe-keying orders' }));

/* eslint-disable import/first */
import { MAX_RESEARCH_ATTEMPTS, cleanNews, postResearchToList, researchHtml, researchIntake, researchSoon, ruleBreaks, siteFor } from '../enterpriseIntakeResearch';
/* eslint-enable import/first */

const GOOD = {
  research: { summary: 'Acme moves freight across the Midwest.', industry: 'Logistics', size_signals: 'not stated', systems: ['McLeod TMS'], open_questions: ['Who approves rebills?'] },
  options: [
    { title: 'Order intake agent', service: 'Build', what_it_does: 'Reads order emails into McLeod.', success_measure: 'Fewer of the 20 hours a week spent re-keying.', first_step: 'Pull 50 sample emails.', why_this_fits: 'It is the process they named.' },
    { title: 'Dispatcher AI coaching', service: 'Train', what_it_does: 'Teaches the team to check AI output.', success_measure: 'Team reviews flagged orders only.', first_step: 'One workshop.', why_this_fits: 'They want a person checking.' },
  ],
  email: { subject: 'Your pilot options, Acme', body: 'Hi Dana,\n\nThank you for the interview. Two options:\n1. Order intake agent\n2. Dispatcher coaching\n\nCould we take 30 minutes this week?' },
};

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'i-1', full_name: 'Dana Reyes', role: 'COO', company: 'Acme Logistics', email: 'dana@acme.test', website: '',
    understanding_id: 'u-1', researched_at: null, research_attempts: 0, bc_todolist_id: '101', bc_checklist_ready_at: new Date(),
    bc_research_posted_at: null, research: null, pilot_options: null, options_email_subject: null, options_email_body: null,
    ...over,
  };
  r.update = jest.fn(async (p: any) => Object.assign(r, p));
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, { enterpriseIntakeBcProjectId: '49670056' });
  mockRecordFind.mockResolvedValue({ items: [{ dimension: 'systems', value: 'McLeod TMS.' }] });
  mockFetchPage.mockResolvedValue({ url: 'https://acme.test/', title: 'Acme', description: 'Freight', text: 'We move freight.' });
  mockChat.mockResolvedValue({ parsed: GOOD });
  mockNews.mockResolvedValue({ company: [], industry: [], industryQuery: 'freight artificial intelligence' });
  mockTick.mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('which site we read', () => {
  it('uses what they typed, else their work domain, never a webmail domain', () => {
    expect(siteFor({ website: 'acme.com', email: 'x@other.com' })).toBe('acme.com');
    expect(siteFor({ website: '', email: 'dana@acme.test' })).toBe('acme.test');
    expect(siteFor({ website: '', email: 'dana@gmail.com' })).toBeNull();
  });
});

describe('the homework', () => {
  it('reads the site, writes the brief, options and draft email, and stores them', async () => {
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    expect(await researchIntake('i-1')).toBe('researched');
    expect(mockFetchPage).toHaveBeenCalledWith('acme.test');
    const prompt = mockChat.mock.calls[0][2];
    expect(prompt).toContain('[systems] McLeod TMS.');
    expect(prompt).toContain('We move freight.');
    expect(mockChat.mock.calls[0][1]).toMatch(/Never state a price, never use the word "free"/);
    // The attempt is counted BEFORE the model is called.
    expect(intake.update.mock.calls[0][0]).toEqual({ research_attempts: 1 });
    expect(intake.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        research: expect.objectContaining({ summary: GOOD.research.summary, site: 'https://acme.test/' }),
        pilot_options: GOOD.options.map((o) => expect.objectContaining({ ...o, roi: expect.any(Object) })),
        options_email_subject: GOOD.email.subject,
        researched_at: expect.any(Date),
      }),
    );
  });

  it('v2: gives the model the fetched headlines and keeps only those it copied exactly, with the feed date', async () => {
    mockNews.mockResolvedValue({
      company: [{ headline: 'Acme Logistics opens Dallas hub', date: '2026-10-01', url: 'https://news.example/1' }],
      industry: [{ headline: 'AI cuts freight paperwork', date: '2026-09-15', url: 'https://news.example/2' }],
      industryQuery: 'freight artificial intelligence',
    });
    mockChat.mockResolvedValue({ parsed: { ...GOOD, research: { ...GOOD.research,
      news: [{ headline: 'acme logistics opens dallas hub', why_it_matters: 'More volume to re-key.' }, { headline: 'Acme wins $50M contract', why_it_matters: 'Invented.' }],
      ai_trends: [{ headline: 'AI cuts freight paperwork', why_it_matters: 'Peers — automate this.' }] } } });
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    expect(await researchIntake('i-1')).toBe('researched');
    const prompt = mockChat.mock.calls[0][2];
    expect(prompt).toContain('- Acme Logistics opens Dallas hub (2026-10-01)');
    expect(prompt).toContain('INDUSTRY AI NEWS (searched: freight artificial intelligence)');
    const saved = intake.update.mock.calls.at(-1)[0].research;
    expect(saved.news).toEqual([{ headline: 'Acme Logistics opens Dallas hub', why_it_matters: 'More volume to re-key.', date: '2026-10-01', url: 'https://news.example/1' }]);
    expect(saved.ai_trends[0].why_it_matters).toBe('Peers - automate this.');
  });

  it('v2: ranks the options by potential return from their own hours', async () => {
    mockChat.mockResolvedValue({ parsed: { ...GOOD, options: [
      { ...GOOD.options[1], share_low: 5, share_high: 10 },
      { ...GOOD.options[0], share_low: 30, share_high: 50 },
    ] } });
    const intake = row({ hours_per_week: 20 });
    mockFindByPk.mockResolvedValue(intake);
    await researchIntake('i-1');
    const opts = intake.update.mock.calls.at(-1)[0].pilot_options;
    expect(opts.map((o: any) => o.title)).toEqual(['Order intake agent', 'Dispatcher AI coaching']);
    expect(opts[0].roi).toEqual({ share_low: 30, share_high: 50, hours_low: 312, hours_high: 520 });
  });

  it("v2: finished research tries Ali's brief (it sends only if a meeting is booked)", async () => {
    mockFindByPk.mockResolvedValue(row());
    researchSoon('i-1');
    for (let n = 0; n < 10 && !mockBriefSoon.mock.calls.length; n++) await new Promise((r) => setTimeout(r, 5));
    expect(mockBriefSoon).toHaveBeenCalledWith('i-1');
  });

  it('v2: a news outage does not stop the research', async () => {
    mockNews.mockResolvedValue({ company: [], industry: [], industryQuery: 'x' });
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    expect(await researchIntake('i-1')).toBe('researched');
    expect(mockChat.mock.calls[0][2]).toContain('COMPANY NEWS (last 6 months):\nnone found');
  });

  it('v2: the draft email confirms a booked meeting instead of asking for one', async () => {
    const intake = row({ meeting_start: new Date('2026-11-23T15:00:00Z') });
    mockFindByPk.mockResolvedValue(intake);
    await researchIntake('i-1');
    expect(mockChat.mock.calls[0][2]).toContain('MEETING: Monday, November 23 at 9:00 AM Central');
    expect(mockChat.mock.calls[0][1]).toMatch(/If MEETING shows a booked time/);
  });

  it('still works with no website, and says so to the model', async () => {
    mockFindByPk.mockResolvedValue(row({ email: 'dana@gmail.com' }));
    expect(await researchIntake('i-1')).toBe('researched');
    expect(mockFetchPage).not.toHaveBeenCalled();
    expect(mockChat.mock.calls[0][2]).toContain('No website could be read.');
  });

  it.each([
    ['a price', { ...GOOD, email: { ...GOOD.email, body: 'It costs $5,000.' } }],
    ['the word "free"', { ...GOOD, email: { ...GOOD.email, body: 'A free pilot.' } }],
    ['an em or en dash', { ...GOOD, email: { ...GOOD.email, body: 'Options — two.' } }],
    ['a link', { ...GOOD, email: { ...GOOD.email, body: 'See www.acme-scam.com for details.' } }],
  ])('refuses a reply with %s and stores nothing', async (_why, bad) => {
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    mockChat.mockResolvedValue({ parsed: bad });
    expect(await researchIntake('i-1')).toBe('rejected');
    expect(intake.update).toHaveBeenCalledTimes(1); // only the attempt counter
  });

  it('refuses a reply of the wrong shape (one option only)', async () => {
    mockFindByPk.mockResolvedValue(row());
    mockChat.mockResolvedValue({ parsed: { ...GOOD, options: [GOOD.options[0]] } });
    expect(await researchIntake('i-1')).toBe('rejected');
  });

  it('gives up after the attempt cap, and never runs before the interview', async () => {
    mockFindByPk.mockResolvedValue(row({ research_attempts: MAX_RESEARCH_ATTEMPTS }));
    expect(await researchIntake('i-1')).toBe('gave_up');
    mockFindByPk.mockResolvedValue(row({ understanding_id: null }));
    expect(await researchIntake('i-1')).toBe('not_ready');
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('a model failure is recorded, not thrown', async () => {
    mockFindByPk.mockResolvedValue(row());
    mockChat.mockRejectedValue(new Error('429'));
    expect(await researchIntake('i-1')).toBe('failed');
  });

  it('v2: an ROI figure in the client email is a rule break, and that draft is not saved', async () => {
    const leaky = { ...GOOD, email: { ...GOOD.email, body: 'Option 1 could take back 30-50% of your 1,040 hours a year.' } };
    expect(ruleBreaks(leaky as any)).toEqual(['an ROI figure (percent or hours) in the email']);
    expect(ruleBreaks({ ...GOOD, email: { ...GOOD.email, body: 'About 520 hours back.' } } as any)).toEqual(['an ROI figure (percent or hours) in the email']);
    mockChat.mockResolvedValue({ parsed: leaky });
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    expect(await researchIntake('i-1')).toBe('rejected');
    expect(intake.update).toHaveBeenCalledTimes(1); // only the attempt counter
  });

  it('v2: shares are clamped to whole percents 0-80 instead of rejecting the research', async () => {
    mockChat.mockResolvedValue({ parsed: { ...GOOD, options: [{ ...GOOD.options[0], share_low: '12.6', share_high: 95 }, { ...GOOD.options[1], share_low: -5 }] } });
    const intake = row({ hours_per_week: 10 });
    mockFindByPk.mockResolvedValue(intake);
    expect(await researchIntake('i-1')).toBe('researched');
    const [a, b] = intake.update.mock.calls.at(-1)[0].pilot_options;
    expect([a.share_low, a.share_high, a.roi.share_high]).toEqual([13, 80, 80]);
    expect(b.share_low).toBe(0);
  });

  it('v2: news may quote money and dashes; the banned word drops that item only', () => {
    const withNews = { ...GOOD, research: { ...GOOD.research, news: [{ headline: 'Acme raises $5M — report', why_it_matters: 'x' }], ai_trends: [] } };
    expect(ruleBreaks(withNews as any)).toEqual([]);
    expect(cleanNews([{ headline: 'Free shipping for all', why_it_matters: 'x' }, { headline: 'Acme – hub', why_it_matters: 'y' }]))
      .toEqual([{ headline: 'Acme - hub', why_it_matters: 'y' }]);
  });

  it('flags every banned thing it finds', () => {
    expect(ruleBreaks(GOOD as any)).toEqual([]);
    expect(ruleBreaks({ ...GOOD, email: { subject: 'Guaranteed results', body: 'Free, $10' } } as any)).toEqual(['the word "free"', 'a price', 'a guarantee']);
  });
});

describe('the research on the list', () => {
  const researched = () =>
    row({ researched_at: new Date(), research: { ...GOOD.research, site: 'https://acme.test/' }, pilot_options: GOOD.options, options_email_subject: GOOD.email.subject, options_email_body: GOOD.email.body });

  it('posts the brief, the options and the draft email (marked not sent) once, then ticks research', async () => {
    mockFindByPk.mockResolvedValue(researched());
    mockStaticUpdate.mockResolvedValue([1]);
    expect(await postResearchToList('i-1')).toBe('posted');
    const [url, body] = mockBcPost.mock.calls[0];
    expect(url).toBe('/buckets/49670056/recordings/101/comments.json');
    expect(body.content).toContain('1. Order intake agent');
    expect(body.content).toContain('Draft email to the client (not sent)');
    expect(mockTick).toHaveBeenCalledWith('49670056', '101', 'research');
  });

  it('records the tick, and retries a tick that failed after the post', async () => {
    const intake = researched();
    mockFindByPk.mockResolvedValue(intake);
    mockStaticUpdate.mockResolvedValue([1]);
    mockTick.mockRejectedValueOnce(new Error('BC 503'));
    expect(await postResearchToList('i-1')).toBe('posted');
    expect(intake.update).not.toHaveBeenCalledWith({ bc_research_ticked_at: expect.any(Date) });
    // Next run: already posted, so only the tick is retried, and recorded once it lands.
    intake.bc_research_posted_at = new Date();
    mockBcPost.mockClear();
    expect(await postResearchToList('i-1')).toBe('ticked');
    expect(mockBcPost).not.toHaveBeenCalled();
    expect(intake.update).toHaveBeenCalledWith({ bc_research_ticked_at: expect.any(Date) });
  });

  it('posts nothing when another caller already claimed it', async () => {
    mockFindByPk.mockResolvedValue(researched());
    mockStaticUpdate.mockResolvedValue([0]);
    expect(await postResearchToList('i-1')).toBe('done');
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('releases the claim when Basecamp fails', async () => {
    mockFindByPk.mockResolvedValue(researched());
    mockStaticUpdate.mockResolvedValue([1]);
    mockBcPost.mockRejectedValue(new Error('503'));
    await expect(postResearchToList('i-1')).rejects.toThrow('503');
    expect(mockStaticUpdate).toHaveBeenLastCalledWith({ bc_research_posted_at: null }, { where: { id: 'i-1' } });
  });

  it('escapes what the model wrote', () => {
    const h = researchHtml({ research: { summary: '<script>x</script>' }, pilot_options: [], options_email_subject: 's', options_email_body: 'b' } as any);
    expect(h).not.toContain('<script>');
  });
});
