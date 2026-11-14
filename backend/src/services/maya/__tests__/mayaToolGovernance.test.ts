/**
 * T1 - the tool-to-capability map covers both belts, exactly, in both directions.
 *
 * -- WHY THE MOCK PREAMBLE IS THIS LONG --
 *
 * `mayaActionService` imports the models BARREL, which wires Sequelize associations at load.
 * `mayaAgentRegistration.test.ts` records what happens otherwise: an earlier draft died on
 * `AiAgent.hasMany is not a function` before a single assertion ran, and worked around it by
 * reading the tool names out of the file as TEXT. Text extraction is weaker - a changed regex
 * silently compares two empty lists - so this suite imports the real arrays and mocks the
 * dependencies instead, following `mayaSendDocumentGovernance.test.ts`. The CONTROL COUNTS
 * below are the protection text extraction needed: if an import ever yields an empty belt, the
 * count assertion fails loudly rather than every set comparison passing vacuously.
 *
 * -- WHAT THIS ACTUALLY GUARANTEES --
 *
 * Drift in BOTH directions fails:
 *   - a thirteenth site tool, or a sixth portal tool, with no entry in the map;
 *   - a stale entry for a tool that has been deleted from a belt;
 *   - an entry naming a capability that is not a real capability;
 *   - a capability declared but used by no tool.
 *
 * That last one matters because an unused capability is a dial on the console that governs
 * nothing, which is worse than no dial at all.
 */

