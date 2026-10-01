/**
 * agentEffectiveAccessService — R196 (resolver scaffolding, the "grant"
 * sources: GRANTS, REESE_TOOLS/DARA_TOOLS, tools_granted, AGENT_PERMISSIONS).
 * Mocks reeseTools.ts/daraTools.ts/agentPermissionService.ts wholesale — each
 * transitively imports the models barrel (ticketService.ts,
 * studentSuccessSnapshot, etc.), the same Sequelize association-graph crash
 * this mission's Phase 2 work hit and fixed repeatedly this session.
 */
const mockAiAgentFindByPk = jest.fn();
const mockAiAgentFindOne = jest.fn();
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockAiAgentFindByPk(...a),
    findOne: (...a: any[]) => mockAiAgentFindOne(...a),
  },
}));

jest.mock('../../reese/reeseTools', () => ({
  REESE_TOOLS: [
    { type: 'function', function: { name: 'read_student_success_snapshot' } },
    { type: 'function', function: { name: 'assess_student_health' } },
  ],
}));

jest.mock('../../curriculum/daraTools', () => ({
  DARA_TOOLS: [{ type: 'function', function: { name: 'escalate_to_human' } }],
}));

const mockGetAgentPermission = jest.fn();
jest.mock('../../agentPermissionService', () => ({
  getAgentPermission: (...a: any[]) => mockGetAgentPermission(...a),
}));

// capabilityRegistry.ts imports `{ Ticket } from '../../models'` (the models
// barrel) at its own top level — the same Sequelize association-graph crash
// this mission's Phase 2 work hit and fixed repeatedly. Mocked wholesale;
// `agentToolCapabilities.ts` has zero imports of its own and runs for real.
jest.mock('../../workGraph/capabilityRegistry', () => ({
  CAPABILITY_REGISTRY: [
    { capabilityId: 'curriculum.design_module', agent_name: 'CurriculumArchitectAgent', enabled: true, maxRiskTier: 'R4', resourceScopePattern: '*' },
    { capabilityId: 'curriculum.generic_fallback', agent_name: 'CurriculumArchitectAgent', enabled: true, maxRiskTier: 'R4', resourceScopePattern: '*' },
  ],
}));

// agentAuthorizationService.ts imports `{ AiAgent } from '../models'` (the
// barrel) at its own top level — same crash class. Mocked wholesale for
// R200; `agentAutonomy.ts` has zero imports of its own and runs for real
// (R200's whole point is exercising its REAL levelAllowsAction/
// actionRequiresApproval against real tool-name strings).
const mockGetAbacMode = jest.fn();
jest.mock('../../agentAuthorizationService', () => ({
  getAbacMode: (...a: any[]) => mockGetAbacMode(...a),
  // resolveEffectiveMode's real body is exactly `override ?? globalMode` —
  // reproduced inline rather than requireActual'd, since requireActual
  // would re-trigger the exact barrel-import crash this mock exists to
  // avoid (agentAuthorizationService.ts's own top-level `{ AiAgent } from
  // '../models'` import).
  resolveEffectiveMode: (globalMode: string, override: string | null) => override ?? globalMode,
}));

import { resolveEffectiveAccess } from '../agentEffectiveAccessService';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAgentPermission.mockReturnValue({ tier: 'suggest_only' });
  mockAiAgentFindOne.mockResolvedValue(null);
  mockGetAbacMode.mockResolvedValue('shadow');
});

