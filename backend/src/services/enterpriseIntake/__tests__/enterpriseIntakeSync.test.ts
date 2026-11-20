/**
 * W31 (Phase 4): "keep all communications in sync." Every email and call with an open client
 * lands on their list once, with a one-line summary and a Next to-do when one is implied.
 * The matching SQL itself is proven in enterpriseIntakeSync.integration.test.ts (real Postgres).
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
    sequelize: { query: (...a: any[]) => mockQuery(...a), literal: (x: string) => ({ literal: x }) },
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
const at = (min: number) => new Date(OPENED.getTime() + min * 60_000);

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'i-1', company: 'Acme Logistics', full_name: 'Dana Reyes', email: 'dana@acme.test', lead_id: 7, call_id: 'call_1',
    bc_todolist_id: '101', bc_checklist_ready_at: new Date(), bc_list_stage: null, understanding_id: 'u-1',
    comms_email_synced_through: null, comms_calls_posted: null, createdAt: OPENED, ...over,
  };
  r.update = jest.fn(async (p: any) => Object.assign(r, p));
  return r;
}

const EMAIL = (n: number) => ({
  from_address: 'dana@acme.test', from_name: 'Dana Reyes', subject: `Re: pilot ${n}`, body_text: `Body ${n}`,
  received_at: at(n * 10), synced_at: at(n * 10 + 1),
});

const CALL = (id: string, min: number) => ({ provider_message_id: id, transcript: 'bot: hi\nhuman: we are ready', created_at: at(min) });

let emails: any[];
let calls: any[];

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, { enterpriseIntakeBcProjectId: '49670056', enterpriseIntakeBcOwnerId: '17454835' });
  emails = [EMAIL(1), EMAIL(2)];
  calls = [];
  mockStaticUpdate.mockResolvedValue([1]);
  mockBcPost.mockResolvedValue({ id: 1 });
  mockChat.mockResolvedValue({ parsed: { summary: 'Dana asked for the logistics case study.', next_step: 'Send the case study', due_in_days: 2 } });
  mockQuery.mockImplementation(async (sql: string) => (sql.includes('inbox_emails') ? emails : calls));
  jest.spyOn(console, 'error').mockImplementation(() => {});
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
  it('reads only the work mailbox, matches parsed addresses exactly, and watermarks on synced_at', async () => {
    await emailTouches(row(), OPENED);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("m.provider = 'gmail_colaberry'");
    expect(sql).toContain('m.synced_at > :since');
    expect(sql).toContain("split_part(lower(m.from_address), '@', 2) = :domain");
    expect(sql).toContain('jsonb_array_elements');
    expect(sql).toContain('m.cc_addresses');
    expect(sql).not.toMatch(/LIKE/i);
    expect(opts.replacements).toMatchObject({ since: OPENED, email: 'dana@acme.test', domain: 'acme.test', opened: OPENED });
  });

  it('never matches a whole webmail domain', async () => {
    await emailTouches(row({ email: 'dana@gmail.com' }), OPENED);
    expect(mockQuery.mock.calls[0][0]).not.toContain(':domain');
  });

  it('leaves a tied group for the next run when the limit cuts through it', async () => {
    const tie = at(50);
    emails = [EMAIL(1), { ...EMAIL(2), synced_at: tie }, { ...EMAIL(3), synced_at: tie }];
    expect((await emailTouches(row(), OPENED, 3)).map((t) => t.subject)).toEqual(['Re: pilot 1']);
  });
});

describe('a touch on the list', () => {
  it('posts each email once with a summary and a dated Next to-do, moving the watermark first', async () => {
    const i = row();
    const out = await syncClient(i);
    expect(out.emails).toBe(2);
    const comments = mockBcPost.mock.calls.filter(([u]) => u.endsWith('comments.json'));
    expect(comments).toHaveLength(2);
    expect(comments[0][1].content).toContain('Dana asked for the logistics case study.');
    const todos = mockBcPost.mock.calls.filter(([u]) => u.endsWith('todos.json'));
    expect(todos[0][1]).toMatchObject({ content: 'Next: Send the case study', assignee_ids: [17454835], notify: false });
    expect(mockStaticUpdate.mock.calls[0]).toEqual([
      { comms_email_synced_through: EMAIL(1).synced_at },
      { where: { id: 'i-1', comms_email_synced_through: null } },
    ]);
    expect(mockStaticUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockBcPost.mock.invocationCallOrder[0]);
    expect(i.update).toHaveBeenCalledWith({ comms_checked_at: expect.any(Date) });
    expect(mockBcPut).toHaveBeenCalledWith('/buckets/49670056/todolists/101.json', { name: '[Interviewed] Acme Logistics - Dana Reyes' });
  });

  it('Phase 4 review: a failed Next to-do never moves the watermark back, so the comment is never reposted', async () => {
    emails = [EMAIL(1)];
    mockBcPost.mockImplementation(async (url: string) => {
      if (url.endsWith('todos.json')) throw new Error('422 bad assignee');
      return { id: 1 };
    });
    const i = row();
    expect((await syncClient(i)).emails).toBe(1);
    // Only the forward move: no give-back.
    expect(mockStaticUpdate).toHaveBeenCalledTimes(1);
    // The next run starts after that email, so its comment is not posted again.
    emails = [];
    mockBcPost.mockClear();
    await syncClient(row({ comms_email_synced_through: EMAIL(1).synced_at, bc_list_stage: 'Interviewed' }));
    expect(mockQuery.mock.calls[mockQuery.mock.calls.length - 2][1].replacements.since).toEqual(EMAIL(1).synced_at);
    expect(mockBcPost.mock.calls.filter(([u]) => u.endsWith('comments.json'))).toHaveLength(0);
  });

  it('gives the touch back only when the COMMENT fails', async () => {
    mockBcPost.mockRejectedValueOnce(new Error('503'));
    await expect(syncClient(row())).rejects.toThrow('503');
    expect(mockStaticUpdate.mock.calls[1]).toEqual([
      { comms_email_synced_through: null },
      { where: { id: 'i-1', comms_email_synced_through: EMAIL(1).synced_at } },
    ]);
  });

  it('posts nothing when another run already moved the watermark', async () => {
    mockStaticUpdate.mockResolvedValue([0]);
    expect((await syncClient(row({ bc_list_stage: 'Interviewed' }))).emails).toBe(0);
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('calls: posts each new one once, recorded by id, skipping ones already posted', async () => {
    emails = [];
    calls = [CALL('call_a', 30), CALL('call_b', 40)];
    const i = row({ comms_calls_posted: ['call_a'] });
    expect((await syncClient(i)).calls).toBe(1);
    expect(i.update).toHaveBeenCalledWith({ comms_calls_posted: ['call_a', 'call_b'] });
    expect(mockBcPost.mock.calls.filter(([u]) => u.endsWith('comments.json'))[0][1].content).toContain('<strong>Call</strong>');
    const [sql, opts] = mockQuery.mock.calls.find(([s]) => s.includes('communication_logs'))!;
    expect(sql).toContain("coalesce(provider_response->>'transcript', '') <> ''");
    expect(opts.replacements).toMatchObject({ lead: 7, callId: 'call_1' });
  });

  it('calls: a failed comment un-records the call so the next run posts it', async () => {
    emails = [];
    calls = [CALL('call_b', 40)];
    mockBcPost.mockRejectedValueOnce(new Error('503'));
    const i = row();
    await expect(syncClient(i)).rejects.toThrow('503');
    expect(i.update).toHaveBeenLastCalledWith({ comms_calls_posted: [] });
  });

  it('falls back to the subject when the model fails, and adds no to-do', async () => {
    mockChat.mockRejectedValue(new Error('429'));
    expect(await summarizeTouch({ kind: 'email', who: 'from Dana', subject: 'Re: pilot', text: 'x' })).toEqual({ summary: 'Re: pilot', next_step: '', due_in_days: 2 });
  });

  it('escapes what the email said', () => {
    const h = touchHtml({ kind: 'email', at: OPENED, who: 'from <b>Dana</b>', subject: '<script>' }, { summary: '<img>', next_step: '' });
    expect(h).not.toMatch(/<script>|<img>|<b>Dana/);
  });

  it('only renames the list when the stage changed', async () => {
    emails = [];
    await syncClient(row({ bc_list_stage: 'Interviewed' }));
    expect(mockBcPut).not.toHaveBeenCalled();
  });
});

describe('the sweep', () => {
  it('takes open clients least recently checked first, skips closed ones, and keeps going after a failure', async () => {
    mockFindAll.mockResolvedValueOnce([row({ id: 'a' }), row({ id: 'b' })]).mockResolvedValueOnce([]);
    emails = [];
    mockBcPut.mockRejectedValueOnce(new Error('404'));
    const out = await syncEnterpriseComms();
    const q = mockFindAll.mock.calls[0][0];
    expect(q.where).toMatchObject({ signed_at: null, lost_at: null });
    expect(q.order).toEqual([[{ literal: 'comms_checked_at IS NULL' }, 'DESC'], ['comms_checked_at', 'ASC']]);
    expect(out).toEqual({ clients: 1, touches: 0, failed: 1 });
  });

  it('writes Signed or Lost into a closed client\'s list name', async () => {
    const closed = row({ signed_at: new Date(), bc_list_stage: 'Proposal sent' });
    mockFindAll.mockResolvedValueOnce([]).mockResolvedValueOnce([closed]);
    await syncEnterpriseComms();
    expect(mockBcPut).toHaveBeenCalledWith('/buckets/49670056/todolists/101.json', { name: '[Signed] Acme Logistics - Dana Reyes' });
  });

  it('does nothing without the Intake project', async () => {
    mockEnv.enterpriseIntakeBcProjectId = '';
    expect(await syncEnterpriseComms()).toEqual({ clients: 0, touches: 0, failed: 0 });
  });
});
