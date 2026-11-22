/**
 * CH10.3 the WhatsApp draft: asked for and written only while the WhatsApp channel is switched on,
 * plain text within 1,000 characters, facts filled by code, the same date rules, covered by the
 * approval hash, and required at approval only when the message goes to a WhatsApp group.
 */
type Row = Record<string, any>;
let drafts: Row[] = [];
const messages = new Map<string, Row>();
const events = new Map<string, Row>();
const mockLLM = jest.fn();

jest.mock('../../../llmCallWrapper', () => ({ callLLMWithAudit: (...a: unknown[]) => mockLLM(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (r: Row) => { const m = { id: `m${messages.size + 1}`, occurrence_starts_at: null, ...r }; messages.set(m.id, m); return m; }),
    findByPk: jest.fn(async (id: string) => messages.get(id) ?? null),
  },
}));
jest.mock('../../../../models/CommsHubDraft', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (r: Row) => { drafts.push(r); return r; }),
    max: jest.fn(async (_c: string, { where }: Row) => { const v = drafts.filter((d) => d.message_id === where.message_id && d.channel === where.channel).map((d) => d.version); return v.length ? Math.max(...v) : null; }),
    findOne: jest.fn(async ({ where }: Row) => drafts.filter((d) => d.message_id === where.message_id && d.channel === where.channel).sort((a, b) => b.version - a.version)[0] ?? null),
  },
}));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../../../models/CommsHubApproval', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: { findAll: jest.fn(async () => [{ id: 'c1', name: 'November 2026', get: () => 'c1' }]) } }));
jest.mock('../../eventWriteThrough', () => ({ audienceCohortIds: jest.fn(async () => ['c1']) }));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock('../approvals', () => ({ ...jest.requireActual('../approvals'), reconcileApproval: jest.fn(async () => false) }));

import { createDraftMessage, regenerateDrafts, recommendDestinations } from '../drafting';
import { factsFor, problemsFor, WHATSAPP_MAX_CHARS } from '../draftFacts';
import { MESSAGE_DRAFT_SYSTEM, MESSAGE_DRAFT_SYSTEM_WITH_WHATSAPP } from '../prompts/messageDraftPrompt';
import { approvalHash } from '../messageStatus';
import { assertWhatsAppReady, MessageRuleError } from '../approvals';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const NOW = new Date('2026-11-20T15:00:00Z');
const ENV = { ...process.env };
const on = (): void => { process.env.COMMS_HUB_WHATSAPP_ENABLED = 'true'; process.env.WHAPI_TOKEN = 'tok_test'; };
const off = (): void => { delete process.env.COMMS_HUB_WHATSAPP_ENABLED; delete process.env.WHAPI_TOKEN; };
const BASE = { community_post: { body: 'Demo Tuesday is on {{DATE}} at {{TIME}}.' }, in_app: { title: 'Demo Tuesday, {{DATE}}', body: 'Starts at {{TIME}}' } };
const reply = (o: Row = {}) => ({ content: JSON.stringify({ ...BASE, ...o }) });
const facts = () => factsFor(events.get('e1') as never, null, NOW);

beforeEach(() => {
  drafts = []; messages.clear(); events.clear(); jest.clearAllMocks(); off();
  events.set('e1', { id: 'e1', title: 'Demo Tuesday', event_type: 'session', description: null, audience: { kind: 'all_members' }, starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: null, repeat_rule: null, join_url: 'https://zoom.us/j/9', registration_url: null, hosts: [] });
});
afterAll(() => { process.env = ENV; });

