const m = {
  envFlags: { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: false },
  adminFindAll: jest.fn(),
  brandFindAll: jest.fn(),
  leadFindAll: jest.fn(),
  sendMail: jest.fn(),
  deliveryAddress: jest.fn(),
  claim: jest.fn(),
  createTransport: jest.fn(),
};
jest.mock('../../../config/env', () => ({ env: { get growthJourney() { return m.envFlags; }, frontendUrl: 'https://www.refactored.ai', emailFrom: 'enrollment@colaberry.com' } }));
jest.mock('../../../models', () => {
  const { Table } = require('../../growthJourney/__tests__/fixtures/phase4Tables');
  const handoffs = new Table('growth_journey_handoffs', 'h');
  return {
    GrowthJourneyHandoff: handoffs,
    AdminUser: { findAll: (...a: unknown[]) => m.adminFindAll(...a) },
    Brand: { findAll: (...a: unknown[]) => m.brandFindAll(...a) },
    Lead: { findAll: (...a: unknown[]) => m.leadFindAll(...a), findByPk: (...a: unknown[]) => m.leadFindAll(...a) },
    __tables: { handoffs },
  };
});
jest.mock('../../emailService', () => ({ guardedSendMail: (...a: unknown[]) => m.sendMail(...a), resolveDeliveryAddress: (...a: unknown[]) => m.deliveryAddress(...a) }));
jest.mock('../../executiveBriefingService', () => ({ claimBriefingSlot: (...a: unknown[]) => m.claim(...a) }));
jest.mock('nodemailer', () => ({ createTransport: (...a: unknown[]) => m.createTransport(...a) }));

import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';
import * as models from '../../../models';
import type { Table } from '../../growthJourney/__tests__/fixtures/phase4Tables';
import { HANDOFF_ADMIN_PATH } from '../../growthJourney/handoffs/assigneeDigest';
import { DIGEST_READ_LIMIT, DIGEST_STATUSES, HANDOFF_DIGEST_AGENT, HANDOFF_DIGEST_SCHEDULE, HANDOFF_DIGEST_SLOT, sendHandoffDigests } from '../handoffDigestSender';

/**
 * T517 - the sender, outside the journey tree: reads the open human-assigned
 * handoffs, one mail per assignee once per mailbox per Central date through
 * the briefing's slot claim and the guarded mailer. The mailer, the claim,
 * the admin and brand reads are the injected boundary; the handoff table is
 * T401's fixture. Nothing here can reach a transport: nodemailer is a spy
 * that must stay uncalled (acceptance 6).
 */

const handoffs = (models as unknown as { __tables: { handoffs: Table } }).__tables.handoffs;
const AS_OF = new Date('2026-09-21T12:30:00.000Z');
const HOUR = 3_600_000;
const ADMIN_A = 'admin-a';
const ADMIN_B = 'admin-b';
const flags = (over: Partial<typeof m.envFlags> = {}) => ({ ...m.envFlags, ...over });
let seq = 0;
const handoff = (over: Record<string, unknown> = {}) => handoffs.insert({
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', subject_ref: `lead:${(seq += 1)}`, lead_id: seq, owner_queue: 'sales', source: 'decision_deferral',
  assigned_to_type: 'human', assigned_to_id: ADMIN_A, ticket_id: `tk-${seq}`, priority: 'medium', urgent: false, reason: 'requires_human_review:deferred', evidence: {},
  sla_due_at: new Date(AS_OF.getTime() + 4 * HOUR), status: 'assigned', created_at: new Date(AS_OF.getTime() - 24 * HOUR + seq * HOUR), ...over,
});
const admin = (id: string, email: string, aiOperated = false) => ({ get: (k: string) => ({ id, email, is_ai_operated: aiOperated } as Record<string, unknown>)[k] });
const run = (over: Partial<typeof m.envFlags> = {}) => sendHandoffDigests({ flags: flags(over), asOf: AS_OF });
const mails = () => m.sendMail.mock.calls.map((c) => c[0] as { from: string; to: string; subject: string; text: string; html: string });
const logLines = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('growth_journey.handoff_digest'));

