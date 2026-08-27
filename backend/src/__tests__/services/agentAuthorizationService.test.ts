import { AiAgent } from '../../models';
import { getSetting } from '../../services/settingsService';
import { emitAiEvent } from '../../services/aiEventService';
import { isKillSwitchActive } from '../../services/launchSafety';
import { isSafeModeActive } from '../../services/systemControlService';
import { authorizeAgentAction, getAbacMode, getAgentAuthorizationSummary } from '../../services/agentAuthorizationService';
import { sequelize } from '../../config/database';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({ AiAgent: { findOne: jest.fn() } }));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../../services/systemControlService', () => ({ isSafeModeActive: jest.fn() }));

const findOne = AiAgent.findOne as unknown as jest.Mock;
const mockSetting = getSetting as unknown as jest.Mock;
const mockEmit = emitAiEvent as unknown as jest.Mock;
const mockKill = isKillSwitchActive as unknown as jest.Mock;
const mockSafe = isSafeModeActive as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSetting.mockResolvedValue('shadow');
  findOne.mockResolvedValue(null); // unregistered → not disabled
  mockKill.mockResolvedValue(false);
  mockSafe.mockResolvedValue(false);
});

const base = { agentId: 'a1', agentName: 'TestAgent' };

describe('getAbacMode', () => {
  it('defaults to shadow for blank/garbage; honors off/enforce', async () => {
    mockSetting.mockResolvedValue('garbage');
    expect(await getAbacMode()).toBe('shadow');
    mockSetting.mockResolvedValue('enforce');
    expect(await getAbacMode()).toBe('enforce');
    mockSetting.mockResolvedValue('off');
    expect(await getAbacMode()).toBe('off');
  });
});

describe('authorizeAgentAction — shadow-first', () => {
  it('shadow: an over-privileged action is recorded as would-deny but NOT blocked', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.wouldDeny).toBe(true); // observe may not write
    expect(r.allowed).toBe(true); // shadow never blocks
    expect(r.enforced).toBe(false);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const meta = mockEmit.mock.calls[0][0].metadata;
    expect(meta.would_deny).toBe(true);
    expect(meta.verdict).toBe('block');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('success'); // shadow → action proceeds
  });

  it('enforce: the same action is actually blocked', async () => {
    mockSetting.mockResolvedValue('enforce');
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.allowed).toBe(false);
    expect(r.enforced).toBe(true);
    expect(r.reason).toBe('level_forbids:write');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('blocked');
  });

  it('allows an in-scope action (communicate tier sending email, established lead)', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });
    expect(r.allowed).toBe(true);
    expect(r.wouldDeny).toBe(false);
    expect(r.reason).toBe('ok');
  });
});

describe('authorizeAgentAction — kill switch (Q6: reads keep running)', () => {
  it('blocks a side-effecting action when the kill switch is on', async () => {
    mockKill.mockResolvedValue(true);
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'write_with_audit' });
    expect(r.wouldDeny).toBe(true);
    expect(r.reason).toBe('kill_switch_active');
  });
  it('lets a READ run even with the kill switch on', async () => {
    mockKill.mockResolvedValue(true);
    const r = await authorizeAgentAction({ ...base, action: 'scan_campaign', tier: 'read_only' });
    expect(r.wouldDeny).toBe(false);
    expect(r.reason).toBe('ok');
  });
});

describe('authorizeAgentAction — HITL', () => {
  it('enforce: a first-touch send to a new lead is queued for approval, not executed', async () => {
    mockSetting.mockResolvedValue('enforce');
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication', context: { isNewLead: true } });
    expect(r.requiresApproval).toBe(true);
    expect(r.allowed).toBe(false); // queued
    expect(r.reason).toBe('requires_approval:first_touch_new_lead');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('escalated');
  });
  it('shadow: the same action proceeds but is logged as would-deny', async () => {
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication', context: { isNewLead: true } });
    expect(r.requiresApproval).toBe(true);
    expect(r.allowed).toBe(true);
    expect(r.wouldDeny).toBe(true);
  });
});

describe('authorizeAgentAction — disabled agent + off + fail-open', () => {
  it('enforce: a disabled/paused agent is blocked', async () => {
    mockSetting.mockResolvedValue('enforce');
    findOne.mockResolvedValue({ enabled: false, status: 'paused' });
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('agent_disabled');
  });
  it('off: gate disabled, nothing emitted, always allows', async () => {
    mockSetting.mockResolvedValue('off');
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'read_only' });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('gate_off'); // off short-circuits before evaluation
    // off mode never emits
    expect(mockEmit).not.toHaveBeenCalled();
  });
  it('FAILS OPEN: an internal error never blocks a live agent path', async () => {
    mockSetting.mockResolvedValue('enforce');
    mockKill.mockRejectedValue(new Error('control plane down'));
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'write_with_audit' });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('authz_error');
  });
});

