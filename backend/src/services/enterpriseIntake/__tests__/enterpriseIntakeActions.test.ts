/**
 * W31-W32: everything that reaches the client is a deliberate step from the admin page.
 * Options email and proposal go out from Ali, once each; the proposal never goes out without
 * Ali's price; signed opens the client's own Basecamp project, once.
 */
const mockEnv: Record<string, unknown> = {};
const mockFindByPk = jest.fn();
const mockRecordFind = jest.fn();
const mockChat = jest.fn();
const mockBcPost = jest.fn();
const mockSend = jest.fn();
const mockTick = jest.fn();
const mockStage = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/EnterpriseIntake', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockFindByPk(...a) } }));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockRecordFind(...a) } }));
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChat(...a) }));
jest.mock('../../ops/basecampClient', () => ({ bcPost: (...a: any[]) => mockBcPost(...a) }));
jest.mock('../../email/sendReplyAsAli', () => {
  class StyleViolationError extends Error {}
  return { sendFirstContactAsAli: (...a: any[]) => mockSend(...a), StyleViolationError };
});
jest.mock('../enterpriseIntakeBasecamp', () => ({
  ascii: (v: unknown) => String(v ?? ''),
  esc: (v: unknown) => String(v ?? '').replace(/</g, '&lt;'),
  intakeBasecampEnabled: () => Boolean(mockEnv.enterpriseIntakeBcProjectId),
  tickStep: (...a: any[]) => mockTick(...a),
}));
jest.mock('../enterpriseIntakeService', () => ({ writtenBrief: () => 'Company: Acme' }));
jest.mock('../enterpriseIntakeSync', () => ({ syncListStage: (...a: any[]) => mockStage(...a) }));

/* eslint-disable import/first */
import { ActionRefused, PRICE_PLACEHOLDER, draftProposal, markLost, markSigned, sendBlockers, sendOptionsEmail, sendProposal } from '../enterpriseIntakeActions';
/* eslint-enable import/first */

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'i-1', email: 'dana@acme.test', full_name: 'Dana Reyes', role: 'COO', company: 'Acme Logistics',
    understanding_id: 'u-1', researched_at: new Date(), pilot_options: [{ title: 'Order intake agent', service: 'Build', what_it_does: 'x', success_measure: 'y' }],
    research: { summary: 's' }, options_email_sent_at: null, proposal_drafted_at: null, proposal_sent_at: null,
    signed_at: null, lost_at: null, bc_project_id: null, bc_todolist_id: '101', ...over,
  };
  r.update = jest.fn(async (p: any) => Object.assign(r, p));
  return r;
}

const PROPOSAL_BODY = [
  'Where you are today',
  'Four dispatchers re-key about 300 orders a day from customer emails into McLeod, about 20 hours a week.',
  '',
  'What the pilot does',
  'An agent reads each order email, fills the order in McLeod, and flags the ones it is unsure about for a dispatcher.',
  '',
  'Investment',
  PRICE_PLACEHOLDER,
  '',
  'Next step',
  'A 30 minute call.',
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, { enterpriseIntakeBcProjectId: '49670056' });
  mockSend.mockResolvedValue({ outcome: 'sent', idempotencyKey: 'k', messageId: 'm' });
  mockBcPost.mockResolvedValue({ id: 900, app_url: 'https://3.basecamp.com/3945211/projects/900' });
  mockTick.mockResolvedValue(true);
  mockRecordFind.mockResolvedValue({ items: [{ dimension: 'systems', value: 'McLeod' }] });
});

describe('send rules', () => {
  it('blocks an empty message, the word free, and an unpriced proposal', () => {
    expect(sendBlockers('Hi', 'Body')).toEqual([]);
    expect(sendBlockers('', 'Body')).toHaveLength(1);
    expect(sendBlockers('A free pilot', 'Body')).toEqual(['it uses the word "free"']);
    expect(sendBlockers('Proposal', `Investment: ${PRICE_PLACEHOLDER}`)).toEqual(['the investment has not been added yet']);
  });
});

