import * as fs from 'fs';
import * as path from 'path';
import { levelForTier } from '../agentAutonomy';
import { getAgentPermission } from '../agentPermissionService';

/**
 * The authorization gate treats a CLASSIFIER's output as a human decision, and the obvious fix
 * makes things worse. This test pins both halves so neither drifts unnoticed.
 *
 * `agentAuthorizationService.resolveLevel` honours `autonomy_level` whenever
 * `autonomy_level_set_at` is stamped, on a documented invariant: "an operator actually chose it".
 * That was true in 2026-08 when `agentReactivationService` was the only writer. Two later writers
 * -- `classifyAiAgentAutonomyLevels` and `agentAutonomyReclassificationService` -- stamp the same
 * column while recording `autonomy_level_source: 'auto'`, and the gate never selects `source`.
 *
 * Measured in production 2026-10-11 across 257 agents: ZERO autonomy levels were set by a human,
 * 12 by the classifier, 245 never set, and exactly 2 sit above `observe` (Reese and Dara, both
 * `communicate`, both 'auto').
 *
 * These tests deliberately do NOT assert the gate reads `source`, because making it do so is wrong
 * in two directions -- it would demote Reese (who is the only agent enforcing) and promote ten
 * others. They assert the SHAPE of the hazard instead, so the decision stays with a human and the
 * next reader is not misled into the naive fix.
 */

const GATE_SRC = path.join(__dirname, '..', 'agentAuthorizationService.ts');
const gate = fs.readFileSync(GATE_SRC, 'utf8');

const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the file reads and the stripper works', () => {
  it('found the real gate', () => {
    expect(gate.length).toBeGreaterThan(1000);
    expect(code).toContain('function resolveLevel');
  });

  it('the stripper keeps code and drops comments', () => {
    expect(gate).toContain('THE INVARIANT ABOVE IS NO LONGER TRUE');
    expect(code).not.toContain('THE INVARIANT ABOVE IS NO LONGER TRUE');
  });
});

describe('the hazard is real: the gate honours set_at without reading source', () => {
  it('resolveLevel keys on autonomy_level_set_at', () => {
    expect(code).toMatch(/autonomy_level_set_at\s*&&\s*row\.autonomy_level/);
  });

  it('the gate never reads autonomy_level_source in CODE', () => {
    // This is the defect, asserted rather than assumed. If someone adds `source` to the attribute
    // list and the resolve logic, this test fails and should be updated DELIBERATELY, with the
    // Reese/Dara approval in hand -- see the gate's own header.
    expect(code).not.toContain('autonomy_level_source');
  });

  it('POSITIVE CONTROL: the column name is a real field other code does read', () => {
    // Proves the absence above is meaningful rather than a typo that matches nothing.
    const reclass = fs.readFileSync(
      path.join(__dirname, '..', 'agentAutonomyReclassificationService.ts'), 'utf8',
    );
    expect(reclass).toContain('autonomy_level_source');
    expect(reclass).toMatch(/autonomy_level_source:\s*'auto'/);
  });

  it('a second writer stamps set_at while marking the level machine-assigned', () => {
    // The precise mechanism by which the gate's documented invariant became false.
    const reclass = fs.readFileSync(
      path.join(__dirname, '..', 'agentAutonomyReclassificationService.ts'), 'utf8',
    );
    expect(reclass).toMatch(/autonomy_level_set_at:\s*new Date\(\)/);
  });
});

describe('why the naive fix is wrong, encoded so nobody has to rediscover it', () => {
  it('Reese and Dara are absent from AGENT_PERMISSIONS, so they fall back to the default tier', () => {
    // If either is ever added with a `communication` tier, the fallback stops being a demotion and
    // this test should fail so the gate change can be reconsidered.
    const permissionsSrc = fs.readFileSync(
      path.join(__dirname, '..', 'agentPermissionService.ts'), 'utf8',
    );
    expect(permissionsSrc).not.toMatch(/^\s*Reese:/m);
    expect(permissionsSrc).not.toMatch(/^\s*Dara:/m);
  });

  it('the default tier resolves BELOW communicate, so ignoring auto would demote them', () => {
    const fallback = levelForTier(getAgentPermission('Reese')?.tier ?? null);
    expect(fallback).not.toBe('communicate');
    expect(fallback).toBe('suggest');
  });

  it('and resolves ABOVE observe, so ignoring auto would PROMOTE the ten observe agents', () => {
    // The direction that makes "tighten the gate" actively dangerous: a change sold as a
    // restriction would widen authority for ten agents.
    const fallback = levelForTier(getAgentPermission('SomeUnlistedObserveAgent')?.tier ?? null);
    expect(fallback).toBe('suggest');
    const ladder = ['observe', 'suggest', 'act_audited', 'communicate'];
    expect(ladder.indexOf(fallback)).toBeGreaterThan(ladder.indexOf('observe'));
  });

  it('an unknown tier still fails closed to observe, which is the one safe default', () => {
    expect(levelForTier(null)).toBe('observe');
    expect(levelForTier('not_a_tier')).toBe('observe');
  });
});

describe('the gate documents the hazard, so the next reader is not misled', () => {
  it('names the two writers that invalidated its invariant', () => {
    expect(gate).toContain('classifyAiAgentAutonomyLevels');
    expect(gate).toContain('agentAutonomyReclassificationService');
  });

  it('records the measured fleet state rather than an impression', () => {
    expect(gate).toMatch(/autonomy levels set by a human:\s*0/);
    expect(gate).toContain('257 agents');
  });

  it('states both directions of the naive fix and who owns the decision', () => {
    expect(gate).toMatch(/would RISE|would drop/);
    expect(gate).toContain("abac_mode_override: 'enforce'");
    expect(gate).toMatch(/decision for the DRI/);
  });
});
