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
import { itemsByLocator, buildSourceHandoff, reportHandoffIntegrity } from '../sourceHandoff';
import { MAX_REPAIR_ATTEMPTS } from '../../../sbp/planRepair';
import {
  manualOnlyUnderstanding, manualOnlyProject, manualOnlyAllocation,
  manualOnlyAgents, manualOnlyDeclaration, manualOnlyEffort, manualOnlyAcceptance,
} from './fixtures/manualOnly';
import { fixtureA, fixtureB, fixtureC } from './fixtures/referenceFixtures';

const asgLike = (id: string, taskId: string, roleId: string, responsibility: string) => ({
  id, task_id: taskId, role_id: roleId, responsibility,
  executor: { type: 'person' as const, id: 'counsel-1' },
  minutes: null, basis: 'UNKNOWN' as const, evidence_note: null,
}) as unknown as ReturnType<typeof manualOnlyProject>['assignments'][number];

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

  it('the SAME project passes once the branch is restored, so the refusal is caused by the defect', () => {
    // Re-titled: this was labelled POSITIVE CONTROL but its body only re-asserts the happy path.
    // The actual catch is the DECISION test above; this is its counterpart, which is a different
    // and weaker claim. A mutation proved the old `every stage name is a declared stage` test
    // could not fail at all - `stage` is typed GenerationStage, so no typechecking change could
    // break a toContain over that union - and it has been deleted rather than reworded.
    expect(generateBlueprintOnce(fixtureD()).ok).toBe(true);
    expect(GENERATION_STAGES).toContain(generateBlueprintOnce(fixtureD()).stage);
  });


});


describe('ALL FOUR fixtures run end to end \u2014 acceptance item 3', () => {
  // A, B and C existed as prose in reference-fixtures.md and as no code anywhere in
  // backend/src; the P3-T6 verifier confirmed that with a whole-tree search. A task titled
  // "orchestrate the fixtures" was orchestrating one of four.
  const cases = [
    ['A proposal (two tracks, AI drafting under human approval)', fixtureA],
    ['B admissions (human-heavy and below target, WITH an AI task)', fixtureB],
    ['C service business (ai_autonomous where it is legitimate)', fixtureC],
  ] as const;

  const inputOf = (f: typeof fixtureA) => ({
    understanding: f.understanding(),
    project: f.project(),
    allocation: f.allocation(),
    agents: f.agents(),
    effort: f.effort(),
    declaration: { declaration: f.declaration(), origin: 'approved_blueprint' as const },
    targetAcceptance: f.acceptance(),
  });

  it.each(cases)('%s completes', (_label, f) => {
    const d = generateBlueprintOnce(inputOf(f));
    expect(d.refusals).toEqual([]);
    expect(d.ok).toBe(true);
    expect(d.stage).toBe('complete');
    expect(d.advanced).toBe(true);
  });

  it.each(cases)('%s refuses when its decision branch is severed', (_label, f) => {
    // The pass/refuse pair Fixture D has. Without it, "it completes" could be true of a
    // pipeline that accepts everything.
    const project = f.project();
    project.transitions = project.transitions.filter((e) => e.id !== 'e-3');
    const d = generateBlueprintOnce({ ...inputOf(f), project });

    expect(d.ok).toBe(false);
    expect(d.stage).toBe('process');
    expect(d.advanced).toBe(false);
  });

  it('A: an AI-drafted task reports an AI share BELOW 100%, because approval is human time', () => {
    // 240 AI + 60 approval + 60 review = 360. 240/360 = 2/3, hand-computed.
    const m = generateBlueprintOnce(inputOf(fixtureA)).measures!;
    expect(m.aiShare.denominatorMinutes).toBe(360);
    expect(m.aiShare.numeratorMinutes).toBe(240);
    expect(m.humanShare.numeratorMinutes).toBe(120);
  });

  it('B is human-heavy but NOT manual-only \u2014 the distinction Fixture D exists for', () => {
    // 5x40 = 200 AI; 2x40 = 80 approval; 25x40 = 1000 review. 200/1280.
    const m = generateBlueprintOnce(inputOf(fixtureB)).measures!;
    expect(m.aiShare.numeratorMinutes).toBe(200);
    expect(m.aiShare.denominatorMinutes).toBe(1280);
    expect(m.belowTarget).toBe(true);
    // The difference from D: B HAS an AI-executed task. D has none at all.
    expect(m.aiShare.fraction).toBeGreaterThan(0);
    expect(generateBlueprintOnce(fixtureD()).measures!.aiShare.fraction).toBe(0);
  });

  it('C allows ai_autonomous on public data with no decision authority', () => {
    // 2x400 = 800 AI; 20x20 = 400 human. 800/1200 = 2/3.
    const m = generateBlueprintOnce(inputOf(fixtureC)).measures!;
    expect(m.aiShare.numeratorMinutes).toBe(800);
    expect(m.aiShare.denominatorMinutes).toBe(1200);
  });

  it('C REFUSES the same autonomous allocation once the data turns confidential', () => {
    // The counterpart: ai_autonomous is not blanket-permitted, it is permitted where the task
    // carries neither sensitive data nor decision authority.
    const project = fixtureC.project();
    project.tasks.find((t) => t.id === 't-draft')!.data_sensitivity = 'regulated';
    const d = generateBlueprintOnce({ ...inputOf(fixtureC), project });

    expect(d.ok).toBe(false);
    expect(d.stage).toBe('allocation');
    expect(d.refusals.map((r) => r.code)).toContain('SENSITIVITY_AUTONOMY');
  });
});

