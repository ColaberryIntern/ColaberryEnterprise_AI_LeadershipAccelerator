const killSwitch = jest.fn();
jest.mock('../../../../models', () => require('../../__tests__/fixtures/phase5Tables').phase5ModelsMock);
jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: (...a: unknown[]) => killSwitch(...a) }));

import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import { clock, AS_OF_4 } from '../../__tests__/fixtures/phase4Tables';
import { T5, resetPhase5Tables } from '../../__tests__/fixtures/phase5Tables';
import { pauseScopeKey, rolloutScopeKey } from '../scopeKey';
import {
  EXECUTABLE_CHANNELS,
  REVIEW_ONLY_CHANNELS,
  resolveExecutionHold,
  resolveExecutionMode,
  type ExecutionChannel,
  type ModeTarget,
} from '../resolveExecutionMode';

/**
 * T504 — the ladder, top to bottom, against the real control rows (the fixture
 * world enforces T503's indexes from the shipped DDL) and §16 K at planning:
 * a global kill switch, or a pause at any of four scopes, and no new execution
 * is planned.
 */

const TENANT = 't-col';
const BRAND = 'b-ent';
const PROGRAM = 'p-ent';
const LEAD = 501;

const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false,
  journeyDecisions: true, journeyHandoffs: true, journeyExecution: true, ...over,
});
const explorerFlags = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false,
  journeyGovernorEnabled: false, commercialEnabled: false, aliOutreachEnabled: true,
  smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

const target = (over: Partial<ModeTarget> = {}): ModeTarget => ({
  tenantId: TENANT, brandId: BRAND, programId: PROGRAM, channel: 'email',
  subjectRef: `lead:${LEAD}`, leadId: LEAD, asOf: AS_OF_4,
  flags: flags(), explorerFlags: explorerFlags(), ...over,
});

const rollout = (over: Record<string, unknown> = {}) => T5.controls.insert({
  tenant_id: TENANT, kind: 'rollout', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'email' }),
  brand_id: BRAND, program_id: PROGRAM, channel: 'email', subject_ref: null, mode: 'limited',
  cohort_lead_ids: [LEAD], daily_limit: 3, cleared_at: null, ...over,
});
const pause = (scope: Parameters<typeof pauseScopeKey>[0], over: Record<string, unknown> = {}) => T5.controls.insert({
  tenant_id: TENANT, kind: 'pause', scope_key: pauseScopeKey(scope), brand_id: scope.brandId ?? null,
  program_id: scope.programId ?? null, channel: scope.channel ?? null, subject_ref: scope.subjectRef ?? null,
  mode: 'off', cohort_lead_ids: null, daily_limit: null, cleared_at: null, ...over,
});
const receiptToday = (over: Record<string, unknown> = {}) => T5.executions.insert({
  tenant_id: TENANT, brand_id: BRAND, program_id: PROGRAM, decision_id: `d-${Math.random()}`,
  subject_ref: `lead:${LEAD}`, lead_id: LEAD, enrollment_id: null, channel: 'email', action_type: 'SEND_EMAIL',
  mode: 'limited', status: 'completed', created_at: AS_OF_4, ...over,
});

beforeEach(() => {
  resetPhase5Tables();
  clock.now = AS_OF_4;
  killSwitch.mockReset().mockResolvedValue(false);
});

