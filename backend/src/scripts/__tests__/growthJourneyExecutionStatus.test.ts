const m = { programFindAll: jest.fn(), brandFindAll: jest.fn(), receiptCount: jest.fn(), killSwitch: jest.fn() };
const writes = { create: jest.fn(), update: jest.fn(), destroy: jest.fn() };
jest.mock('../../config/env', () => ({
  env: {
    growthJourney: { growthJourneyEnabled: false, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false },
    explorerGrowth: { growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false, aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false },
  },
}));
jest.mock('../../models', () => {
  const { T5 } = require('../../services/growthJourney/__tests__/fixtures/phase5Tables');
  const guarded = (table: { findOne: unknown; findAll: unknown }) => ({
    findOne: table.findOne, findAll: table.findAll,
    create: (...a: unknown[]) => writes.create(...a), update: (...a: unknown[]) => writes.update(...a), destroy: (...a: unknown[]) => writes.destroy(...a),
  });
  return {
    GrowthJourneyExecutionControl: guarded(T5.controls),
    GrowthJourneyExecution: { ...guarded(T5.executions), count: (...a: unknown[]) => m.receiptCount(...a) },
    JourneyProgram: { findAll: (...a: unknown[]) => m.programFindAll(...a), create: (...a: unknown[]) => writes.create(...a), update: (...a: unknown[]) => writes.update(...a), destroy: (...a: unknown[]) => writes.destroy(...a) },
    Brand: { findAll: (...a: unknown[]) => m.brandFindAll(...a), create: (...a: unknown[]) => writes.create(...a), update: (...a: unknown[]) => writes.update(...a), destroy: (...a: unknown[]) => writes.destroy(...a) },
  };
});
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => m.killSwitch(...a) }));

import * as fs from 'fs';
import * as path from 'path';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { T5, resetPhase5Tables } from '../../services/growthJourney/__tests__/fixtures/phase5Tables';
import { buildReport, controlCovers, parseArgs, renderReport, run } from '../growthJourneyExecutionStatus';

/**
 * T518 - the read-only probe: what the planner would do per scope, every
 * active control that covers it (flags or no flags), the receipts by status.
 * Every write method on every model it touches is a spy that must stay at 0.
 */

const TENANT = 't-col';
const ENT = { brand: 'b-ent', program: 'p-ent' };
const TRN = { brand: 'b-trn', program: 'p-trn' };
const AS_OF = new Date('2026-09-21T15:00:00.000Z');
const row = (r: Record<string, unknown>) => ({ ...r, get: (k: string) => r[k] });
const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({ growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: true, journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over });
const explorerFlags = { growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false, aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false } as never;
const control = (over: Record<string, unknown>) => T5.controls.insert({
  tenant_id: TENANT, kind: 'pause', scope_key: 'pause|b-ent|*|*|*', brand_id: ENT.brand, program_id: null, channel: null, subject_ref: null, mode: 'off',
  cohort_lead_ids: null, daily_limit: null, reason: 'hold', set_by_admin_id: 'admin:7', cleared_at: null, cleared_by_admin_id: null, created_at: AS_OF, ...over,
});
const report = (over: Partial<GrowthJourneyFlags> = {}) => buildReport({ flags: flags(over), explorerFlags, asOf: AS_OF });
const scopeOf = (r: Awaited<ReturnType<typeof buildReport>>, brand: string, channel: string) => r.scopes.find((s) => s.brand_id === brand && s.channel === channel)!;

beforeEach(() => {
  resetPhase5Tables();
  for (const fn of [...Object.values(m), ...Object.values(writes)]) fn.mockReset();
  m.programFindAll.mockResolvedValue([
    row({ id: ENT.program, tenant_id: TENANT, brand_id: ENT.brand, slug: 'business-growth', status: 'active' }),
    row({ id: TRN.program, tenant_id: TENANT, brand_id: TRN.brand, slug: 'learner-journey', status: 'draft' }),
  ]);
  m.brandFindAll.mockResolvedValue([row({ id: ENT.brand, slug: 'colaberry-enterprise' }), row({ id: TRN.brand, slug: 'colaberry-training' })]);
  m.receiptCount.mockImplementation(async (q: { group?: string[] }) => (q?.group ? [] : 0));
  m.killSwitch.mockResolvedValue(false);
});
afterEach(() => {
  // acceptance 7: the probe writes nothing, ever
  for (const fn of Object.values(writes)) expect(fn).not.toHaveBeenCalled();
});

