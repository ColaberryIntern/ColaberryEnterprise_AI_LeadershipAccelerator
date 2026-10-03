/**
 * P3-T4 — the two rules `scopeAgents` asks for and nothing checks, plus the capability vocabulary.
 *
 * Every rejection is paired with a PASSING counterpart. The denial lists are read from the modules
 * that own them rather than restated, so a ninth denied capability or a third denied tool added
 * upstream is honoured here without editing this file.
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  validateAgentScoping,
  checkOwnership,
  checkConsolidation,
  CONSOLIDATION_FLOOR,
  SCOPING_CODES,
  type ScopedAgent,
} from '../agentScoping';
import {
  checkCapabilityClaims,
  capabilityClaimsAcceptable,
  GOVERNED_DENIALS,
  GOVERNED_DENIED_TOOLS,
  CAPABILITY_CODES,
  type CapabilityDeclaration,
} from '../capabilityRegistry';
import { DENIED_CAPABILITIES } from '../../../delivery/execution/executionPolicy';
import { DENIED_TOOLS } from '../../../delivery/execution/claudeAgentSdkProvider';

// 'intake' and 'generic' are in here because agent CAPABILITY LABELS are now checked against the
// declaration too, not only their `requires`. See "the consolidation escape now costs a
// declaration" below for why that changed.
const DECL: CapabilityDeclaration = {
  permitted: ['read_repository', 'draft_email', 'run_tests', 'intake', 'generic'],
};

const agent = (over: Partial<ScopedAgent> & Pick<ScopedAgent, 'id'>): ScopedAgent => ({
  owns: [], capability: 'generic', ...over,
});

describe('the vocabulary is read from the code that governs it, never restated', () => {
  it('mirrors executionPolicy’s denied capabilities exactly', () => {
    // If this ever diverges, the registry is checking a stale copy of the policy.
    expect([...GOVERNED_DENIALS]).toEqual([...DENIED_CAPABILITIES]);
    expect(GOVERNED_DENIALS.length).toBeGreaterThanOrEqual(8);
  });

  it('mirrors the provider’s denied tools exactly', () => {
    expect([...GOVERNED_DENIED_TOOLS]).toEqual([...DENIED_TOOLS]);
  });

  it('declares its own codes, distinct between the two modules', () => {
    const overlap = [...CAPABILITY_CODES].filter((c) => ([...SCOPING_CODES] as string[]).includes(c));
    expect(overlap).toEqual([]);
  });
});

describe('CAPABILITY_DENIED — the substantive safety rule', () => {
  it.each([...DENIED_CAPABILITIES])('refuses an agent requiring %s, whatever the declaration says', (cap) => {
    // Driven off the real list, so a ninth denial is covered without touching this test. And the
    // declaration deliberately PERMITS it, to prove denial beats declaration.
    const permissive: CapabilityDeclaration = { permitted: [cap] };
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: [cap] }], permissive);

    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('CAPABILITY_DENIED');
    expect(v[0].subject).toBe(cap);
    expect(v[0].agentId).toBe('ag-1');
  });

  it('PASSING COUNTERPART: a declared, non-denied capability is accepted', () => {
    expect(checkCapabilityClaims([{ agentId: 'ag-1', requires: ['run_tests'] }], DECL)).toEqual([]);
    expect(capabilityClaimsAcceptable([{ agentId: 'ag-1', requires: ['run_tests'] }], DECL)).toBe(true);
  });

  it('names denial as the reason, not absence from the declaration', () => {
    // The message matters: an operator reading "never declared" would go and declare it.
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: ['production_deploy'] }], DECL);
    expect(v[0].code).toBe('CAPABILITY_DENIED');
    expect(v[0].message).toContain('default-deny');
    expect(v[0].message).not.toContain('never declared');
  });
});

describe('CAPABILITY_UNDECLARED — declared, not inferred', () => {
  it('refuses a capability this blueprint never declared', () => {
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: ['read_mailbox'] }], DECL);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('CAPABILITY_UNDECLARED');
    expect(v[0].subject).toBe('read_mailbox');
  });

  it('PASSING COUNTERPART: declare it and the same roster is accepted', () => {
    const wider: CapabilityDeclaration = { permitted: [...DECL.permitted, 'read_mailbox'] };
    expect(checkCapabilityClaims([{ agentId: 'ag-1', requires: ['read_mailbox'] }], wider)).toEqual([]);
  });

  it('an EMPTY declaration refuses everything rather than permitting it', () => {
    // "No special capability required" is a real statement. The dangerous reading would be that an
    // empty list means unconstrained, which is how a default waves a roster through.
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: ['run_tests'] }], { permitted: [] });
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('CAPABILITY_UNDECLARED');
  });

  it('an agent requiring nothing is fine under an empty declaration', () => {
    expect(checkCapabilityClaims([{ agentId: 'ag-1', requires: [] }], { permitted: [] })).toEqual([]);
  });

  it('reports every offending capability, not just the first', () => {
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: ['a', 'b', 'run_tests'] }], DECL);
    expect(v.map((x) => x.subject)).toEqual(['a', 'b']);
  });
});

describe('TOOL_DENIED — naming a tool does not make it available', () => {
  it.each([...DENIED_TOOLS])('refuses an agent naming %s', (tool) => {
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: [], tools: [tool] }], DECL);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('TOOL_DENIED');
    expect(v[0].subject).toBe(tool);
  });

  it('PASSING COUNTERPART: a tool the runtime does not deny is accepted', () => {
    expect(checkCapabilityClaims([{ agentId: 'ag-1', requires: [], tools: ['Read'] }], DECL)).toEqual([]);
  });

  it('says the run would simply not have it, rather than implying a policy decision', () => {
    const v = checkCapabilityClaims([{ agentId: 'ag-1', requires: [], tools: [DENIED_TOOLS[0]] }], DECL);
    expect(v[0].message).toContain('would simply not have it');
  });
});

describe('ownership — asked for at scopeAgents.ts:147, never checked until now', () => {
  const stories = ['S1', 'S2', 'S3'];

  it('refuses an unowned story, naming it', () => {
    const v = checkOwnership(stories, [agent({ id: 'a1', owns: ['S1', 'S2'] })]);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('STORY_UNOWNED');
    expect(v[0].subject).toBe('S3');
  });

  it('refuses a double-owned story, naming both agents', () => {
    const v = checkOwnership(stories, [
      agent({ id: 'a1', owns: ['S1', 'S2', 'S3'] }),
      agent({ id: 'a2', owns: ['S2'] }),
    ]);
    const dbl = v.filter((x) => x.code === 'STORY_DOUBLE_OWNED');
    expect(dbl).toHaveLength(1);
    expect(dbl[0].subject).toBe('S2');
    expect(dbl[0].message).toContain('a1');
    expect(dbl[0].message).toContain('a2');
  });

  it('refuses an agent that owns nothing', () => {
    const v = checkOwnership(stories, [
      agent({ id: 'a1', owns: ['S1', 'S2', 'S3'] }),
      agent({ id: 'a2', owns: [] }),
    ]);
    expect(v.filter((x) => x.code === 'AGENT_OWNS_NOTHING')).toHaveLength(1);
  });

  it('PASSING COUNTERPART: exactly-one ownership is accepted', () => {
    expect(checkOwnership(stories, [
      agent({ id: 'a1', owns: ['S1', 'S3'] }),
      agent({ id: 'a2', owns: ['S2'] }),
    ])).toEqual([]);
  });

  it('an empty roster refuses every story rather than passing vacuously', () => {
    expect(checkOwnership(stories, []).map((v) => v.subject)).toEqual(['S1', 'S2', 'S3']);
  });
});

describe('consolidation — preferred at scopeAgents.ts:130, enforced here', () => {
  const twelve = Array.from({ length: 12 }, (_, n) => `S${n + 1}`);

  it('refuses one agent per story across few capabilities', () => {
    const roster = twelve.map((s, n) => agent({
      id: `a${n}`, owns: [s], capability: ['intake', 'review', 'export'][n % 3],
    }));
    const v = checkConsolidation(twelve, roster);

    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('AGENT_PER_STORY');
    expect(v[0].message).toContain('3 distinct capabilities');
  });

  it('PASSING COUNTERPART: twelve stories across three agents is accepted', () => {
    const roster = [
      agent({ id: 'a1', owns: twelve.slice(0, 4), capability: 'intake' }),
      agent({ id: 'a2', owns: twelve.slice(4, 8), capability: 'review' }),
      agent({ id: 'a3', owns: twelve.slice(8), capability: 'export' }),
    ];
    expect(checkConsolidation(twelve, roster)).toEqual([]);
    expect(checkOwnership(twelve, roster)).toEqual([]);
  });

  it('does not fire below the floor — a three-story build may have three agents', () => {
    const three = ['S1', 'S2', 'S3'];
    const roster = three.map((s, n) => agent({ id: `a${n}`, owns: [s], capability: 'same' }));
    expect(three.length).toBeLessThan(CONSOLIDATION_FLOOR);
    expect(checkConsolidation(three, roster)).toEqual([]);
  });

  it('does not fire when every agent genuinely claims a different capability', () => {
    // A large roster that is internally consistent about why it is large is not this rule's
    // business. Without this the rule would punish a genuinely diverse system.
    const roster = twelve.map((s, n) => agent({ id: `a${n}`, owns: [s], capability: `cap-${n}` }));
    expect(checkConsolidation(twelve, roster)).toEqual([]);
  });
});

describe('SBP’s post-gate ordering is NOT changed by this task', () => {
  const orchestrator = readFileSync(
    path.join(__dirname, '..', '..', '..', 'sbp', 'sbpOrchestrator.ts'),
    'utf8',
  );

  it('still scopes agents AFTER the gate, for the reason it records', () => {
    // Read from the orchestrator rather than asserted in prose, so this plan cannot silently
    // regress a documented protection. The request wanted pre-story scoping; doing it here would
    // trade "a scoping failure must never cost them a publishable build" for a sequencing
    // preference, so pre-story scoping applies to the blueprint path only.
    expect(orchestrator).toContain('Deliberately AFTER the gate');
    expect(orchestrator).toContain('must never cost them a publishable build');

    const gateAt = orchestrator.indexOf('isPublishable(gate.violations)');
    const scopeAt = orchestrator.indexOf('await scopeAgents(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(scopeAt).toBeGreaterThan(gateAt);
    // No separate positive control for this comparison: the two toBeGreaterThan(-1) guards
    // above already rule out the vacuous case where both indexOf return -1. An earlier draft
    // added a control that asserted indexOf on a local string - it tested JavaScript, not this
    // code, and could only fail if the language broke.
  });

  it('this task edits nothing under services/sbp/', () => {
    // The Files line claims it; the orchestrator still has no import from the generation tree.
    expect(orchestrator).not.toContain('generation/agentScoping');
    expect(orchestrator).not.toContain('generation/capabilityRegistry');
  });
});


describe('the consolidation escape now costs a declaration', () => {
  const twelve = Array.from({ length: 12 }, (_, n) => `S${n + 1}`);
  const oneEach = twelve.map((story, n) => agent({
    id: `a${n}`, owns: [story], capability: `slice-${n}`,
  }));

  it('refuses a 12-agent 1:1 roster whose capability labels were never declared', () => {
    // The P3-T4 verifier evaded AGENT_PER_STORY entirely with exactly this roster: `capability`
    // was free text validated against nothing, so twelve distinct labels — one token of output
    // per agent — bought a clean pass.
    const r = validateAgentScoping(twelve, oneEach, { permitted: [] });

    expect(r.ok).toBe(false);
    expect(r.scoping.filter((v) => v.code === 'CAPABILITY_LABEL_UNDECLARED')).toHaveLength(12);
  });

  it('IS STILL EVADABLE IF ALL TWELVE LABELS ARE DECLARED \u2014 recorded, not claimed otherwise', () => {
    // The honest limit of this fix, asserted so nobody reads the rule as stronger than it is.
    // Requiring declaration does not make the escape impossible; it makes it cost twelve entries
    // a reviewer can see and count, instead of a string nobody checks. Closing it properly needs
    // the declaration to come from an earlier stage than the roster, which is T6’s to wire.
    const declared = { permitted: twelve.map((_, n) => `slice-${n}`) };
    expect(validateAgentScoping(twelve, oneEach, declared).ok).toBe(true);
  });

  it('PASSING COUNTERPART: three declared capabilities across twelve stories is accepted', () => {
    const roster = [
      agent({ id: 'a1', owns: twelve.slice(0, 4), capability: 'intake' }),
      agent({ id: 'a2', owns: twelve.slice(4, 8), capability: 'review' }),
      agent({ id: 'a3', owns: twelve.slice(8), capability: 'export' }),
    ];
    const declared = { permitted: ['intake', 'review', 'export'] };
    expect(validateAgentScoping(twelve, roster, declared).ok).toBe(true);
  });
});

describe('validateAgentScoping composes both halves', () => {
  const stories = ['S1', 'S2'];
  const good = [agent({ id: 'a1', owns: ['S1', 'S2'], capability: 'intake', requires: ['run_tests'] })];

  it('accepts a clean roster', () => {
    const r = validateAgentScoping(stories, good, DECL);
    expect(r.ok).toBe(true);
    expect(r.scoping).toEqual([]);
    expect(r.capability).toEqual([]);
  });

  it('reports scoping and capability problems separately, not merged into one list', () => {
    const bad = [agent({ id: 'a1', owns: ['S1'], capability: 'intake', requires: ['production_deploy'] })];
    const r = validateAgentScoping(stories, bad, DECL);

    expect(r.ok).toBe(false);
    expect(r.scoping.map((v) => v.code)).toEqual(['STORY_UNOWNED']);
    expect(r.capability.map((v) => v.code)).toEqual(['CAPABILITY_DENIED']);
  });

  it('delegates builder/runtime distinctness to checkRefIntegrity when refs are supplied', () => {
    // Reused, not reimplemented: manifestRefs.ts:159-162 already computes
    // agentNamespaceCollisions over refs.agents.builder and refs.agents.runtime.
    const refs = {
      origin: 'student' as const,
      projectId: 'p1',
      sources: [], processes: [], businessTasks: [], assignments: [],
      agents: {
        runtime: [{ id: 'shared', revision: 1 }],
        builder: [{ id: 'shared', revision: 1 }],
      },
      surfaces: [], policies: [], designDecisions: [], downstream: [],
    } as unknown as Parameters<typeof validateAgentScoping>[3];

    const r = validateAgentScoping(stories, good, DECL, refs);
    const collide = r.scoping.filter((v) => v.code === 'AGENT_NAMESPACE_COLLISION');
    expect(collide).toHaveLength(1);
    expect(collide[0].subject).toBe('shared');
  });

  it('PASSING COUNTERPART: distinct builder and runtime ids produce no collision', () => {
    const refs = {
      origin: 'student' as const,
      projectId: 'p1',
      sources: [], processes: [], businessTasks: [], assignments: [],
      agents: {
        runtime: [{ id: 'runtime-1', revision: 1 }],
        builder: [{ id: 'builder-1', revision: 1 }],
      },
      surfaces: [], policies: [], designDecisions: [], downstream: [],
    } as unknown as Parameters<typeof validateAgentScoping>[3];

    expect(validateAgentScoping(stories, good, DECL, refs).ok).toBe(true);
  });

  it('omitting refs skips the namespace check rather than silently passing it', () => {
    // Worth pinning: the absence of a check and a passed check are different states, and the
    // caller (T6) has to know which one it got.
    const r = validateAgentScoping(stories, good, DECL);
    expect(r.scoping.some((v) => v.code === 'AGENT_NAMESPACE_COLLISION')).toBe(false);
  });
});
