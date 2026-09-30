import * as fs from 'fs';
import * as path from 'path';

const m = { resolveBrand: jest.fn(), programFindOne: jest.fn(), createHandoff: jest.fn(), assignHandoff: jest.fn() };

jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
jest.mock('../../../config/env', () => ({ env: { growthJourney: { growthJourneyEnabled: false } } }));
jest.mock('../explorerProgramBridge', () => ({ EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training', programSlug: 'learner' } }));
jest.mock('../../../modules/tenancy/tenantResolver', () => ({ resolveBrandBySlug: (...a: unknown[]) => m.resolveBrand(...a) }));
jest.mock('../../../models', () => ({ JourneyProgram: { findOne: (...a: unknown[]) => m.programFindOne(...a) } }));
jest.mock('../handoffs/handoffService', () => ({ createHandoff: (...a: unknown[]) => m.createHandoff(...a), assignHandoff: (...a: unknown[]) => m.assignHandoff(...a) }));

import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { QUEUE_BY_REPLY_CLASS, recordReplyHandoff } from '../replyHandoffHook';

/**
 * T404 — the Explorer reply route becomes a handoff row in the queue the class
 * names. Fire-and-forget, flag-gated, never throws; the brand is Explorer's own.
 */

const ON: GrowthJourneyFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: true, journeyExecution: false };
const OFF: GrowthJourneyFlags = { ...ON, journeyHandoffs: false };
const AS_OF = new Date('2026-09-16T12:00:00Z');

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.resolveBrand.mockResolvedValue({ id: 'b-train', tenant_id: 't-col', slug: 'colaberry-training' });
  m.programFindOne.mockResolvedValue({ id: 'p-train', slug: 'learner', kind: 'learner' });
  m.createHandoff.mockResolvedValue({ row: { id: 'h-1' }, replayed: false });
  m.assignHandoff.mockResolvedValue({ status: 'queued', reason: 'no_assignee_policy' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the class → queue map', () => {
  it('routes READY_TO_ENROLL → admissions, NEEDS_ALI → ali, NEEDS_HELP → support, and nothing else', () => {
    expect(QUEUE_BY_REPLY_CLASS).toEqual({ READY_TO_ENROLL: 'admissions', NEEDS_ALI: 'ali', NEEDS_HELP: 'support' });
  });
});

describe('recordReplyHandoff', () => {
  it('a NEEDS_ALI reply yields one ali handoff with source reply_route under Explorer\'s own brand and programme', async () => {
    const r = await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_ALI', providerMessageId: '<msg-1@mail>' }, ON, AS_OF);
    expect(r).toEqual({ status: 'recorded', handoff_id: 'h-1', replayed: false, owner_queue: 'ali', assignment: 'queued' });
    expect(m.resolveBrand).toHaveBeenCalledWith('colaberry', 'colaberry-training');
    expect(m.programFindOne).toHaveBeenCalledWith({ where: { brand_id: 'b-train', slug: 'learner' } });
    expect(m.createHandoff).toHaveBeenCalledWith({
      refs: { tenant_id: 't-col', brand_id: 'b-train', brand_slug: 'colaberry-training', program: { id: 'p-train', slug: 'learner', kind: 'learner' }, subject_ref: 'lead:42', lead_id: 42, enrollment_id: null, path: null },
      trigger: { source: 'reply_route', owner_queue: 'ali', reason: 'reply_class:NEEDS_ALI', urgent_hint: false, event_ref: 'provider_message:<msg-1@mail>' },
      decision: null,
      asOf: AS_OF,
    });
    expect(m.assignHandoff).toHaveBeenCalledWith({ id: 'h-1' }, ON, AS_OF);
  });

  it('READY_TO_ENROLL is an explicit request: admissions, with the urgent hint; without a message id the event is the arrival time, never a constant', async () => {
    await recordReplyHandoff({ leadId: 42, replyClass: 'READY_TO_ENROLL' }, ON, AS_OF);
    expect(m.createHandoff.mock.calls[0][0].trigger).toEqual({ source: 'reply_route', owner_queue: 'admissions', reason: 'reply_class:READY_TO_ENROLL', urgent_hint: true, event_ref: 'received_at:2026-09-16T12:00:00.000Z' });
  });

  it('a NOT_INTERESTED reply, a generator-answered class, or no class yields no handoff and touches nothing', async () => {
    for (const cls of ['NOT_INTERESTED', 'QUESTION', null]) {
      expect(await recordReplyHandoff({ leadId: 42, replyClass: cls }, ON, AS_OF)).toEqual({ status: 'no_handoff', reason: `class_not_routed:${cls ?? 'none'}` });
    }
    expect(m.resolveBrand).not.toHaveBeenCalled();
    expect(m.createHandoff).not.toHaveBeenCalled();
  });

  it('with the flag off it is disabled before touching anything - production today', async () => {
    expect(await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_ALI' }, OFF, AS_OF)).toEqual({ status: 'disabled' });
    expect(await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_ALI' })).toEqual({ status: 'disabled' }); // env.growthJourney: master off
    expect(m.resolveBrand).not.toHaveBeenCalled();
  });

  it('a replayed row is reported as such', async () => {
    m.createHandoff.mockResolvedValue({ row: { id: 'h-1' }, replayed: true });
    expect((await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_HELP' }, ON, AS_OF))).toMatchObject({ status: 'recorded', replayed: true, owner_queue: 'support' });
  });

  it("Explorer's brand absent from this database → no handoff, named", async () => {
    m.resolveBrand.mockResolvedValue(null);
    expect(await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_ALI' }, ON, AS_OF)).toEqual({ status: 'no_handoff', reason: 'explorer_brand_absent' });
  });

  it('never throws: a failing writer is logged with the class and ids only', async () => {
    m.createHandoff.mockRejectedValue(Object.assign(new Error('db down learner@example.com'), { name: 'SequelizeConnectionError' }));
    const r = await recordReplyHandoff({ leadId: 42, replyClass: 'NEEDS_ALI' }, ON, AS_OF);
    expect(r.status).toBe('no_handoff');
    expect((r as { reason: string }).reason).toMatch(/^hook_failed:/);
    const lines = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('|');
    expect(lines).toContain('growth_journey.handoff.reply_hook_failed');
    expect(lines).toContain('"lead_id":42');
    expect(lines).not.toContain('learner@example.com');
  });
});

describe('the wiring', () => {
  it('requires every heavy module lazily, so a controller loaded without a database never constructs Sequelize', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'replyHandoffHook.ts'), 'utf8');
    const topImports = src.split('\n').filter((l) => /^import /.test(l) && !/^import type /.test(l));
    expect(topImports.every((l) => /config\/env|config\/growthJourneyFlags|utils\/errorClassifier/.test(l))).toBe(true);
    for (const mod of ['./explorerProgramBridge', '../../modules/tenancy/tenantResolver', '../../models', './handoffs/handoffService']) {
      expect(src).toContain(`require('${mod}')`);
    }
  });

  it('the Mandrill controller calls it once, inside the routed branch, after the explorer_reply_routed log, fire-and-forget', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'controllers', 'mandrillWebhookController.ts'), 'utf8');
    expect(src.match(/recordReplyHandoff\(/g)).toHaveLength(1);
    const logAt = src.indexOf("event: 'explorer_reply_routed'");
    const callAt = src.indexOf("void recordReplyHandoff({ leadId: lead.id, replyClass: routing.classification?.class ?? null, providerMessageId: msg.headers?.['Message-Id'] ?? null })");
    expect(logAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(logAt);
    // Inside `if (routing.handled) { ... }`: the call precedes the block's close and the catch.
    expect(src.indexOf('} catch (routeErr: any)', logAt)).toBeGreaterThan(callAt);
    // The GHL controller gets no hook: it never computes an Explorer reply route.
    const ghl = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'controllers', 'ghlWebhookController.ts'), 'utf8');
    expect(ghl).not.toContain('recordReplyHandoff');
  });
});