describe('the ladder, in order', () => {
  it('1 master flag off -> off/flag_master_off, and nothing is even read', async () => {
    rollout();
    expect(await resolveExecutionMode(target({ flags: flags({ growthJourneyEnabled: false }) })))
      .toEqual({ mode: 'off', reason: 'flag_master_off', control_ids: [] });
    expect(killSwitch).not.toHaveBeenCalled();
  });

  it('2 the execution flag off -> shadow; with decisions off too -> observe', async () => {
    expect(await resolveExecutionMode(target({ flags: flags({ journeyExecution: false }) })))
      .toEqual({ mode: 'shadow', reason: 'flag_execution_off', control_ids: [] });
    expect(await resolveExecutionMode(target({ flags: flags({ journeyExecution: false, journeyDecisions: false }) })))
      .toEqual({ mode: 'observe', reason: 'flag_decisions_off', control_ids: [] });
  });

  it('3 the channel\'s Explorer sub-flag must agree: either family off means off', async () => {
    rollout(); // email
    rollout({ channel: 'in_app', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'in_app' }), mode: 'review' });
    expect(await resolveExecutionMode(target({ channel: 'in_app', explorerFlags: explorerFlags({ inAppNudgeEnabled: false }) })))
      .toEqual({ mode: 'shadow', reason: 'explorer_flag_off:inAppNudge', control_ids: [] });
    expect(await resolveExecutionMode(target({ channel: 'ali_outreach', explorerFlags: explorerFlags({ aliOutreachEnabled: false }) })))
      .toMatchObject({ mode: 'shadow', reason: 'explorer_flag_off:aliOutreach' });
    // Email has no Explorer sub-flag of its own, so it is not gated by one (the control).
    expect(await resolveExecutionMode(target({ explorerFlags: explorerFlags({ inAppNudgeEnabled: false, aliOutreachEnabled: false }) })))
      .toMatchObject({ mode: 'limited' });
  });

  it.each(['sms', 'voice'])('4 %s is refused by construction, before any row or switch is read', async (channel) => {
    rollout();
    expect(await resolveExecutionMode(target({ channel: channel as ExecutionChannel })))
      .toEqual({ mode: 'off', reason: 'channel_not_authorized', control_ids: [] });
    expect(killSwitch).not.toHaveBeenCalled();
    expect(EXECUTABLE_CHANNELS).toEqual(['email', 'in_app', 'ali_outreach']);
  });

  it('5 the kill switch beats any rollout, and an UNREADABLE switch is treated as ON', async () => {
    rollout();
    killSwitch.mockResolvedValue(true);
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'off', reason: 'kill_switch', control_ids: [] });
    killSwitch.mockRejectedValue(new Error('connection reset'));
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'off', reason: 'kill_switch_unreadable', control_ids: [] });
  });

  it.each([
    ['brand', { brandId: BRAND }, 'pause:brand'],
    ['programme', { programId: PROGRAM }, 'pause:programme'],
    ['channel', { channel: 'email' }, 'pause:channel'],
    ['subject', { subjectRef: `lead:${LEAD}` }, 'pause:subject'],
  ])('6 a %s pause beats a limited rollout (Scenario K at planning)', async (_name, scope, reason) => {
    rollout();
    const row = pause(scope);
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'off', reason, control_ids: [row.id] });
  });

  it('6b the MOST SPECIFIC pause is the one named, and a cleared pause stops nothing', async () => {
    rollout();
    pause({ brandId: BRAND });
    const precise = pause({ brandId: BRAND, programId: PROGRAM, channel: 'email', subjectRef: `lead:${LEAD}` });
    expect(await resolveExecutionMode(target())).toMatchObject({ reason: 'pause:brand+programme+channel+subject', control_ids: [precise.id] });
    await (precise as unknown as { update: (p: Record<string, unknown>) => Promise<unknown> }).update({ cleared_at: AS_OF_4 });
    expect(await resolveExecutionMode(target())).toMatchObject({ reason: 'pause:brand' });
  });

  it('6c a pause in ANOTHER brand, programme, channel or subject does not reach this target', async () => {
    rollout();
    pause({ brandId: 'b-other' });
    pause({ programId: 'p-other' });
    pause({ channel: 'in_app' });
    pause({ subjectRef: 'lead:999' });
    expect(await resolveExecutionMode(target())).toMatchObject({ mode: 'limited' });
  });

  it('7 no rollout row -> shadow/no_rollout, which is the shipped state', async () => {
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'shadow', reason: 'no_rollout', control_ids: [] });
  });

  it('7b a review rollout -> review; a limited one for a cohort lead -> limited', async () => {
    const review = rollout({ mode: 'review', cohort_lead_ids: null, daily_limit: null });
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'review', reason: 'rollout', control_ids: [review.id] });
    resetPhase5Tables();
    const limited = rollout();
    expect(await resolveExecutionMode(target())).toEqual({ mode: 'limited', reason: 'rollout', control_ids: [limited.id] });
  });

  it('8 a lead outside the cohort is not executed on, and a lead-less subject never is', async () => {
    rollout();
    expect(await resolveExecutionMode(target({ leadId: 777 }))).toMatchObject({ mode: 'shadow', reason: 'not_in_cohort' });
    expect(await resolveExecutionMode(target({ leadId: null }))).toMatchObject({ mode: 'shadow', reason: 'not_in_cohort' });
  });

  it('8b the daily limit is per UTC day: at the limit it falls back to review, and tomorrow it is limited again', async () => {
    rollout({ daily_limit: 2 });
    receiptToday();
    expect(await resolveExecutionMode(target())).toMatchObject({ mode: 'limited' });
    receiptToday();
    expect(await resolveExecutionMode(target())).toMatchObject({ mode: 'review', reason: 'daily_limit_reached' });
    // Yesterday's receipts do not count against today.
    const tomorrow = new Date(AS_OF_4.getTime() + 24 * 3_600_000);
    expect(await resolveExecutionMode(target({ asOf: tomorrow }))).toMatchObject({ mode: 'limited' });
  });

  it('9 ali outreach is capped at review even when the rollout says limited', async () => {
    rollout({ channel: 'ali_outreach', scope_key: rolloutScopeKey({ brandId: BRAND, programId: PROGRAM, channel: 'ali_outreach' }) });
    expect(await resolveExecutionMode(target({ channel: 'ali_outreach' })))
      .toMatchObject({ mode: 'review', reason: 'review_only_channel' });
    expect(REVIEW_ONLY_CHANNELS).toEqual(['ali_outreach']);
  });
});

