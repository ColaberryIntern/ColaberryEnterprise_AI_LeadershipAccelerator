/**
 * P3-T6 — the orchestration, and the four obligations T1-T5's verifiers recorded.
 *
 * Every refusal case asserts on the RETURNED STATE — `advanced`, `stage`, `refusals` — never on a
 * log line, because "it logged a warning" and "it did not advance" are different claims and only
 * the second is the control.
 */

import {
  generateBlueprint,
  generateBlueprintOnce,
  unresolvedAllocation,
  MAX_GENERATION_ATTEMPTS,
  GENERATION_STAGES,
  type BlueprintGenerationInput,
} from '../blueprintGeneration';
import { idsByLocator, buildSourceHandoff, reportHandoffIntegrity } from '../sourceHandoff';
import { MAX_REPAIR_ATTEMPTS } from '../../../sbp/planRepair';
import {
  manualOnlyUnderstanding, manualOnlyProject, manualOnlyAllocation,
  manualOnlyAgents, manualOnlyDeclaration, manualOnlyEffort, manualOnlyAcceptance,
} from './fixtures/manualOnly';

function fixtureD(over: Partial<BlueprintGenerationInput> = {}): BlueprintGenerationInput {
  return {
    understanding: manualOnlyUnderstanding(),
    project: manualOnlyProject(),
    allocation: manualOnlyAllocation(),
    agents: manualOnlyAgents(),
    effort: manualOnlyEffort(),
    declaration: { declaration: manualOnlyDeclaration(), origin: 'approved_blueprint' },
    targetAcceptance: manualOnlyAcceptance(),
    ...over,
  };
}

describe('Fixture D — manual-only reaches approval, which is the exit condition', () => {
  it('runs end to end and completes', () => {
    const d = generateBlueprintOnce(fixtureD());
    expect(d.refusals).toEqual([]);
    expect(d.ok).toBe(true);
    expect(d.stage).toBe('complete');
    expect(d.advanced).toBe(true);
  });

  it('reports a 0% AI share HONESTLY, not by default', () => {
    // 15x2 + 90x2 = 210 human minutes/month, nothing automated. The share is 0 because it was
    // measured as 0, which is a different fact from "not assessed".
    const d = generateBlueprintOnce(fixtureD());
    expect(d.measures!.aiShare.fraction).toBe(0);
    expect(d.measures!.aiShare.denominatorMinutes).toBe(210);
    expect(d.measures!.coverage).toEqual({ assessedTasks: 2, totalTasks: 2 });
  });

  it('is below target, and the acceptance clears it rather than waiving it', () => {
    expect(generateBlueprintOnce(fixtureD()).measures!.belowTarget).toBe(true);

    const noAcceptance = generateBlueprintOnce(fixtureD({ targetAcceptance: null }));
    expect(noAcceptance.ok).toBe(false);
    expect(noAcceptance.stage).toBe('effort');
    expect(noAcceptance.refusals.map((r) => r.code)).toContain('BELOW_TARGET_UNEXPLAINED');
  });

  it('records "all human" as a decision, with reasons rather than restatements', () => {
    // The distinction the whole allocation design turns on: an unallocated project and a
    // deliberately-manual one look identical unless the second one says why.
    const alloc = manualOnlyAllocation();
    expect(alloc).toHaveLength(2);
    expect(alloc.every((r) => r.execution_class === 'human')).toBe(true);
    expect(alloc.every((r) => r.rationale.length > 40)).toBe(true);
    expect(alloc.every((r) => !r.rationale.includes('derived from'))).toBe(true);
    expect(unresolvedAllocation(fixtureD())).toBe(0);
  });

  it('PASSING COUNTERPART: strip the allocation and it refuses at the allocation stage', () => {
    const d = generateBlueprintOnce(fixtureD({ allocation: [] }));
    expect(d.ok).toBe(false);
    expect(d.stage).toBe('allocation');
    expect(d.advanced).toBe(false);
    expect(d.refusals.map((r) => r.code)).toContain('ALLOCATION_MISSING');
  });

  it('an empty agent roster is correct here, not a gap', () => {
    // Fixture D has no agents on purpose. A roster check that demanded one would be the rule
    // punishing the honest answer.
    expect(manualOnlyAgents()).toEqual([]);
    expect(generateBlueprintOnce(fixtureD()).ok).toBe(true);
  });
});