describe('reconciliation \u2014 the stages are a pipeline, not five calls in a row', () => {
  it('refuses a work task that the effort list omits', () => {
    // Measured by the P3-T6 verifier: removing one of two assessments produced
    // coverage {assessed: 1, total: 1}, ok: true, no refusals. A task left out read as 100%
    // coverage, because T5 can only measure what it is handed and has no view of the project.
    const d = generateBlueprintOnce(fixtureD({ effort: manualOnlyEffort().slice(0, 1) }));

    expect(d.ok).toBe(false);
    expect(d.stage).toBe('effort');
    expect(d.refusals.map((r) => r.code)).toEqual(['EFFORT_TASK_UNACCOUNTED']);
    expect(d.refusals[0].subject).toBe('t-review');
  });

  it('says why omitting differs from assessing and finding nothing', () => {
    const d = generateBlueprintOnce(fixtureD({ effort: manualOnlyEffort().slice(0, 1) }));
    expect(d.refusals[0].message).toContain('inflates every share');
  });

  it('PASSING COUNTERPART: a complete effort list is accepted', () => {
    expect(generateBlueprintOnce(fixtureD()).ok).toBe(true);
  });
});

describe('OBLIGATION: a revised requirement keeps its id and BUMPS its revision', () => {
  const corrected = () => {
    const u = manualOnlyUnderstanding();
    u[0] = { ...u[0], value: 'Every contract over \u00a3100k must be read by a qualified solicitor.' };
    return u;
  };

  it('round-trips as same id, next revision', () => {
    const first = generateBlueprintOnce(fixtureD());
    const second = generateBlueprintOnce(fixtureD({
      understanding: corrected(), priorIds: first.idsByLocator,
    }));

    const a = first.handoff!.items[0].item;
    const b = second.handoff!.items[0].item;
    expect(b.id).toBe(a.id);
    expect(b.revision).toBe(a.revision + 1);
    expect(b.text).toContain('\u00a3100k');
  });

  it('and the integrity report NOTICES the change rather than reporting nothing', () => {
    // The first id-stability fix traded a loud false positive for a SILENT FALSE NEGATIVE: a
    // corrected requirement came back at the same id and revision 1, so the report said
    // ok/0 lost/0 invented for text that had materially changed. A reviewer would have been
    // told nothing happened. That is strictly worse than the noise it replaced.
    const first = generateBlueprintOnce(fixtureD());
    const second = generateBlueprintOnce(fixtureD({
      understanding: corrected(), priorIds: first.idsByLocator,
    }));
    const report = reportHandoffIntegrity(
      first.handoff!.items.map((i) => i.item),
      second.handoff!.items.map((i) => i.item),
    );

    expect(report.revised).toHaveLength(1);
    expect(report.rewrittenWithoutRevision).toEqual([]);
    expect(report.lost).toEqual([]);
    expect(report.invented).toEqual([]);
    // A legitimate correction is reported, not failed: correcting is allowed, hiding it is not.
    expect(report.ok).toBe(true);
  });

  it('POSITIVE CONTROL: text changed WITHOUT a revision bump fails the report', () => {
    // The exact shape the earlier fix produced, constructed directly so the guard is proven
    // reachable rather than assumed unreachable.
    const first = generateBlueprintOnce(fixtureD());
    const before = first.handoff!.items.map((i) => i.item);
    const forged = before.map((i, n) => (n === 0 ? { ...i, text: 'silently different' } : i));
    const report = reportHandoffIntegrity(before, forged);

    expect(report.ok).toBe(false);
    expect(report.rewrittenWithoutRevision).toEqual([before[0].id]);
    expect(report.revised).toEqual([]);
  });

  it('an UNCHANGED replay reports no revision at all', () => {
    const first = generateBlueprintOnce(fixtureD());
    const second = generateBlueprintOnce(fixtureD({ priorIds: first.idsByLocator }));
    const report = reportHandoffIntegrity(
      first.handoff!.items.map((i) => i.item),
      second.handoff!.items.map((i) => i.item),
    );
    expect(report.revised).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('Fixture D\u2019s documented failure cases are enforced, not just described', () => {
  it('refuses ai_autonomous on the review task \u2014 TWICE over', () => {
    // reference-fixtures.md states this; nothing tested it. t-review carries 'confidential'
    // data AND decide_full authority, so both halves of SENSITIVITY_AUTONOMY fire.
    const d = generateBlueprintOnce(fixtureD({
      allocation: [{
          task_id: 't-review', execution_class: 'ai_autonomous', accountable_role_id: 'role-counsel',
          rationale: 'an attempt to automate the judgement',
        }, manualOnlyAllocation()[0]],
    }));

    expect(d.ok).toBe(false);
    expect(d.stage).toBe('allocation');
    const sens = d.refusals.filter((r) => r.code === 'SENSITIVITY_AUTONOMY');
    expect(sens).toHaveLength(2);
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

    const firstIds = [...first.idsByLocator.values()].map((i) => i.id);
    const secondIds = second.handoff!.items.map((i) => i.item.id);
    for (const id of firstIds) expect(secondIds).toContain(id);
    expect(secondIds).toHaveLength(4);
  });

  it('itemsByLocator keys on the locator, so a caller never builds one', () => {
    const h = buildSourceHandoff(manualOnlyUnderstanding());
    const map = itemsByLocator(h);
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


describe('\u00a77 corpus cases \u2014 two of three; the third is recorded as deferred', () => {
  it('MULTIPLE ROLES HELD BY ONE PERSON is accepted, not treated as a duplicate', () => {
    // The same role_id carrying several responsibilities on one task is how a small
    // organisation really works. DUPLICATE_ASSIGNMENT keys on (task, role, responsibility), so
    // distinct responsibilities for one role must pass - and a reviewer needs to know the
    // accountability is one person rather than three.
    const project = manualOnlyProject();
    project.assignments.push(asgLike('a-extra', 't-review', 'role-counsel', 'APPROVER'));

    const d = generateBlueprintOnce(fixtureD({ project }));
    expect(d.ok).toBe(true);
  });

  it('and a genuine duplicate is still refused', () => {
    // The counterpart: one role holding the SAME responsibility twice is a real duplicate.
    const project = manualOnlyProject();
    project.assignments.push(asgLike('a-dupe', 't-review', 'role-counsel', 'PERFORMER'));

    const d = generateBlueprintOnce(fixtureD({ project }));
    expect(d.ok).toBe(false);
    // DUPLICATE_ASSIGNMENT, at the PROCESS stage - not PERFORMER_SINGULAR at allocation, which is
    // what I first asserted. factoryValidate keys duplicates on (task, role, responsibility) and
    // runs inside validateProcess, so it fires earlier and more specifically. The expectation was
    // wrong, not the code; asserting the real behaviour is also the better test, because it pins
    // WHICH rule owns this case.
    expect(d.stage).toBe('process');
    expect(d.refusals.map((r) => r.code)).toContain('DUPLICATE_ASSIGNMENT');
  });

  it('A LOW-INFORMATION INTERVIEW yields an empty handoff, not an invented one', () => {
    // The failure mode is a generator filling the silence. An understanding with nothing in it
    // must produce nothing, and the emptiness must be visible downstream rather than papered
    // over with plausible-looking requirements.
    const d = generateBlueprintOnce(fixtureD({ understanding: [] }));

    expect(d.handoff!.items).toEqual([]);
    expect(d.handoff!.overflow).toBeNull();
    // It does not refuse at the handoff: an empty understanding is a real state, and the
    // project it was given is still coherent. What matters is that nothing was invented.
    expect(d.ok).toBe(true);
  });

  it('and an empty understanding cannot be replayed into content', () => {
    const first = generateBlueprintOnce(fixtureD({ understanding: [] }));
    const second = generateBlueprintOnce(fixtureD({
      understanding: [], priorIds: first.idsByLocator,
    }));
    expect(second.handoff!.items).toEqual([]);
  });

  it('THE THIRD CASE IS DEFERRED, and this test records why rather than faking it', () => {
    // "A blueprint changed while generation is in flight" needs a stale-revision refusal, which
    // needs a STORE and a revision to compare against. This module is a pure function with
    // neither: it cannot hold a CAS, and a fake one here would assert nothing about the real
    // race. The mechanism already exists at the Phase 2 approval CAS
    // (uq_blueprint_approval_revision, proven against a real Postgres), and wiring generation to
    // it belongs to Phase 6, where the orchestrator gains a persisted manifest.
    //
    // Asserted as a property of this module so the gap is visible in the suite rather than only
    // in a document: there is no revision concept here to race on.
    const d = generateBlueprintOnce(fixtureD());
    expect(d).not.toHaveProperty('manifestRevision');
    expect(Object.keys(d).sort()).toEqual([
      'advanced', 'attempt', 'handoff', 'idsByLocator', 'measures', 'ok',
      'producedOnAttempt', 'refusals', 'stage',
    ]);
  });
});

describe('`attempt` and `producedOnAttempt` are different numbers', () => {
  it('a regressing repair keeps the earlier draft and says which attempt produced it', () => {
    // The verifier found these conflated: the kept draft came from attempt 1 and was returned
    // carrying attempt: 3.
    const oneProblem = manualOnlyProject();
    oneProblem.transitions = oneProblem.transitions.filter((e) => e.id !== 'e-3');
    const worse = manualOnlyProject();
    worse.transitions = worse.transitions.filter((e) => e.id !== 'e-3');
    worse.tasks.push({ ...worse.tasks[1], id: 't-orphan-1', stage_id: 's9' });

    const d = generateBlueprint(fixtureD({ project: oneProblem }), (_x, attempt) => (
      attempt === 2 ? fixtureD({ project: worse }) : null
    ));

    expect(d.attempt).toBe(2);            // two attempts were made
    expect(d.producedOnAttempt).toBe(1);  // the kept draft is the first one
  });

  it('they agree on a clean run', () => {
    const d = generateBlueprintOnce(fixtureD());
    expect(d.attempt).toBe(d.producedOnAttempt);
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