let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  handoffs.reset();
  seq = 0;
  for (const fn of Object.values(m)) if (typeof fn !== 'object') (fn as jest.Mock).mockReset();
  logSpy.mockClear();
  errorSpy.mockClear();
  m.adminFindAll.mockResolvedValue([admin(ADMIN_A, 'anita@colaberry.com'), admin(ADMIN_B, 'ben@colaberry.com')]);
  m.brandFindAll.mockResolvedValue([{ get: (k: string) => ({ id: 'b-ent', name: 'Colaberry Business' } as Record<string, unknown>)[k] }]);
  m.leadFindAll.mockResolvedValue([{ get: (k: string) => ({ id: 1, first_name: 'Priya', last_name: 'Natarajan', email: 'priya@example.com' } as Record<string, unknown>)[k] }]);
  m.deliveryAddress.mockImplementation(async (to: string) => to);
  // The claim, as the briefing's: the first claim of a (slot, mailbox) today succeeds, the next does not.
  const claimed = new Set<string>();
  m.claim.mockImplementation(async (slot: string, to: string) => { const key = `${slot}|${to}`; if (claimed.has(key)) return false; claimed.add(key); return true; });
  m.sendMail.mockResolvedValue({ messageId: 'mid', accepted: [], rejected: [], response: 'ok' });
});

describe('acceptance 3: flags off -> 0 queries', () => {
  it.each([
    ['the master off', { growthJourneyEnabled: false }],
    ['journeyHandoffs off', { journeyHandoffs: false }],
  ])('%s: skipped before any read, nothing claimed, nothing sent', async (_name, over) => {
    handoff();
    const read = jest.spyOn(handoffs, 'findAll');
    expect(await run(over)).toMatchObject({ status: 'skipped', reason: 'journeyHandoffs_off', sent: 0 });
    expect(read).not.toHaveBeenCalled();
    expect(m.adminFindAll).not.toHaveBeenCalled();
    expect(m.brandFindAll).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
    read.mockRestore();
  });
});