describe('resolveEffectiveAccess', () => {
  it('nonexistent agent returns null, never fabricated', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await resolveEffectiveAccess('does-not-exist');

    expect(result).toBeNull();
  });

  it("Reese: GRANTS' real read_attachments grant is flagged as a real, grounded mismatch against her real tools_granted gap (agentToolRegistry.ts runs for real — no transitive barrel import to mock)", async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-reese',
      agent_name: 'Reese',
      tools_granted: ['respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health'],
    });

    const result = await resolveEffectiveAccess('agent-reese');

    expect(result).not.toBeNull();
    const readAttachments = result!.tools.find((t) => t.toolName === 'read_attachments');
    expect(readAttachments?.registered).toBe(true);
    expect(readAttachments?.grantedVia).toEqual(['GRANTS']);
    expect(readAttachments?.mismatches).toContain('granted via GRANTS but absent from tools_granted');
    // read_attachments is also a real, honest TOOL_CAPABILITIES gap (R197) —
    // the dictionary only covers Reese's 4 main tools, not this cross-agent
    // GRANTS-only one. A second genuine finding, not a bug in either task.
    expect(readAttachments?.mismatches).toContain('granted/registered but has no TOOL_CAPABILITIES entry (undocumented)');
    expect(readAttachments?.documented).toBe(false);

    // The other 2 real tools ARE already consistent across both
    // tools_granted and REESE_TOOLS — no mismatch, proving this isn't a
    // blanket "always flag everything" bug.
    const snapshotTool = result!.tools.find((t) => t.toolName === 'read_student_success_snapshot');
    expect(snapshotTool?.registered).toBe(true);
    expect(snapshotTool?.grantedVia).toEqual(expect.arrayContaining(['REESE_TOOLS', 'tools_granted']));
    expect(snapshotTool?.mismatches).toEqual([]);
  });

  it('a no-data agent reports every field honestly empty, never fabricated', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-nodata',
      agent_name: 'SomeUnrelatedAgent',
      tools_granted: null,
      enabled: true,
    });

    const result = await resolveEffectiveAccess('agent-nodata');

    expect(result?.tools).toEqual([]);
    expect(result?.mismatches).toEqual([]);
    expect(result?.charterNote).toContain('not enforced by any code boundary');
  });

  it('TOOL_CAPABILITIES display data attaches to a known, documented tool and never leaks into grantedVia', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-reese',
      agent_name: 'Reese',
      tools_granted: ['read_student_success_snapshot'],
      enabled: true,
    });

    const result = await resolveEffectiveAccess('agent-reese');

    const snapshotTool = result!.tools.find((t) => t.toolName === 'read_student_success_snapshot');
    expect(snapshotTool?.documented).toBe(true);
    expect(snapshotTool?.reads.length).toBeGreaterThan(0);
    // TOOL_CAPABILITIES is display metadata only — its source name never
    // appears as a grantedVia entry, matching the contract's own
    // "never merged into grantedVia" instruction.
    expect(snapshotTool?.grantedVia).not.toContain('TOOL_CAPABILITIES');
  });

  it('a tool with no TOOL_CAPABILITIES entry is surfaced honestly as undocumented, never silently dropped', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-x',
      agent_name: 'SomeUnrelatedAgent',
      tools_granted: ['totally_made_up_tool_name'],
      enabled: true,
    });

    const result = await resolveEffectiveAccess('agent-x');

    const tool = result!.tools.find((t) => t.toolName === 'totally_made_up_tool_name');
    expect(tool?.documented).toBe(false);
    expect(tool?.reads).toEqual([]);
    expect(tool?.mismatches).toContain('granted/registered but has no TOOL_CAPABILITIES entry (undocumented)');
  });

  it('a ProofDesk agent (capabilityRegistry.ts, source #10) has its hardcoded enabled:true literal flagged as disconnected from live AiAgent.enabled, regardless of current value', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-cqa',
      agent_name: 'CurriculumArchitectAgent',
      tools_granted: [],
      enabled: true,
    });

    const result = await resolveEffectiveAccess('agent-cqa');

    expect(result?.mismatches).toHaveLength(2); // one per real CAPABILITY_REGISTRY entry for this agent
    expect(result?.mismatches[0]).toMatch(/hardcoded enabled:true literal/);
    expect(result?.mismatches[0]).toMatch(/never reads this agent's real AiAgent.enabled/);
  });

  it('a non-ProofDesk agent never gets a capabilityRegistry mismatch (no false positives)', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-reese',
      agent_name: 'Reese',
      tools_granted: [],
      enabled: true,
    });

    const result = await resolveEffectiveAccess('agent-reese');

    expect(result?.mismatches).toEqual([]);
  });

  it('Dara: escalate_to_human is registered via DARA_TOOLS even when tools_granted omits it, and the gap is flagged', async () => {
    mockAiAgentFindByPk.mockResolvedValue({
      id: 'agent-dara',
      agent_name: 'Dara',
      tools_granted: ['flag_curriculum_content_gaps'],
    });

    const result = await resolveEffectiveAccess('agent-dara');

    const escalate = result!.tools.find((t) => t.toolName === 'escalate_to_human');
    expect(escalate?.registered).toBe(true);
    expect(escalate?.grantedVia).toEqual(['DARA_TOOLS']);
    expect(escalate?.mismatches).toEqual(['granted via DARA_TOOLS but absent from tools_granted']);
  });

  describe('R198 — autonomy-level provenance (disclosure only; agentAuthorizationService.ts is never touched or imported by this file, so resolveLevel()\'s live behavior is unchanged by construction, not just by test)', () => {
    it("reports Reese's real production state honestly: 'auto', matching her confirmed auto-classification (never a human review)", async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-reese',
        agent_name: 'Reese',
        tools_granted: [],
        autonomy_level: 'communicate',
        autonomy_level_set_at: new Date('2026-09-15T00:00:00Z'),
        autonomy_level_source: 'auto',
      });

      const result = await resolveEffectiveAccess('agent-reese');

      expect(result?.autonomyLevel).toBe('communicate');
      expect(result?.autonomyProvenance).toBe('auto');
    });

    it("reports 'manual' only when a human genuinely set it via the reactivation flow", async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-x',
        agent_name: 'SomeAgent',
        tools_granted: [],
        autonomy_level: 'suggest',
        autonomy_level_set_at: new Date('2026-08-25T00:00:00Z'),
        autonomy_level_source: 'manual',
      });

      const result = await resolveEffectiveAccess('agent-x');

      expect(result?.autonomyProvenance).toBe('manual');
    });

    it("reports 'unknown' (never guessed as 'manual') for a legacy row set before the source column existed — set_at stamped, source null", async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-legacy',
        agent_name: 'LegacyAgent',
        tools_granted: [],
        autonomy_level: 'suggest',
        autonomy_level_set_at: new Date('2026-07-01T00:00:00Z'),
        autonomy_level_source: null,
      });

      const result = await resolveEffectiveAccess('agent-legacy');

      expect(result?.autonomyProvenance).toBe('unknown');
    });

    it("reports 'never_set' for an agent nothing has ever classified", async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-untouched',
        agent_name: 'UntouchedAgent',
        tools_granted: [],
        autonomy_level: null,
        autonomy_level_set_at: null,
        autonomy_level_source: null,
      });

      const result = await resolveEffectiveAccess('agent-untouched');

      expect(result?.autonomyProvenance).toBe('never_set');
      expect(result?.autonomyLevel).toBeNull();
    });
  });

  describe("R199 — 'enabled' fan-out across Reese's real, fragmented AiAgent rows (reeseBehaviourSwitchService.ts's real SIBLING_REGISTRY_NAME, reused not duplicated)", () => {
    it("Reese: reports all 4 real sibling rows individually and flags disagreement, not a collapsed boolean", async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-reese',
        agent_name: 'Reese',
        tools_granted: [],
        enabled: true,
      });
      mockAiAgentFindOne.mockImplementation(async ({ where }: { where: { agent_name: string } }) => {
        const enabledMap: Record<string, boolean> = {
          ReeseAutonomousOutreachSweep: true,
          ReeseOutreachFollowUps: false, // deliberately disagrees with the main row
          ReesePresenceHeartbeat: true,
          ReeseStudentSupportSupersessionResolver: true,
        };
        const enabled = enabledMap[where.agent_name];
        return enabled === undefined ? null : { agent_name: where.agent_name, enabled };
      });

      const result = await resolveEffectiveAccess('agent-reese');

      expect(result?.enabledRows).toHaveLength(5); // main + 4 real siblings
      expect(result?.enabledRows.filter((r) => r.role === 'sibling')).toHaveLength(4);
      const followUps = result?.enabledRows.find((r) => r.agentName === 'ReeseOutreachFollowUps');
      expect(followUps?.enabled).toBe(false);
      expect(result?.mismatches.some((m) => m.includes('ReeseOutreachFollowUps') && m.includes('does not cascade'))).toBe(true);
    });

    it('Reese: no mismatch note when every sibling agrees with the main row', async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-reese',
        agent_name: 'Reese',
        tools_granted: [],
        enabled: true,
      });
      mockAiAgentFindOne.mockResolvedValue({ agent_name: 'x', enabled: true });

      const result = await resolveEffectiveAccess('agent-reese');

      expect(result?.mismatches).toEqual([]);
    });

    it('a non-Reese agent reports only its own single row — no fabricated siblings', async () => {
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-dara',
        agent_name: 'Dara',
        tools_granted: [],
        enabled: true,
      });

      const result = await resolveEffectiveAccess('agent-dara');

      expect(result?.enabledRows).toEqual([{ agentName: 'Dara', enabled: true, role: 'main' }]);
      expect(mockAiAgentFindOne).not.toHaveBeenCalled();
    });
  });

  describe("R200 — 'usable' (read-only policy evaluation; agentAutonomy.ts runs for real, never mocked — this suite exercises its REAL classifier against real tool names)", () => {
    it('shadow mode: usable even for a tool the level would otherwise deny, because shadow never actually blocks', async () => {
      mockGetAbacMode.mockResolvedValue('shadow');
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-dara',
        agent_name: 'Dara',
        tools_granted: ['escalate_to_human'],
        enabled: true,
        autonomy_level: null,
        autonomy_level_set_at: null,
        abac_mode_override: null,
      });
      mockGetAgentPermission.mockReturnValue({ tier: 'read_only' }); // 'observe' level — would deny a write-shaped action if enforced

      const result = await resolveEffectiveAccess('agent-dara');

      const escalate = result!.tools.find((t) => t.toolName === 'escalate_to_human');
      expect(result?.abacMode).toBe('shadow');
      expect(escalate?.usable).toBe(true);
    });

    it('enforce mode + a level that genuinely allows the action: usable', async () => {
      mockGetAbacMode.mockResolvedValue('shadow'); // global default irrelevant once overridden
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-reese',
        agent_name: 'Reese',
        tools_granted: ['read_student_success_snapshot'],
        enabled: true,
        autonomy_level: 'communicate', // Reese's real, confirmed production level — top rung, allows everything
        autonomy_level_set_at: new Date('2026-09-15T00:00:00Z'),
        autonomy_level_source: 'auto',
        abac_mode_override: 'enforce', // Reese's real, confirmed production override
      });

      const result = await resolveEffectiveAccess('agent-reese');

      const snapshot = result!.tools.find((t) => t.toolName === 'read_student_success_snapshot');
      expect(result?.abacMode).toBe('enforce');
      expect(snapshot?.usable).toBe(true);
    });

    it("enforce mode + a level that genuinely denies the action: NOT usable (the real, honest caveat this field's own doc comment discloses)", async () => {
      mockGetAbacMode.mockResolvedValue('enforce');
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-x',
        agent_name: 'SomeAgent',
        tools_granted: ['create_something_real'], // classifies as 'write' by agentAutonomy.ts's real heuristic
        enabled: true,
        autonomy_level: null,
        autonomy_level_set_at: null,
        abac_mode_override: null,
      });
      mockGetAgentPermission.mockReturnValue({ tier: 'read_only' }); // -> 'observe' level, which only allows 'read'

      const result = await resolveEffectiveAccess('agent-x');

      const tool = result!.tools.find((t) => t.toolName === 'create_something_real');
      expect(tool?.usable).toBe(false);
    });

    it('a tool that is not even registered/granted is never usable, regardless of mode or level', async () => {
      mockGetAbacMode.mockResolvedValue('shadow');
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-x',
        agent_name: 'SomeAgent',
        tools_granted: ['totally_made_up_tool_name'],
        enabled: true,
        autonomy_level: null,
        autonomy_level_set_at: null,
        abac_mode_override: null,
      });

      const result = await resolveEffectiveAccess('agent-x');

      const tool = result!.tools.find((t) => t.toolName === 'totally_made_up_tool_name');
      // Free-text tools_granted entries with no backing source ARE in the
      // report (so the mismatch is visible) but never usable — nothing real
      // to execute regardless of policy.
      expect(tool?.registered).toBe(false);
      expect(tool?.usable).toBe(false);
    });

    it('a disabled agent is never usable, even in shadow mode with a permissive level', async () => {
      mockGetAbacMode.mockResolvedValue('shadow');
      mockAiAgentFindByPk.mockResolvedValue({
        id: 'agent-dara',
        agent_name: 'Dara',
        tools_granted: ['escalate_to_human'],
        enabled: false, // the real, disclosed gap this mission's Phase 1 found — Dara has no kill-switch today, but THIS resolver still reports honestly off her real AiAgent.enabled column
        autonomy_level: 'communicate',
        autonomy_level_set_at: new Date(),
        autonomy_level_source: 'manual',
        abac_mode_override: null,
      });

      const result = await resolveEffectiveAccess('agent-dara');

      const escalate = result!.tools.find((t) => t.toolName === 'escalate_to_human');
      expect(escalate?.usable).toBe(false);
    });

    it('this resolver never IMPORTS any write-performing function or model — a structural guarantee, not just an untested gap', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(path.join(__dirname, '../agentEffectiveAccessService.ts'), 'utf8');
      // Only the real import statements — the file's own doc comments
      // legitimately DISCUSS authorizeAgentAction() by name (explaining what
      // this resolver deliberately does NOT do), so a whole-file substring
      // check would false-positive on its own documentation. Imports are
      // the real, structural proof: if a write-performing function isn't
      // imported, this module cannot call it, in production or in tests.
      const importLines = source
        .split('\n')
        .filter((line: string) => /^import\b/.test(line.trim()))
        .join('\n');

      // Real write-performing identifiers this resolver must never import:
      // authorizeAgentAction() performs a real ai_events write; ApprovalRequest
      // and WorkLedgerEvent are real write-target models; emitAiEvent/
      // emitEvent are the real write functions those calls go through.
      for (const forbidden of ['authorizeAgentAction', 'ApprovalRequest', 'WorkLedgerEvent', 'emitAiEvent', 'emitEvent']) {
        expect(importLines).not.toContain(forbidden);
      }
    });
  });
});