describe('acceptance 7: read-only, and no address', () => {
  it('every brand x programme x executable channel, six scopes here, from four bounded reads; create/update/destroy at 0', async () => {
    const r = await report();
    expect(r.scopes.map((s) => `${s.brand_slug}/${s.program_slug}:${s.channel}`)).toEqual([
      'colaberry-enterprise/business-growth:email', 'colaberry-enterprise/business-growth:in_app', 'colaberry-enterprise/business-growth:ali_outreach',
      'colaberry-training/learner-journey:email', 'colaberry-training/learner-journey:in_app', 'colaberry-training/learner-journey:ali_outreach',
    ]);
    expect(m.programFindAll).toHaveBeenCalledTimes(1);
    expect(m.brandFindAll).toHaveBeenCalledWith({ where: { id: [ENT.brand, TRN.brand] }, attributes: ['id', 'slug'] });
    expect(m.receiptCount).toHaveBeenCalledWith({ group: ['tenant_id', 'brand_id', 'program_id', 'channel', 'status'] });
    expect(r.flags).toEqual({ master: true, decisions: true, execution: true, handoffs: true });
  });

  it('a control reason carrying an address is `redacted` in the report and the rendered lines; nothing printed carries an @', async () => {
    control({ reason: 'ops@colaberry.com asked' });
    const r = await report();
    expect(scopeOf(r, ENT.brand, 'email').controls[0].reason).toBe('redacted');
    const lines = renderReport(r);
    expect(lines.join('\n')).not.toContain('@'); // the raw lines, no carve-out: separators are words
    expect(JSON.stringify(r)).not.toContain('@');
  });
});

describe('the mode, the planner\'s own answer', () => {
  it('flags off -> off (flag_master_off) on every scope, and the controls are STILL listed (the plan\'s M3)', async () => {
    const id = control({}).id;
    const r = await report({ growthJourneyEnabled: false });
    expect(r.scopes.every((s) => s.mode === 'off' && s.mode_reason === 'flag_master_off')).toBe(true);
    expect(scopeOf(r, ENT.brand, 'email').controls.map((c) => c.id)).toEqual([id]);
    expect(scopeOf(r, ENT.brand, 'ali_outreach').controls.map((c) => c.id)).toEqual([id]);
    expect(scopeOf(r, TRN.brand, 'email').controls).toEqual([]);
  });

  it('flags on: no rollout -> shadow; a review rollout -> review with the row named; a pause on the brand -> off with the pause\'s scope as the reason; execution off -> shadow', async () => {
    expect(scopeOf(await report(), ENT.brand, 'email')).toMatchObject({ mode: 'shadow', mode_reason: 'no_rollout', controls: [] });
    const rollout = control({ kind: 'rollout', scope_key: `rollout|${ENT.brand}|${ENT.program}|email`, program_id: ENT.program, channel: 'email', mode: 'review' });
    expect(scopeOf(await report(), ENT.brand, 'email')).toMatchObject({ mode: 'review', mode_reason: 'rollout', controls: [expect.objectContaining({ id: rollout.id, kind: 'rollout', mode: 'review' })] });
    expect(scopeOf(await report(), ENT.brand, 'in_app')).toMatchObject({ mode: 'shadow', mode_reason: 'no_rollout', controls: [] });
    const pause = control({ scope_key: `pause|${ENT.brand}|*|email|*`, channel: 'email' });
    const paused = scopeOf(await report(), ENT.brand, 'email');
    expect(paused).toMatchObject({ mode: 'off', mode_reason: 'pause:brand+channel' });
    expect(paused.controls.map((c) => c.id)).toEqual([rollout.id, pause.id]);
    expect(scopeOf(await report({ journeyExecution: false }), ENT.brand, 'email')).toMatchObject({ mode: 'shadow', mode_reason: 'flag_execution_off' });
  });

  it('a limited rollout lists its cohort size and daily limit; a subject pause is listed under its brand scope with the subject named', async () => {
    control({ kind: 'rollout', scope_key: `rollout|${ENT.brand}|${ENT.program}|in_app`, program_id: ENT.program, channel: 'in_app', mode: 'limited', cohort_lead_ids: [11, 12, 13], daily_limit: 5 });
    control({ scope_key: `pause|${ENT.brand}|*|*|lead:501`, subject_ref: 'lead:501' });
    const s = scopeOf(await report(), ENT.brand, 'in_app');
    expect(s.controls.map((c) => [c.kind, c.cohort_size, c.daily_limit, c.subject_ref])).toEqual([['rollout', 3, 5, null], ['pause', null, null, 'lead:501']]);
    // with no lead in hand the planner's answer for a limited scope is `not_in_cohort` (shadow): the rollout is live, the cohort decides per lead
    expect(s).toMatchObject({ mode: 'shadow', mode_reason: 'not_in_cohort' });
  });

  it('receipts are counted by status from one grouped count, per scope', async () => {
    m.receiptCount.mockImplementation(async (q: { group?: string[] }) => (q?.group ? [
      { tenant_id: TENANT, brand_id: ENT.brand, program_id: ENT.program, channel: 'email', status: 'enrolled', count: 3 },
      { tenant_id: TENANT, brand_id: ENT.brand, program_id: ENT.program, channel: 'email', status: 'blocked', count: '2' },
      { tenant_id: TENANT, brand_id: TRN.brand, program_id: TRN.program, channel: 'in_app', status: 'pending_review', count: 1 },
    ] : 0));
    const r = await report();
    expect(scopeOf(r, ENT.brand, 'email').receipts).toEqual({ enrolled: 3, blocked: 2 });
    expect(scopeOf(r, ENT.brand, 'in_app').receipts).toEqual({});
    expect(scopeOf(r, TRN.brand, 'in_app').receipts).toEqual({ pending_review: 1 });
    expect(renderReport(r).find((l) => l.startsWith('colaberry-enterprise/business-growth (active) · email'))).toContain('receipts: blocked=2 enrolled=3');
  });
});