describe('a failure leaves a recoverable draft and NEVER advances the stage', () => {
  it('refuses at the process stage and names the offending task', () => {
    const project = manualOnlyProject();
    // Sever the approved branch: t-review now has one labelled outcome, so DECISION fires.
    project.transitions = project.transitions.filter((e) => e.id !== 'e-3');
    const d = generateBlueprintOnce(fixtureD({ project }));

    expect(d.ok).toBe(false);
    expect(d.stage).toBe('process');
    expect(d.advanced).toBe(false);
    expect(d.refusals.map((r) => r.code)).toContain('DECISION');
  });

  it('returns the draft, not nothing, so it is recoverable', () => {
    const project = manualOnlyProject();
    project.transitions = project.transitions.filter((e) => e.id !== 'e-3');
    const d = generateBlueprintOnce(fixtureD({ project }));

    // The handoff survived the process failure and is still there to resume from.
    expect(d.handoff).not.toBeNull();
    expect(d.handoff!.items).toHaveLength(3);
    expect(d.idsByLocator.size).toBe(3);
  });

  it('stops at the FIRST failing stage rather than reporting symptoms downstream', () => {
    // A process graph that fails validation makes every downstream number meaningless; reporting
    // allocation problems computed over an incoherent graph wastes a reviewer's attention.
    const project = manualOnlyProject();
    project.transitions = project.transitions.filter((e) => e.id !== 'e-3');
    const d = generateBlueprintOnce(fixtureD({ project, allocation: [] }));

    expect(d.stage).toBe('process');
    expect(d.refusals.every((r) => r.stage === 'process')).toBe(true);
    expect(d.measures).toBeNull();
  });

  it('POSITIVE CONTROL: a deliberately missing branch is caught THROUGH the orchestrator', () => {
    // Proves the gate is wired rather than bypassed: the same project passes when the branch is
    // restored, so the refusal is caused by the defect and not by the orchestrator always refusing.
    expect(generateBlueprintOnce(fixtureD()).ok).toBe(true);
  });

  it('every stage name is a declared stage', () => {
    const project = manualOnlyProject();
    project.transitions = project.transitions.filter((e) => e.id !== 'e-3');
    for (const d of [generateBlueprintOnce(fixtureD()), generateBlueprintOnce(fixtureD({ project }))]) {
      expect(GENERATION_STAGES).toContain(d.stage);
    }
  });
});

describe('OBLIGATION: id stability across a replay', () => {
  it('a replay over an unchanged understanding reports NO loss and NO invention', () => {
    // Without this, the integrity check T1 built would fire on a CORRECT replay: fresh uuids per
    // call read as 3 lost and 3 invented. Measured by the P3-T1 verifier.
    const first = generateBlueprintOnce(fixtureD());
    const second = generateBlueprintOnce(fixtureD({ priorIds: first.idsByLocator }));

    const before = first.handoff!.items.map((i) => i.item);
    const after = second.handoff!.items.map((i) => i.item);
    const report = reportHandoffIntegrity(before, after);

    expect(report.ok).toBe(true);
    expect(report.lost).toEqual([]);
    expect(report.invented).toEqual([]);
  });

  it('POSITIVE CONTROL: WITHOUT the prior ids the same replay reads as total loss', () => {
    // The control is the finding: this is what the orchestrator would have produced before.
    const first = generateBlueprintOnce(fixtureD());
    const naive = generateBlueprintOnce(fixtureD());  // no priorIds

    const report = reportHandoffIntegrity(
      first.handoff!.items.map((i) => i.item),
      naive.handoff!.items.map((i) => i.item),
    );
    expect(report.ok).toBe(false);
    expect(report.lost).toHaveLength(3);
    expect(report.invented).toHaveLength(3);
  });

  it('a new item added on replay keeps the old ids and mints only the new one', () => {
    const first = generateBlueprintOnce(fixtureD());
    const extra = [...manualOnlyUnderstanding(), {
      dimension: 'requirements' as const, classification: 'FACT' as const,
      provenance: 'source_message' as const, value: 'Rejections are notified within one day.',
    }];
    const second = generateBlueprintOnce(fixtureD({ understanding: extra, priorIds: first.idsByLocator }));

    const firstIds = [...first.idsByLocator.values()];
    const secondIds = second.handoff!.items.map((i) => i.item.id);
    for (const id of firstIds) expect(secondIds).toContain(id);
    expect(secondIds).toHaveLength(4);
  });

  it('idsByLocator keys on the locator, so a caller never builds one', () => {
    const h = buildSourceHandoff(manualOnlyUnderstanding());
    const map = idsByLocator(h);
    expect([...map.keys()].sort()).toEqual(['human_only_decisions#1', 'requirements#1', 'requirements#2']);
  });
});

