import { checkAuthorityCoverage } from '../reeseCharterAuthority';
import {
  REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
  REESE_CHARTER_V2_AUTHORITY_APPROVAL_REQUIRED,
  REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
} from '../../../scripts/lib/reeseCharterV2Content';
import { REESE_TOOL_INVENTORY } from '../../../scripts/lib/reeseToolInventory';
import { REESE_BEHAVIOURS } from '../../../scripts/lib/reeseBehaviourInventory';

// Reese Product Phase 1, R5 — "authority read by code": a test granting
// Reese an unlisted tool fails; a test adding an unlisted behaviour fails.
// These run against the REAL committed v2 charter content and the REAL
// R2/R3 inventories, not synthetic fixtures, so a future edit to any of the
// three that silently drifts them apart fails here, not in production.

const V2_CHARTER = {
  authorityAutonomous: REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
  authorityApprovalRequired: REESE_CHARTER_V2_AUTHORITY_APPROVAL_REQUIRED,
  authorityForbidden: REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
};

const REAL_TOOLS_GRANTED = ['respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health'];
const REAL_REGISTRY_TOOLS = ['read_attachments'];
const REAL_BEHAVIOUR_NAMES = REESE_BEHAVIOURS.map((b) => b.name);

describe('checkAuthorityCoverage', () => {
  it('happy path: the real v2 charter covers every real tool (tools_granted + registry) and every real behaviour', () => {
    const result = checkAuthorityCoverage(REAL_TOOLS_GRANTED, REAL_REGISTRY_TOOLS, REAL_BEHAVIOUR_NAMES, V2_CHARTER);

    expect(result.mismatches).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('the real TOOL_INVENTORY.md tool names are all covered too (cross-check against R3, not just a hand-picked list)', () => {
    const toolNames = REESE_TOOL_INVENTORY.filter((r) => r.kind === 'llm_tool' || r.name === 'respond_to_dm').map((r) => r.name);
    const result = checkAuthorityCoverage(toolNames, [], [], V2_CHARTER);

    expect(result.mismatches).toEqual([]);
  });

  it('BREAK: granting Reese an unlisted tool fails', () => {
    const result = checkAuthorityCoverage([...REAL_TOOLS_GRANTED, 'delete_student_account'], REAL_REGISTRY_TOOLS, REAL_BEHAVIOUR_NAMES, V2_CHARTER);

    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({ kind: 'tool', name: 'delete_student_account' });
  });

  it('BREAK: adding an unlisted behaviour fails', () => {
    const result = checkAuthorityCoverage(REAL_TOOLS_GRANTED, REAL_REGISTRY_TOOLS, [...REAL_BEHAVIOUR_NAMES, 'Autonomous refund issuance'], V2_CHARTER);

    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({ kind: 'behaviour', name: 'Autonomous refund issuance' });
  });

  it('boundary: no charter at all (null) fails every tool and behaviour, never silently passes', () => {
    const result = checkAuthorityCoverage(['respond_to_dm'], [], ['Reactive DM reply'], null);

    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBe(2);
  });

  it('a tool named only in the forbidden list still counts as covered (accounted for, not necessarily autonomous)', () => {
    const result = checkAuthorityCoverage(
      ['issue_refund'],
      [],
      [],
      { authorityAutonomous: [], authorityApprovalRequired: [], authorityForbidden: ['Never call issue_refund.'] },
    );

    expect(result.ok).toBe(true);
  });
});