describe('controlCovers', () => {
  const scope = { brand_id: ENT.brand, program_id: ENT.program, channel: 'email' };
  it.each([
    ['a rollout of exactly the scope', { kind: 'rollout', scope_key: `rollout|${ENT.brand}|${ENT.program}|email`, brand_id: ENT.brand, program_id: ENT.program, channel: 'email' }, true],
    ['a rollout of another channel', { kind: 'rollout', scope_key: `rollout|${ENT.brand}|${ENT.program}|in_app`, brand_id: ENT.brand, program_id: ENT.program, channel: 'in_app' }, false],
    ['a brand-wide pause', { kind: 'pause', scope_key: 'p', brand_id: ENT.brand, program_id: null, channel: null }, true],
    ['a channel-wide pause across brands', { kind: 'pause', scope_key: 'p', brand_id: null, program_id: null, channel: 'email' }, true],
    ['a channel-wide pause on another channel', { kind: 'pause', scope_key: 'p', brand_id: null, program_id: null, channel: 'in_app' }, false],
    ['a pause on another brand', { kind: 'pause', scope_key: 'p', brand_id: TRN.brand, program_id: null, channel: null }, false],
    ['a programme pause on this programme', { kind: 'pause', scope_key: 'p', brand_id: null, program_id: ENT.program, channel: null }, true],
    ['a programme pause on another programme', { kind: 'pause', scope_key: 'p', brand_id: ENT.brand, program_id: TRN.program, channel: null }, false],
  ])('%s', (_name, ctl, expected) => {
    expect(controlCovers(ctl as never, scope)).toBe(expected);
  });
});

describe('the command', () => {
  it('parseArgs: nothing, or --json; anything else is refused', () => {
    expect(parseArgs([])).toEqual({ json: false });
    expect(parseArgs(['--json'])).toEqual({ json: true });
    expect(() => parseArgs(['--write'])).toThrow(/unknown argument/);
  });

  it('run prints the lines (or one JSON document) through the given sink and exits 0 - nothing written', async () => {
    control({});
    const lines: string[] = [];
    expect(await run({ json: false }, (l) => lines.push(l))).toBe(0);
    expect(lines[0]).toMatch(/^growth journey execution status at .* master=false/);
    expect(lines.some((l) => l.startsWith('    pause pause|b-ent|*|*|* mode=off'))).toBe(true);
    const json: string[] = [];
    expect(await run({ json: true }, (l) => json.push(l))).toBe(0);
    expect(JSON.parse(json.join('\n')).scopes).toHaveLength(6);
  });

  it('source-level: the probe imports no module that loads a model FILE, and names no send or write path', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyExecutionStatus.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/reconcileExecutions|models\/GrowthJourney|\.create\(|\.update\(|\.destroy\(|sendMail|enrollLead|ScheduledEmail/);
    expect(src).toMatch(/from '\.\.\/models'/);
  });
});