describe('OBLIGATION: the declaration must not come from the same model turn', () => {
  it('refuses a model-supplied declaration outright', () => {
    const d = generateBlueprintOnce(fixtureD({
      declaration: { declaration: manualOnlyDeclaration(), origin: 'model_turn' },
    }));

    expect(d.ok).toBe(false);
    expect(d.refusals.map((r) => r.code)).toEqual(['DECLARATION_SELF_SUPPLIED']);
    expect(d.advanced).toBe(false);
  });

  it('explains WHY, rather than just refusing', () => {
    const d = generateBlueprintOnce(fixtureD({
      declaration: { declaration: manualOnlyDeclaration(), origin: 'model_turn' },
    }));
    expect(d.refusals[0].message).toContain('can declare whatever it invents');
  });

  it('PASSING COUNTERPART: an approved-blueprint declaration gates normally', () => {
    expect(generateBlueprintOnce(fixtureD()).ok).toBe(true);
  });

  it('refuses BEFORE doing any work, so a bad provenance cannot be laundered by a clean run', () => {
    const d = generateBlueprintOnce(fixtureD({
      declaration: { declaration: manualOnlyDeclaration(), origin: 'model_turn' },
    }));
    expect(d.handoff).toBeNull();
    expect(d.measures).toBeNull();
  });
});

describe('OBLIGATION: the auto-rationale does not self-certify', () => {
  it('does not import deriveAllocation at all', () => {
    // The structural guarantee. deriveAllocation emits a rationale that satisfies
    // ALLOCATION_RATIONALE by construction, so an orchestrator that called it to fill a gap would
    // make "all human is a recorded decision" certify itself. Asserted against the module's
    // imports rather than its behaviour, because the risk is a future edit adding the call.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'blueprintGeneration.ts'), 'utf8',
    );
    expect(src).not.toMatch(/\bderiveAllocation\b\s*[,}]/);
    expect(src).toContain('deliberately NOT called');
  });

  it('an absent allocation stays absent and is counted, not filled in', () => {
    const input = fixtureD({ allocation: [] });
    expect(unresolvedAllocation(input)).toBe(2);
    const d = generateBlueprintOnce(input);
    expect(d.refusals.map((r) => r.code)).toContain('ALLOCATION_MISSING');
  });
});