jest.mock('../../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/AdmissionsActionLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../../models/DocumentDeliveryLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../admissionsWorkflowService', () => ({ canDeliverDocument: jest.fn() }));
jest.mock('../../emailService', () => ({ sendAdmissionsDocument: jest.fn() }));
jest.mock('../../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));
jest.mock('../../email/idempotentSend', () => ({ sendOnce: jest.fn() }));
jest.mock('../../mayaCampaignRouter', () => ({ addMayaInteractionTag: jest.fn(async () => undefined) }));
jest.mock('../mayaCallbackService', () => ({ requestPortalCallback: jest.fn() }));
jest.mock('../../agents/tools/toolInvocationRecorder', () => ({
  withToolRecording: jest.fn(async (_meta: unknown, run: () => Promise<unknown>) => run()),
}));

import { MAYA_TOOLS } from '../../mayaActionService';
import { MAYA_PORTAL_TOOLS } from '../mayaPortalTools';
import { MAYA_CAPABILITIES } from '../../mayaEnablement';
import {
  ALL_MAYA_CAPABILITIES,
  M29_CAPABILITIES,
  MAYA_SITE_CAPABILITIES,
  MAYA_TOOL_GOVERNANCE,
  governanceForTool,
  isM29Capability,
  type MayaToolBelt,
} from '../mayaToolGovernance';

/** The tool names a belt actually declares, read off the real OpenAI tool definitions. */
function namesOn(belt: Array<{ type: string; function?: { name: string } }>): string[] {
  return belt
    .map((t) => (t.type === 'function' ? t.function?.name ?? '' : ''))
    .filter((n) => n.length > 0)
    .sort();
}

const SITE_NAMES = namesOn(MAYA_TOOLS as unknown as Array<{ type: string; function?: { name: string } }>);
const PORTAL_NAMES = namesOn(MAYA_PORTAL_TOOLS as unknown as Array<{ type: string; function?: { name: string } }>);

describe('T1 control counts, so no set comparison can pass vacuously', () => {
  it('reads twelve tools off the site belt', () => {
    expect(SITE_NAMES).toHaveLength(12);
  });

  it('reads five tools off the portal belt', () => {
    expect(PORTAL_NAMES).toHaveLength(5);
  });

  it('reads retrieve_knowledge off BOTH belts, which is the tool the map has to handle twice', () => {
    expect(SITE_NAMES).toContain('retrieve_knowledge');
    expect(PORTAL_NAMES).toContain('retrieve_knowledge');
  });
});

describe('T1 every tool on a belt is governed', () => {
  it.each(SITE_NAMES.map((n) => [n]))('site tool %s has an entry declaring the site belt', (name) => {
    const entry = MAYA_TOOL_GOVERNANCE[name];
    expect(entry).toBeDefined();
    expect(entry.belts).toContain('site');
  });

  it.each(PORTAL_NAMES.map((n) => [n]))('portal tool %s has an entry declaring the portal belt', (name) => {
    const entry = MAYA_TOOL_GOVERNANCE[name];
    expect(entry).toBeDefined();
    expect(entry.belts).toContain('portal');
  });

  it('a thirteenth tool would be caught: the governed set equals the union of the belts', () => {
    const declared = [...new Set([...SITE_NAMES, ...PORTAL_NAMES])].sort();
    expect(Object.keys(MAYA_TOOL_GOVERNANCE).sort()).toEqual(declared);
  });
});

describe('T1 no stale entry survives a tool being deleted', () => {
  it.each(Object.keys(MAYA_TOOL_GOVERNANCE).map((n) => [n]))('%s is still declared on every belt its entry claims', (name) => {
    const entry = MAYA_TOOL_GOVERNANCE[name];
    const actual: MayaToolBelt[] = [];
    if (SITE_NAMES.includes(name)) actual.push('site');
    if (PORTAL_NAMES.includes(name)) actual.push('portal');
    expect(actual.length).toBeGreaterThan(0);
    expect([...entry.belts].sort()).toEqual(actual.sort());
  });
});

describe('T1 every entry names a real capability', () => {
  it.each(Object.keys(MAYA_TOOL_GOVERNANCE).map((n) => [n]))('%s resolves to a declared capability and effect class', (name) => {
    const cap = governanceForTool(name)?.capability;
    expect(cap).toBeDefined();
    expect(ALL_MAYA_CAPABILITIES).toContain(cap);
    expect(governanceForTool(name)?.effectClass).toBeDefined();
  });

  it('every site capability is used by at least one tool, so no dial governs nothing', () => {
    const used = new Set(Object.keys(MAYA_TOOL_GOVERNANCE).map((n) => governanceForTool(n)?.capability));
    for (const cap of MAYA_SITE_CAPABILITIES) expect(used).toContain(cap);
  });

  it('an unknown tool name is ungoverned rather than silently defaulting', () => {
    expect(governanceForTool('not_a_real_tool')?.capability).toBeUndefined();
    expect(governanceForTool('not_a_real_tool')?.effectClass).toBeUndefined();
  });
});

describe('T1 the restated M29 tuple cannot drift from the real one', () => {
  it('deep-equals the runtime MAYA_CAPABILITIES export', () => {
    expect([...M29_CAPABILITIES]).toEqual([...MAYA_CAPABILITIES]);
  });

  it('isM29Capability separates the two axes', () => {
    expect(isM29Capability('sendEmail')).toBe(true);
    expect(isM29Capability('sendDocument')).toBe(false);
    expect(isM29Capability('bookStrategyCall')).toBe(false);
  });

  it('ALL_MAYA_CAPABILITIES is the union of both axes, with no duplicates', () => {
    expect(ALL_MAYA_CAPABILITIES).toHaveLength(M29_CAPABILITIES.length + MAYA_SITE_CAPABILITIES.length);
    expect(new Set(ALL_MAYA_CAPABILITIES).size).toBe(ALL_MAYA_CAPABILITIES.length);
  });
});

describe('T1 the map is frozen, so nothing can be governed differently at runtime', () => {
  it('freezes the table and both capability lists', () => {
    expect(Object.isFrozen(MAYA_TOOL_GOVERNANCE)).toBe(true);
    expect(Object.isFrozen(M29_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(MAYA_SITE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(ALL_MAYA_CAPABILITIES)).toBe(true);
  });
});

describe('T1 the effect classes say what each tool does to the outside world', () => {
  it('pins the four outbound tools, which are the ones the queue and the refusals act on', () => {
    const outbound = Object.keys(MAYA_TOOL_GOVERNANCE).filter((n) => governanceForTool(n)?.effectClass === 'outbound').sort();
    expect(outbound).toEqual(['enroll_in_campaign', 'initiate_voice_call', 'send_document', 'send_sms_summary']);
  });

  it('pins the transactional receipt to booking alone', () => {
    const receipts = Object.keys(MAYA_TOOL_GOVERNANCE).filter((n) => governanceForTool(n)?.effectClass === 'transactional_receipt');
    expect(receipts).toEqual(['schedule_strategy_call']);
  });

  it('book_admissions_call is a read, not a calendar write', () => {
    expect(governanceForTool('book_admissions_call')?.effectClass).toBe('read');
    expect(governanceForTool('book_admissions_call')?.capability).toBe('offerBookingLink');
  });
});