// AI Workforce Reset (2026-08-25) — the reactivation flow's real, human-chosen
// autonomy_level is now wired into this gate, but ONLY when
// autonomy_level_set_at proves it was deliberately set (not the untouched
// migration default sitting on every agent that has never been reactivated).
describe('authorizeAgentAction — deliberate autonomy_level from the reactivation flow', () => {
  it('a deliberately-set autonomy_level OVERRIDES the tier-derived level, even when they disagree', async () => {
    findOne.mockResolvedValue({ enabled: true, status: 'idle', autonomy_level: 'communicate', autonomy_level_set_at: new Date() });
    // tier: 'read_only' would normally derive 'observe' (may not send email) — the
    // deliberately-reactivated 'communicate' level must win instead.
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'read_only' });

    expect(r.level).toBe('communicate');
    expect(r.wouldDeny).toBe(false);
    expect(r.reason).toBe('ok');
  });

  it('a deliberate DEMOTION also works — reactivating at "observe" blocks a write even for a high-tier agent', async () => {
    findOne.mockResolvedValue({ enabled: true, status: 'idle', autonomy_level: 'observe', autonomy_level_set_at: new Date() });
    const r = await authorizeAgentAction({ ...base, action: 'update_campaign_config', tier: 'communication' });

    expect(r.level).toBe('observe');
    expect(r.wouldDeny).toBe(true);
    expect(r.reason).toBe('level_forbids:write');
  });

  it('boundary: autonomy_level set but autonomy_level_set_at is null (the untouched migration default) — tier-derived level keeps governing, unchanged', async () => {
    findOne.mockResolvedValue({ enabled: true, status: 'idle', autonomy_level: 'observe', autonomy_level_set_at: null });
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });

    // Proves the fix doesn't silently demote the untouched fleet: a real,
    // long-running 'communication'-tier agent (Reese, cory-engine, ...) that
    // has never been through the reactivation flow keeps working exactly as
    // it did before this change, DESPITE autonomy_level literally being
    // 'observe' in the DB (the Phase C migration's default value).
    expect(r.level).toBe('communicate');
    expect(r.wouldDeny).toBe(false);
  });

  it('boundary: no registry row at all (unregistered .js cron) still falls back cleanly to the tier-derived level', async () => {
    findOne.mockResolvedValue(null);
    const r = await authorizeAgentAction({ ...base, action: 'send_email', tier: 'communication' });

    expect(r.level).toBe('communicate');
    expect(r.wouldDeny).toBe(false);
  });
});

// Trust Contract Phase 1 (2026-08-26) — per-agent read of the real
// agent.authorization ai_events trail, sibling to countAbacChecks() above
// (same table, same event_type, scoped to one agent instead of the fleet).
describe('getAgentAuthorizationSummary', () => {
  const mockQuery = sequelize.query as unknown as jest.Mock;

  it('happy path: sums real verdict/enforced rows into the public summary shape', async () => {
    mockQuery.mockResolvedValue([
      { verdict: 'allow', enforced: false, n: 12 },
      { verdict: 'approval', enforced: false, n: 3 },
      { verdict: 'block', enforced: false, n: 1 },
      { verdict: 'allow', enforced: true, n: 2 }, // a small real-enforce-mode slice
    ]);

    const result = await getAgentAuthorizationSummary('agent-1', 'TestAgent', 30);

    expect(result).toEqual({ window_days: 30, total: 18, allow: 14, approval: 3, block: 1, enforced_count: 2 });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("event_type = 'agent.authorization'"),
      expect.objectContaining({ replacements: { agentId: 'agent-1', agentName: 'TestAgent', days: 30 } }),
    );
  });

  // Production-verification fix (2026-08-26) — Reese's real events are stored
  // under `agent_id = 'Reese'` (the bare name), not her UUID, because
  // agentActionAuthorizationBridge.ts passes the name through. Proves the
  // query matches on EITHER form, not just the real UUID.
  it('matches events keyed on the bare agent name, not only the real UUID (agentActionAuthorizationBridge.ts stores the name)', async () => {
    mockQuery.mockResolvedValue([{ verdict: 'allow', enforced: false, n: 13 }]);

    const result = await getAgentAuthorizationSummary('agent-uuid-1', 'Reese', 30);

    expect(result.total).toBe(13);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('agent_id IN (:agentId, :agentName)'),
      expect.objectContaining({ replacements: { agentId: 'agent-uuid-1', agentName: 'Reese', days: 30 } }),
    );
  });

  it('boundary: an agent with zero authorization events yet returns honest zeros, not an error', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await getAgentAuthorizationSummary('agent-1', 'TestAgent');

    expect(result).toEqual({ window_days: 30, total: 0, allow: 0, approval: 0, block: 0, enforced_count: 0 });
  });

  it('fails safe: a query error returns honest zeros rather than throwing and breaking the whole detail page', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    const result = await getAgentAuthorizationSummary('agent-1', 'TestAgent');

    expect(result).toEqual({ window_days: 30, total: 0, allow: 0, approval: 0, block: 0, enforced_count: 0 });
  });
});
