/**
 * W31 (Phase 4): "keep all communications in sync." Every email and call with an open client
 * lands on their list once, with a one-line summary and a Next to-do when one is implied.
 */
const mockEnv: Record<string, unknown> = {};
const mockQuery = jest.fn();
const mockStaticUpdate = jest.fn();
const mockFindAll = jest.fn();
const mockBcPost = jest.fn();
const mockBcPut = jest.fn();
const mockChat = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: {
    sequelize: { query: (...a: any[]) => mockQuery(...a) },
    update: (...a: any[]) => mockStaticUpdate(...a),
    findAll: (...a: any[]) => mockFindAll(...a),
  },
}));
jest.mock('../../ops/basecampClient', () => ({ bcPost: (...a: any[]) => mockBcPost(...a), bcPut: (...a: any[]) => mockBcPut(...a), bcGet: jest.fn(), bcGetAll: jest.fn() }));
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChat(...a) }));
jest.mock('../enterpriseIntakeResearch', () => ({ FREE_MAIL: new Set(['gmail.com']) }));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: {} }));

/* eslint-disable import/first */
import { emailTouches, stageOf, stagedListName, summarizeTouch, syncClient, syncEnterpriseComms, touchHtml } from '../enterpriseIntakeSync';
/* eslint-enable import/first */

const OPENED = new Date('2026-11-20T15:00:00Z');

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'i-1', company: 'Acme Logistics', full_name: 'Dana Reyes', email: 'dana@acme.test', lead_id: 7, call_id: 'call_1',
    bc_todolist_id: '101', bc_checklist_ready_at: new Date(), bc_list_stage: null, understanding_id: 'u-1',
    comms_email_synced_through: null, comms_calls_synced_through: null, createdAt: OPENED, ...over,
  };
  r.update = jest.fn(async (p: any) => Object.assign(r, p));
  return r;
}

const EMAIL_ROW = (n: number, from = 'dana@acme.test') => ({
  from_address: from, from_name: 'Dana Reyes', to_addresses: [{ address: 'ali@colaberry.com' }],
  subject: `Re: pilot ${n}`, body_text: `Body ${n}. Can you send the case study?`, received_at: new Date(OPENED.getTime() + n * 3600_000),
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, { enterpriseIntakeBcProjectId: '49670056', enterpriseIntakeBcOwnerId: '17454835' });
  mockStaticUpdate.mockResolvedValue([1]);
  mockBcPost.mockResolvedValue({ id: 1 });
  mockChat.mockResolvedValue({ parsed: { summary: 'Dana asked for the logistics case study.', next_step: 'Send the case study', due_in_days: 2 } });
  mockQuery.mockImplementation(async (sql: string) => (sql.includes('inbox_emails') ? [EMAIL_ROW(1), EMAIL_ROW(2)] : []));
});

describe('the stage', () => {
  it('reads the furthest step reached', () => {
    expect(stageOf({})).toBe('Form');
    expect(stageOf({ understanding_id: 'u' })).toBe('Interviewed');
    expect(stageOf({ understanding_id: 'u', researched_at: new Date() })).toBe('Options drafted');
    expect(stageOf({ options_email_sent_at: new Date() })).toBe('Options sent');
    expect(stageOf({ proposal_sent_at: new Date() })).toBe('Proposal sent');
    expect(stageOf({ proposal_sent_at: new Date(), signed_at: new Date() })).toBe('Signed');
    expect(stageOf({ signed_at: null, lost_at: new Date() })).toBe('Lost');
    expect(stagedListName(row())).toBe('[Interviewed] Acme Logistics - Dana Reyes');
  });
});

describe('which emails', () => {
  it('reads only the Colaberry work mailbox, by address and company domain, since the form', async () => {
    await emailTouches(row(), OPENED);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("provider = 'gmail_colaberry'");
    expect(sql).toContain(':domainLike');
    expect(opts.replacements).toMatchObject({ since: OPENED, email: 'dana@acme.test', domainLike: '%@acme.test' });
  });

  it('never matches a whole webmail domain', async () => {
    await emailTouches(row({ email: 'dana@gmail.com' }), OPENED);
    expect(mockQuery.mock.calls[0][0]).not.toContain(':domainLike');
  });
});