describe('the hold: what stops work ALREADY in flight', () => {
  it.each([
    ['the master flag', () => target({ flags: flags({ growthJourneyEnabled: false }) }), 'flag_master_off'],
    ['the execution flag', () => target({ flags: flags({ journeyExecution: false }) }), 'flag_execution_off'],
    ['an Explorer sub-flag', () => target({ channel: 'in_app', explorerFlags: explorerFlags({ inAppNudgeEnabled: false }) }), 'explorer_flag_off:inAppNudge'],
  ])('%s holds it', async (_name, make, reason) => {
    rollout();
    expect(await resolveExecutionHold(make())).toMatchObject({ held: true, reason });
  });

  it('the kill switch holds it, readable or not', async () => {
    rollout();
    killSwitch.mockResolvedValue(true);
    expect(await resolveExecutionHold(target())).toMatchObject({ held: true, reason: 'kill_switch' });
    killSwitch.mockRejectedValue(new Error('down'));
    expect(await resolveExecutionHold(target())).toMatchObject({ held: true, reason: 'kill_switch_unreadable' });
  });

  it.each([
    ['brand', { brandId: BRAND }],
    ['programme', { programId: PROGRAM }],
    ['channel', { channel: 'email' }],
    ['subject', { subjectRef: `lead:${LEAD}` }],
  ])('a %s pause holds it, and names the control that did (Scenario K in flight)', async (_name, scope) => {
    rollout();
    const row = pause(scope);
    expect(await resolveExecutionHold(target())).toMatchObject({ held: true, control_ids: [row.id] });
  });

  it('a cleared ROLLOUT does NOT hold work already in flight - it stops the next plan', async () => {
    const row = rollout();
    await (row as unknown as { update: (p: Record<string, unknown>) => Promise<unknown> }).update({ cleared_at: AS_OF_4 });
    expect(await resolveExecutionMode(target())).toMatchObject({ mode: 'shadow', reason: 'no_rollout' });
    expect(await resolveExecutionHold(target())).toEqual({ held: false, reason: null, control_ids: [] });
  });

  it('a lead removed from the cohort, and a spent daily limit, do NOT hold either', async () => {
    rollout({ daily_limit: 1 });
    receiptToday();
    expect(await resolveExecutionMode(target())).toMatchObject({ mode: 'review', reason: 'daily_limit_reached' });
    expect(await resolveExecutionHold(target())).toMatchObject({ held: false });
    expect(await resolveExecutionHold(target({ leadId: 777 }))).toMatchObject({ held: false });
  });

  it('with everything open, nothing is held', async () => {
    rollout();
    expect(await resolveExecutionHold(target())).toEqual({ held: false, reason: null, control_ids: [] });
  });
});