describe('the options email', () => {
  it('sends Ali\'s edit from Ali, once, records it on the list and ticks the options step', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    expect(await sendOptionsEmail('i-1', 'Your pilot options', 'Hi Dana, two options.')).toEqual({ sent: true, already: false });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'dana@acme.test', businessEventId: 'enterprise-intake-options-i-1' }));
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ options_email_sent_at: expect.any(Date) }));
    expect(mockBcPost.mock.calls[0][1].content).toContain('Options email sent by Ali');
    expect(mockTick).toHaveBeenCalledWith('49670056', '101', 'options');
    expect(mockStage).toHaveBeenCalled();
  });

  it('never sends twice, even with an edited subject', async () => {
    mockFindByPk.mockResolvedValue(row({ options_email_sent_at: new Date() }));
    await expect(sendOptionsEmail('i-1', 'New subject', 'Body')).rejects.toThrow('already sent');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses before there are options, and to a lost client', async () => {
    mockFindByPk.mockResolvedValue(row({ researched_at: null }));
    await expect(sendOptionsEmail('i-1', 'S', 'B')).rejects.toBeInstanceOf(ActionRefused);
    mockFindByPk.mockResolvedValue(row({ lost_at: new Date() }));
    await expect(sendOptionsEmail('i-1', 'S', 'B')).rejects.toThrow('lost');
  });

  it('reports a kill-switch skip as not sent and records nothing', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    mockSend.mockResolvedValue({ outcome: 'skipped', reason: 'kill_switch_active' });
    await expect(sendOptionsEmail('i-1', 'S', 'B')).rejects.toThrow('kill_switch_active');
    expect(i.update).not.toHaveBeenCalled();
  });

  it('a Basecamp failure after the send does not undo it', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    mockBcPost.mockRejectedValue(new Error('503'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await sendOptionsEmail('i-1', 'S', 'B')).sent).toBe(true);
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ options_email_sent_at: expect.any(Date) }));
  });
});

describe('the proposal', () => {
  it('drafts from everything we know, with the price left for Ali, and posts the draft', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    mockChat.mockResolvedValue({ parsed: { subject: 'Your pilot proposal', body: PROPOSAL_BODY } });
    const out = await draftProposal('i-1');
    expect(out.body).toContain(PRICE_PLACEHOLDER);
    expect(mockChat.mock.calls[0][2]).toContain('[systems] McLeod');
    expect(mockChat.mock.calls[0][2]).toContain('1. Order intake agent (Build)');
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ proposal_drafted_at: expect.any(Date) }));
    expect(mockTick).toHaveBeenCalledWith('49670056', '101', 'proposal');
  });

  it.each([
    ['states a price', PROPOSAL_BODY.replace('A 30 minute call.', 'It costs $9,000.')],
    ['drops the price placeholder', PROPOSAL_BODY.replace(PRICE_PLACEHOLDER, 'TBD')],
    ['uses the word free', PROPOSAL_BODY.replace('A 30 minute call.', 'A free call.')],
  ])('refuses an AI draft that %s', async (_why, body) => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    mockChat.mockResolvedValue({ parsed: { subject: 'S', body } });
    await expect(draftProposal('i-1')).rejects.toBeInstanceOf(ActionRefused);
    expect(i.update).not.toHaveBeenCalled();
  });

  it('never sends without Ali\'s price, and sends once with it', async () => {
    const i = row({ proposal_drafted_at: new Date() });
    mockFindByPk.mockResolvedValue(i);
    await expect(sendProposal('i-1', 'Proposal', PROPOSAL_BODY)).rejects.toThrow('investment has not been added');
    expect(mockSend).not.toHaveBeenCalled();
    const priced = PROPOSAL_BODY.replace(PRICE_PLACEHOLDER, '$18,000 for the six-week pilot');
    expect((await sendProposal('i-1', 'Proposal', priced)).sent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ businessEventId: 'enterprise-intake-proposal-i-1' }));
    expect(mockTick).toHaveBeenCalledWith('49670056', '101', 'approve');
    mockFindByPk.mockResolvedValue(row({ proposal_drafted_at: new Date(), proposal_sent_at: new Date() }));
    await expect(sendProposal('i-1', 'Proposal', priced)).rejects.toThrow('already sent');
  });
});

describe('signed and lost', () => {
  it('signed opens the client\'s own project once, and ticks signed', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    const out = await markSigned('i-1');
    expect(mockBcPost.mock.calls[0]).toEqual(['/projects.json', expect.objectContaining({ name: 'Acme Logistics - Colaberry Enterprise' })]);
    expect(out).toEqual({ projectId: '900', projectUrl: 'https://3.basecamp.com/3945211/projects/900' });
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed', signed_at: expect.any(Date) }));
    expect(mockTick).toHaveBeenCalledWith('49670056', '101', 'signed');
    mockBcPost.mockClear();
    mockFindByPk.mockResolvedValue(row({ bc_project_id: '900', signed_at: new Date() }));
    await markSigned('i-1');
    expect(mockBcPost.mock.calls.some(([u]) => u === '/projects.json')).toBe(false);
  });

  it('a double click opens one project', async () => {
    mockFindByPk.mockImplementation(async () => row());
    const results = await Promise.allSettled([markSigned('i-1'), markSigned('i-1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(mockBcPost.mock.calls.filter(([u]) => u === '/projects.json')).toHaveLength(1);
  });

  it('lost records the reason, and a signed client cannot be lost', async () => {
    const i = row();
    mockFindByPk.mockResolvedValue(i);
    await markLost('i-1', 'Chose another vendor');
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'lost', lost_reason: 'Chose another vendor' }));
    mockFindByPk.mockResolvedValue(row({ signed_at: new Date() }));
    await expect(markLost('i-1', 'x')).rejects.toThrow('signed');
  });
});