describe('one mail per assignee with something open, through the guarded mailer', () => {
  it('two assignees, one mail each: the right mailbox, the subject, the lines in order, the link; queued, dispositioned and agent-owned rows are not theirs', async () => {
    handoff({ priority: 'high' });
    handoff({ urgent: true, priority: 'low', owner_queue: 'admissions', sla_due_at: new Date(AS_OF.getTime() - HOUR) });
    handoff({ assigned_to_id: ADMIN_B, status: 'accepted', priority: 'critical' });
    handoff({ status: 'queued', assigned_to_type: null, assigned_to_id: null });
    handoff({ status: 'dispositioned', assigned_to_id: ADMIN_B });
    handoff({ assigned_to_type: 'agent', assigned_to_id: 'agent-cory' });
    const read = jest.spyOn(handoffs, 'findAll');
    const s = await run();
    expect(s).toEqual({ status: 'ran', handoffs: 3, assignees: 2, sent: 2, already_sent: 0, no_admin_row: 0, ai_operated: 0, failed: 0, redacted: 0 });
    const sent = mails();
    expect(sent.map((x) => x.to)).toEqual(['anita@colaberry.com', 'ben@colaberry.com']);
    expect(sent[0]).toMatchObject({ from: '"Colaberry Growth Journey" <enrollment@colaberry.com>', subject: 'Growth Journey: 2 handoffs waiting for you (1 urgent)' });
    expect(sent[0].text.split('\n').filter((l) => /^\d+\. /.test(l))).toEqual(['1. [URGENT] low · admissions · Colaberry Business', '2. high · sales · Colaberry Business']);
    expect(sent[0].text).toContain(`https://www.refactored.ai${HANDOFF_ADMIN_PATH}/h-2`);
    expect(sent[0].text).toContain('overdue by 1h');
    expect(sent[1]).toMatchObject({ subject: 'Growth Journey: 1 handoff waiting for you' });
    expect(sent[1].text).toContain(`${HANDOFF_ADMIN_PATH}/h-3`);
    // the read: the two statuses that are somebody's, human-owned, oldest first, bounded
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ where: { status: { [Op.in]: ['assigned', 'accepted'] }, assigned_to_type: 'human' }, attributes: ['id', 'brand_id', 'owner_queue', 'priority', 'urgent', 'reason', 'sla_due_at', 'created_at', 'assigned_to_id'], order: [['created_at', 'ASC']], limit: DIGEST_READ_LIMIT });
    read.mockRestore();
    expect(m.claim.mock.calls).toEqual([[HANDOFF_DIGEST_SLOT, 'anita@colaberry.com'], [HANDOFF_DIGEST_SLOT, 'ben@colaberry.com']]);
    expect(m.adminFindAll).toHaveBeenCalledWith({ where: { id: { [Op.in]: [ADMIN_A, ADMIN_B] } }, attributes: ['id', 'email', 'is_ai_operated'] });
    expect(m.brandFindAll).toHaveBeenCalledWith({ where: { id: { [Op.in]: ['b-ent'] } }, attributes: ['id', 'name'] });
    expect(DIGEST_STATUSES).toEqual(['assigned', 'accepted']);
  });

  it('an assignee with nothing open gets no mail: admins exist for both, only one has a row', async () => {
    handoff({ assigned_to_id: ADMIN_B });
    expect(await run()).toMatchObject({ assignees: 1, sent: 1 });
    expect(mails().map((x) => x.to)).toEqual(['ben@colaberry.com']);
  });

  it('nobody has anything open: one count line, no admin or brand read, no claim', async () => {
    handoff({ status: 'queued', assigned_to_type: null, assigned_to_id: null });
    expect(await run()).toMatchObject({ status: 'ran', handoffs: 0, assignees: 0, sent: 0 });
    expect(m.adminFindAll).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
    expect(logLines(logSpy)).toHaveLength(1);
  });

  it('an assignee without an admin_users row, or whose row is AI-operated, gets no mail and is counted', async () => {
    handoff({ assigned_to_id: 'admin-gone' });
    handoff({ assigned_to_id: 'admin-twin' });
    handoff({ assigned_to_id: ADMIN_A });
    m.adminFindAll.mockResolvedValue([admin(ADMIN_A, 'anita@colaberry.com'), admin('admin-twin', 'twin@colaberry.com', true)]);
    expect(await run()).toMatchObject({ assignees: 3, sent: 1, no_admin_row: 1, ai_operated: 1 });
    expect(mails().map((x) => x.to)).toEqual(['anita@colaberry.com']);
  });
});

describe('acceptance 2: once per mailbox per Central date', () => {
  it('a same-date re-run claims nothing and sends nothing: already_sent counts every assignee', async () => {
    handoff();
    handoff({ assigned_to_id: ADMIN_B });
    expect(await run()).toMatchObject({ sent: 2, already_sent: 0 });
    expect(await run()).toMatchObject({ sent: 0, already_sent: 2 });
    expect(m.sendMail).toHaveBeenCalledTimes(2);
    expect(m.claim).toHaveBeenCalledTimes(4);
  });

  it('the slot is keyed on the DELIVERED mailbox: a dev fan-in of two assignees into one sink claims one slot, sends once, and still addresses the intended mailbox', async () => {
    handoff();
    handoff({ assigned_to_id: ADMIN_B });
    m.deliveryAddress.mockResolvedValue('dev-sink@colaberry.com');
    expect(await run()).toMatchObject({ sent: 1, already_sent: 1 });
    expect(m.claim.mock.calls).toEqual([[HANDOFF_DIGEST_SLOT, 'dev-sink@colaberry.com'], [HANDOFF_DIGEST_SLOT, 'dev-sink@colaberry.com']]);
    expect(mails().map((x) => x.to)).toEqual(['anita@colaberry.com']); // the guard reroutes; the sender never rewrites the address itself
  });

  it('a claim that cannot be read fails CLOSED for that assignee - no mail, one error line with the class and the admin id, no address - and the next assignee still gets theirs', async () => {
    handoff();
    handoff({ assigned_to_id: ADMIN_B });
    m.claim.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' })).mockResolvedValue(true);
    expect(await run()).toMatchObject({ sent: 1, failed: 1 });
    expect(mails().map((x) => x.to)).toEqual(['ben@colaberry.com']);
    const line = logLines(errorSpy).find((l) => l.includes('handoff_digest_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', context: { assignee_id: ADMIN_A, error_class: 'SequelizeConnectionError', handoffs: 1 } });
    expect(line).not.toContain('@');
  });

  it('a mailer that throws is one failure, counted and logged; the run finishes', async () => {
    handoff();
    handoff({ assigned_to_id: ADMIN_B });
    m.sendMail.mockRejectedValueOnce(Object.assign(new Error('smtp down'), { name: 'SmtpError' })).mockResolvedValue({});
    expect(await run()).toMatchObject({ sent: 1, failed: 1 });
    expect(JSON.parse(logLines(errorSpy)[0])).toMatchObject({ context: { assignee_id: ADMIN_A, error_class: 'SmtpError' } });
  });
});