describe('repair is bounded, monotone, and fails closed', () => {
  it('matches planRepair’s cap rather than inventing a second number', () => {
    expect(MAX_GENERATION_ATTEMPTS).toBe(MAX_REPAIR_ATTEMPTS);
    expect(MAX_GENERATION_ATTEMPTS).toBe(3);
  });

  it('a repair that fixes the draft succeeds and reports the attempt', () => {
    const broken = manualOnlyProject();
    broken.transitions = broken.transitions.filter((e) => e.id !== 'e-3');

    const d = generateBlueprint(fixtureD({ project: broken }), (_draft, attempt) => (
      attempt === 2 ? fixtureD() : null
    ));

    expect(d.ok).toBe(true);
    expect(d.attempt).toBe(2);
  });

  it('stops at the cap and fails closed with the refusals recorded', () => {
    const broken = manualOnlyProject();
    broken.transitions = broken.transitions.filter((e) => e.id !== 'e-3');
    let calls = 0;

    const d = generateBlueprint(fixtureD({ project: broken }), () => {
      calls += 1;
      return fixtureD({ project: broken });  // never actually repairs
    });

    expect(d.ok).toBe(false);
    expect(d.refusals.length).toBeGreaterThan(0);
    // Attempts 2 and 3 only: attempt 1 is the initial run, so the cap allows two repairs.
    expect(calls).toBe(MAX_GENERATION_ATTEMPTS - 1);
  });

  it('keeps the BETTER draft when a repair improves without fixing', () => {
    // Monotone, mirroring planRepair: a candidate is kept only if it strictly reduces the count.
    const twoProblems = manualOnlyProject();
    twoProblems.transitions = twoProblems.transitions.filter((e) => e.id !== 'e-3');
    twoProblems.tasks.push({
      ...twoProblems.tasks[1], id: 't-orphan', kind: 'TASK', stage_id: 's9',
    });

    const first = generateBlueprintOnce(fixtureD({ project: twoProblems }));
    const onlyOne = manualOnlyProject();
    onlyOne.transitions = onlyOne.transitions.filter((e) => e.id !== 'e-3');

    const d = generateBlueprint(fixtureD({ project: twoProblems }), (_x, attempt) => (
      attempt === 2 ? fixtureD({ project: onlyOne }) : null
    ));

    expect(d.ok).toBe(false);
    expect(d.refusals.length).toBeLessThan(first.refusals.length);
  });

  it('DISCARDS a repair that makes things WORSE — found by a mutation that produced no failure', () => {
    // My first monotone test only supplied a repair that WAS better, so "keep always" and "keep
    // only if better" gave the same answer and the mutation passed silently. The distinguishing
    // case is a repair that regresses: monotone keeps the original, non-monotone keeps the worse
    // one. Without this, planRepair's rule was asserted in name only.
    const oneProblem = manualOnlyProject();
    oneProblem.transitions = oneProblem.transitions.filter((e) => e.id !== 'e-3');
    const first = generateBlueprintOnce(fixtureD({ project: oneProblem }));

    // The repair returns a project with the SAME defect plus an orphan task: strictly worse.
    const worse = manualOnlyProject();
    worse.transitions = worse.transitions.filter((e) => e.id !== 'e-3');
    worse.tasks.push({ ...worse.tasks[1], id: 't-orphan-1', stage_id: 's9' });
    worse.tasks.push({ ...worse.tasks[1], id: 't-orphan-2', stage_id: 's9' });

    const d = generateBlueprint(fixtureD({ project: oneProblem }), (_x, attempt) => (
      attempt === 2 ? fixtureD({ project: worse }) : null
    ));

    expect(d.ok).toBe(false);
    // The kept draft is the ORIGINAL, so the count did not grow.
    expect(d.refusals.length).toBe(first.refusals.length);
  });
  it('runs once and returns when no repair function is supplied', () => {
    const broken = manualOnlyProject();
    broken.transitions = broken.transitions.filter((e) => e.id !== 'e-3');
    const d = generateBlueprint(fixtureD({ project: broken }));
    expect(d.attempt).toBe(1);
    expect(d.ok).toBe(false);
  });

  it('a repair keeps identity stable, so a successful fix does not read as invention', () => {
    const broken = manualOnlyProject();
    broken.transitions = broken.transitions.filter((e) => e.id !== 'e-3');

    const d = generateBlueprint(fixtureD({ project: broken }), (_x, attempt) => (
      attempt === 2 ? fixtureD() : null
    ));
    const fresh = generateBlueprintOnce(fixtureD({ priorIds: d.idsByLocator }));

    const report = reportHandoffIntegrity(
      d.handoff!.items.map((i) => i.item),
      fresh.handoff!.items.map((i) => i.item),
    );
    expect(report.ok).toBe(true);
  });
});