describe('the prompt and the drafts', () => {
  it('with WhatsApp off: the two-channel prompt, no WhatsApp draft, and a stray whatsapp field from the model is dropped', async () => {
    mockLLM.mockResolvedValue(reply({ whatsapp: { body: 'Sneaky {{DATE}}' } }));
    const { drafts: d } = await createDraftMessage({ eventId: 'e1', kind: 'announcement' }, JACKIE, NOW);
    expect(mockLLM.mock.calls[0][0].systemPrompt).toBe(MESSAGE_DRAFT_SYSTEM);
    expect(d.map((x) => x.channel)).toEqual(['community_post', 'in_app']);
    expect(drafts.some((x) => x.channel === 'whatsapp')).toBe(false);
  });

  it('with WhatsApp on: the three-version prompt, and a WhatsApp draft with the facts filled by code', async () => {
    on();
    mockLLM.mockResolvedValue(reply({ whatsapp: { body: 'Hi all, Demo Tuesday is on {{DATE}} at {{TIME}}. Join: {{JOIN_LINK}}' } }));
    const { drafts: d } = await createDraftMessage({ eventId: 'e1', kind: 'announcement' }, JACKIE, NOW);
    expect(mockLLM.mock.calls[0][0].systemPrompt).toBe(MESSAGE_DRAFT_SYSTEM_WITH_WHATSAPP);
    expect(MESSAGE_DRAFT_SYSTEM_WITH_WHATSAPP).toContain('3. whatsapp');
    expect(MESSAGE_DRAFT_SYSTEM_WITH_WHATSAPP).toContain('"whatsapp": {"body": string}');
    const wa = d.find((x) => x.channel === 'whatsapp')!;
    expect(wa).toMatchObject({ version: 1, title: null, author: 'ai', body: 'Hi all, Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST. Join: https://zoom.us/j/9' });
    expect(problemsFor(wa as never, facts())).toEqual([]);
  });

  it('with WhatsApp on, a reply missing the WhatsApp version is refused (nothing written)', async () => {
    on();
    mockLLM.mockResolvedValue(reply());
    await expect(createDraftMessage({ eventId: 'e1', kind: 'announcement' }, JACKIE, NOW)).rejects.toThrow('missing a channel');
    expect(drafts).toEqual([]);
  });

  it('Shorter reworks the WhatsApp version too, as a new version', async () => {
    on();
    mockLLM.mockResolvedValue(reply({ whatsapp: { body: 'Demo Tuesday, {{DATE}} at {{TIME}}.' } }));
    const { message } = await createDraftMessage({ eventId: 'e1', kind: 'announcement' }, JACKIE, NOW);
    await regenerateDrafts(message.id, 'shorter', JACKIE, NOW);
    expect(mockLLM.mock.calls[1][0].userPrompt).toContain('"whatsapp":"Demo Tuesday, Tuesday, December 1 at 6:00 PM CST."');
    expect(drafts.filter((x) => x.channel === 'whatsapp').map((x) => x.version)).toEqual([1, 2]);
  });

  it('WhatsApp groups are never recommended automatically (a promotion plan cannot reach a group by itself)', async () => {
    on();
    expect((await recommendDestinations(events.get('e1') as never)).some((r) => r.channel === 'whatsapp')).toBe(false);
  });
});

describe('the WhatsApp rules in the validator', () => {
  const check = (body: string) => problemsFor({ channel: 'whatsapp', title: null, body }, facts());
  const ok = 'Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST.';
  it('a plain message with the right date and time passes', () => { expect(check(ok)).toEqual([]); });
  it('over 1,000 characters is refused, exactly 1,000 is fine', () => {
    expect(check(ok + ' '.repeat(WHATSAPP_MAX_CHARS - ok.length))).toEqual([]);
    expect(check(ok + 'x'.repeat(WHATSAPP_MAX_CHARS - ok.length + 1))).toEqual([expect.stringContaining('is 1,001 characters. Keep it to 1,000 or fewer.')]);
  });
  it.each(['**Demo**', '__Demo__', '# Demo', '`code`', '[join](https://zoom.us/j/9)', '~~old~~'])('formatting %s is refused', (fmt) => {
    // On a line of its own: a heading only counts at the start of a line.
    expect(check(`${ok}
${fmt}`)).toContain('The WhatsApp message uses formatting symbols (like ** or #). Write it as plain text.');
  });
  it('an emoji is refused', () => { expect(check(`${ok} \u{1F389}`)).toContain('The WhatsApp message has an emoji. Write it as plain text.'); });
  it('the shared date rules apply: a relative day, a wrong date, or a missing date are refused', () => {
    expect(check(`${ok} See you tomorrow.`).join(' ')).toMatch(/says "tomorrow"/);
    expect(check('Demo Tuesday is on December 3 at 6:00 PM CST.').join(' ')).toMatch(/must say the date/);
    expect(check('Demo Tuesday is soon.').join(' ')).toMatch(/must say the date: Tuesday, December 1/);
  });
});

describe('approval', () => {
  const content = (o: Partial<{ wa: string | null; dest: boolean }>) => ({
    drafts: [{ channel: 'in_app', title: 't', body: 'b' }, ...(o.wa ? [{ channel: 'whatsapp', title: null, body: o.wa }] : [])],
    destinations: [{ channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' }, ...(o.dest ? [{ channel: 'whatsapp', target_type: 'whatsapp_group', target_id: 'g1' }] : [])],
    send_at: null,
  });
  it('the hash changes when the WhatsApp text changes', () => {
    expect(approvalHash(content({ wa: 'One' }) as never)).not.toBe(approvalHash(content({ wa: 'Two' }) as never));
    expect(approvalHash(content({ wa: 'One' }) as never)).toBe(approvalHash(content({ wa: 'One' }) as never));
  });
  it('no WhatsApp group: no WhatsApp rule at all', () => { expect(() => assertWhatsAppReady(content({}) as never)).not.toThrow(); });
  it('a WhatsApp group with WhatsApp off is refused', () => {
    expect(() => assertWhatsAppReady(content({ wa: 'x', dest: true }) as never)).toThrow(MessageRuleError);
    try { assertWhatsAppReady(content({ wa: 'x', dest: true }) as never); } catch (e) { expect((e as MessageRuleError).reason).toBe('whatsapp_off'); }
  });
  it('a WhatsApp group without WhatsApp text is refused; with it, approved', () => {
    on();
    try { assertWhatsAppReady(content({ dest: true }) as never); throw new Error('not refused'); } catch (e) { expect((e as MessageRuleError).reason).toBe('no_whatsapp_draft'); }
    expect(() => assertWhatsAppReady(content({ wa: 'x', dest: true }) as never)).not.toThrow();
  });
});