describe('acceptance 4: the body has no @ and no lead name', () => {
  it('the lead table is never read; the fixture names and addresses are absent from every mail; a reason carrying an address is redacted and counted', async () => {
    handoff({ reason: 'manual:call priya@example.com back' });
    handoff({ assigned_to_id: ADMIN_B, evidence: { likely_need: 'a paid programme decision' } });
    const s = await run();
    expect(s).toMatchObject({ sent: 2, redacted: 1 });
    expect(m.leadFindAll).not.toHaveBeenCalled();
    for (const mail of mails()) {
      expect(`${mail.subject}\n${mail.text}\n${mail.html}`).not.toMatch(/Priya|Natarajan|priya@|@/);
    }
    expect(mails()[0].text).toContain('reason: redacted');
    // and the count line carries counts only
    for (const line of logLines(logSpy)) expect(line).not.toContain('@');
  });
});

describe('acceptance 6, 7: no transport of its own; the schedule and the agent', () => {
  it('nodemailer.createTransport is never called: the only send path is guardedSendMail', async () => {
    handoff();
    await run();
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.createTransport).not.toHaveBeenCalled();
  });

  it('source-level: the sender names no transport, no other send, no lead read; the compose step is in the journey tree and imports no mailer', () => {
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // the guard reads code; a header may name what it must not do
    const sender = code(fs.readFileSync(path.join(__dirname, '..', 'handoffDigestSender.ts'), 'utf8'));
    expect(sender).not.toMatch(/nodemailer|createTransport|sendRawEmail|sendBriefingEmail|transporter|\bLead\b/);
    expect(sender.match(/\bsendMail\(/g)).toBeNull();
    expect(sender).toContain("import { guardedSendMail, resolveDeliveryAddress } from '../emailService';");
    expect(sender).toContain("import { claimBriefingSlot } from '../executiveBriefingService';");
    const compose = code(fs.readFileSync(path.join(__dirname, '..', '..', 'growthJourney', 'handoffs', 'assigneeDigest.ts'), 'utf8'));
    expect(compose).not.toMatch(/emailService|nodemailer|sendMail|from '\.\.\/\.\.\/\.\.\/models'/);
    expect(compose).toMatch(/import type \{ GrowthJourneyHandoffPriority \} from '\.\.\/\.\.\/\.\.\/models\/GrowthJourneyHandoff';/);
  });

  it('the schedule is a weekday morning, the agent name is the registry row, the slot is its own', () => {
    expect(HANDOFF_DIGEST_SCHEDULE.split(' ')).toEqual(['30', '12', '*', '*', '1-5']);
    expect(HANDOFF_DIGEST_AGENT).toBe('GrowthJourneyHandoffDigest');
    expect(HANDOFF_DIGEST_SLOT).toBe('growth_journey_handoff_digest');
  });
});
