import { readFileSync } from 'fs';
import { join } from 'path';
import { INPACT_DIMENSIONS } from '../../../modules/delivery/inpact';
import { AUTONOMY_STAGES } from '../../agentDomain/autonomyLadder';
import { EXECUTION_POLICIES, APPROVAL_POLICIES } from '../../delivery/deliveryStoryContract';

/**
 * L10.1 — the factory spine must USE the platform's governance, not re-declare it.
 *
 * ## Why this is a source-reading test and not a type test
 *
 * The failure being guarded against is someone adding a SIXTH autonomy vocabulary. TypeScript
 * cannot catch that: a brand-new `type AgentAutonomy = 'low' | 'high'` compiles perfectly and is
 * wrong for reasons no compiler knows about. The thing to assert is the absence of a
 * declaration, which means reading the source. `readAgentFactoryLadder.test.ts` sets the
 * precedent for that in this repo.
 *
 * ## The measurement this pins
 *
 * On 4 Nov 2026 the same grep pattern returned 7 files in `services/delivery`, 2 in
 * `services/lifecycle`, and **0 of 83** in `services/factory` — the spine that decomposes every
 * project referenced none of its own governance. These tests are that zero, turned into
 * something that stays fixed.
 */

const CONTRACT = join(__dirname, '..', 'contracts', 'factoryContract.ts');
const source = (): string => readFileSync(CONTRACT, 'utf8');

describe('the factory imports the governance rather than re-declaring it', () => {
  it.each([
    ['ExecutionPolicy / ApprovalPolicy', "from '../../delivery/deliveryStoryContract'"],
    ['AutonomyStage', "from '../../agentDomain/autonomyLadder'"],
    ['InpactDimension', "from '../../../modules/delivery/inpact'"],
  ])('imports %s from its canonical home', (_label, importPath) => {
    expect(source()).toContain(importPath);
  });

  it('was 0 of 83 files this afternoon; the contract now references governance at all', () => {
    const s = source();
    expect(s).toMatch(/InpactDimension/);
    expect(s).toMatch(/AutonomyStage/);
  });
});

describe('no sixth autonomy vocabulary', () => {
  it('declares no new union of autonomy levels', () => {
    // Five already exist at four granularities: executor.type per assignment, execution_class
    // per task, ExecutionPolicy per story, autonomy_level per agent, autonomy:R0..R9 per
    // capability. A sixth is the easy mistake and the one worth a failing test.
    const s = source();
    const declaresAutonomyUnion = /export\s+type\s+\w*Autonomy\w*\s*=\s*'/.test(s);
    expect(declaresAutonomyUnion).toBe(false);
  });

  it('does not re-declare the 4-level agent ladder', () => {
    expect(source()).not.toMatch(/'observe'\s*\|\s*'suggest'/);
  });

  it('does not re-declare the execution or approval policy unions', () => {
    const s = source();
    expect(s).not.toMatch(/export\s+type\s+ExecutionPolicy\s*=/);
    expect(s).not.toMatch(/export\s+type\s+ApprovalPolicy\s*=/);
  });

  it('does not re-declare the INPACT dimensions', () => {
    expect(source()).not.toMatch(/'instant'\s*\|\s*'natural'/);
  });

  it('declares no bare R0-R9 ladder, which would collide with the delivery RISK tiers', () => {
    // autonomyLadder.ts namespaces every stored value `autonomy:R3` precisely because a bare R3
    // is a DeliveryRiskLevel meaning schema/security/external side effect.
    expect(source()).not.toMatch(/'R0'\s*\|\s*'R1'/);
  });
});

describe('the imported vocabularies are the real ones', () => {
  it('INPACT is the book’s six dimensions', () => {
    expect([...INPACT_DIMENSIONS].sort()).toEqual(
      ['adaptive', 'contextual', 'instant', 'natural', 'permitted', 'transparent'],
    );
  });

  it('every autonomy stage is namespaced, so a bare R3 can never be stored', () => {
    expect(AUTONOMY_STAGES.length).toBe(10);
    for (const s of AUTONOMY_STAGES) expect(s.startsWith('autonomy:')).toBe(true);
  });

  it('the policy unions are the delivery ones', () => {
    expect([...EXECUTION_POLICIES]).toEqual(['manual_only', 'agent_with_review', 'agent_autonomous']);
    expect([...APPROVAL_POLICIES]).toEqual(['none', 'internal_review', 'client_approval']);
  });
});