describe('a touch on the list', () => {
  it('posts each email once with a summary, adds a dated Next to-do for Ali, and moves the watermark first', async () => {
    const i = row();
    const out = await syncClient(i);
    expect(out.emails).toBe(2);
    const comments = mockBcPost.mock.calls.filter(([u]) => u.endsWith('comments.json'));
    expect(comments).toHaveLength(2);
    expect(comments[0][1].content).toContain('Dana asked for the logistics case study.');
    const todos = mockBcPost.mock.calls.filter(([u]) => u.endsWith('todos.json'));
    expect(todos[0][1]).toMatchObject({ content: 'Next: Send the case study', assignee_ids: [17454835], notify: false });
    // Compare-and-set from the old mark to the email's time, before its comment is posted.
    expect(mockStaticUpdate.mock.calls[0]).toEqual([
      { comms_email_synced_through: EMAIL_ROW(1).received_at },
      { where: { id: 'i-1', comms_email_synced_through: null } },
    ]);
    expect(mockStaticUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockBcPost.mock.invocationCallOrder[0]);
    expect(mockStaticUpdate.mock.calls[1][1].where.comms_email_synced_through).toEqual(EMAIL_ROW(1).received_at);
    // And the list now shows the stage.
    expect(mockBcPut).toHaveBeenCalledWith('/buckets/49670056/todolists/101.json', { name: '[Interviewed] Acme Logistics - Dana Reyes' });
  });

  it('posts nothing when another run already moved the watermark', async () => {
    mockStaticUpdate.mockResolvedValue([0]);
    expect((await syncClient(row({ bc_list_stage: 'Interviewed' }))).emails).toBe(0);
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('gives the touch back when Basecamp fails, so the next run posts it', async () => {
    mockBcPost.mockRejectedValueOnce(new Error('503'));
    await expect(syncClient(row())).rejects.toThrow('503');
    expect(mockStaticUpdate.mock.calls[1]).toEqual([
      { comms_email_synced_through: null },
      { where: { id: 'i-1', comms_email_synced_through: EMAIL_ROW(1).received_at } },
    ]);
  });

  it('falls back to the subject when the model fails, and adds no to-do', async () => {
    mockChat.mockRejectedValue(new Error('429'));
    expect(await summarizeTouch({ kind: 'email', at: OPENED, who: 'from Dana', subject: 'Re: pilot', text: 'x' })).toEqual({ summary: 'Re: pilot', next_step: '', due_in_days: 2 });
  });

  it('escapes what the email said', () => {
    const h = touchHtml({ kind: 'email', at: OPENED, who: 'from <b>Dana</b>', subject: '<script>', text: '' }, { summary: '<img>', next_step: '' });
    expect(h).not.toMatch(/<script>|<img>|<b>Dana/);
  });

  it('only renames the list when the stage changed', async () => {
    mockQuery.mockResolvedValue([]);
    await syncClient(row({ bc_list_stage: 'Interviewed' }));
    expect(mockBcPut).not.toHaveBeenCalled();
  });
});

describe('the sweep', () => {
  it('skips signed and lost clients, and keeps going after a failure', async () => {
    mockFindAll.mockResolvedValue([row({ id: 'a' }), row({ id: 'b' })]);
    mockQuery.mockResolvedValue([]);
    mockBcPut.mockRejectedValueOnce(new Error('404'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const out = await syncEnterpriseComms();
    expect(mockFindAll.mock.calls[0][0].where).toMatchObject({ signed_at: null, lost_at: null });
    expect(out).toEqual({ clients: 1, touches: 0, failed: 1 });
  });

  it('does nothing without the Intake project', async () => {
    mockEnv.enterpriseIntakeBcProjectId = '';
    expect(await syncEnterpriseComms()).toEqual({ clients: 0, touches: 0, failed: 0 });
  });
});
