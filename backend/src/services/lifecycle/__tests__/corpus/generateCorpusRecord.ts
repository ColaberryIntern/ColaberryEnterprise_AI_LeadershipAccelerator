/**
 * L7.1 - run the reference corpus and RECORD what each shape actually did.
 *
 *   cd backend
 *   node ../node_modules/ts-node/dist/bin.js --transpile-only \
 *     src/services/lifecycle/__tests__/corpus/generateCorpusRecord.ts <out-dir>
 *
 * ## Why this exists when `corpusCases.test.ts` and `corpusVariants.test.ts` already pass
 *
 * "87 tests passed" is not a recorded outcome per shape. The ticket asks for the corpus RUN
 * across the stages, and the thing a reviewer needs afterwards is a per-shape record: which
 * stages this shape drove, which it did not reach and why, and what it proved. A suite tally
 * cannot answer any of those three.
 *
 * It lives in `__tests__/` for the reason `generatePilotReport.ts` does: it drives the reference
 * fixtures, which are test-tier by design, and `backend/tsconfig.json` excludes `__tests__` from
 * the program, so a generator under `src/scripts/` importing them would fail `tsc --noEmit` on an
 * unresolved module. It is not a `.test.ts`, so jest does not collect it.
 *
 * ## IT REFUSES TO WRITE A RECORD IT CANNOT STAND BEHIND
 *
 * Three refusals run before the file is opened, and each one exits non-zero having written
 * nothing:
 *
 * 1. **Every shape must have an outcome.** A shape silently absent from the record is the exact
 *    defect `corpusRunner.ts`'s header describes: a pass reported over a journey that never
 *    happened.
 * 2. **Every driven shape's stage partition must be total.** `partitionIsTotal` is the runner's
 *    own invariant and it is checked here rather than assumed.
 * 3. **The over-limit shape must produce `SourceOverflowBlocked`.** That is the behavior change
 *    this run exists to confirm, and a record claiming it without observing it would be worse
 *    than no record.
 *
 * ## The ticket says "all six stages". The vocabulary is now TEN, driven across FIFTEEN names.
 *
 * L7.1 is titled "Run the reference corpus across all six stages" and was written when
 * `GENERATION_STAGES` held `handoff`, `process`, `allocation`, `agents`, `effort` and `complete`.
 * P5-T1.4 added `workspaces`, `workspace_states`, `controls` and `design`, so that vocabulary is
 * ten. `CORPUS_STAGES` then appends the five database-backed lifecycle stages, which is what a
 * corpus case is actually driven across: fifteen names, ten runnable here and five reported
 * not-reached with the blocker named. Every count in the record is read from the code rather
 * than from the ticket. Running "six of ten" against a ticket that says six would have looked
 * complete.
 */
import fs from 'fs';
import path from 'path';
import { runCorpusCase, partitionIsTotal, type CorpusFixture, type CorpusRun } from './corpusRunner';
import { CORPUS_STAGES, DB_BACKED_STAGES } from './corpusStages';
import { GENERATION_STAGES } from '../../generation/blueprintGeneration';
import { fieldsOf, abcComposition, caseOf, fixtureDCase } from './corpusCaseFixtures';
import { fixtureA, fixtureB, fixtureC } from '../../generation/__tests__/fixtures/referenceFixtures';
import { prerequisiteGaps, blockingGaps } from '../../lifecyclePrerequisites';
import { completeEvidence } from '../evidenceFixture';
import { measureAutomation, renderShare } from '../../generation/effortMeasures';
import {
  buildFactoryDecomposeUserPrompt, coversRequirementBlocks, MAX_BLOCKS,
} from '../../../factory/factoryDecomposePrompt';
import {
  sourceBlocks, sourceOverflows, SourceOverflowError, MAX_BRIEF_CHARS,
} from '../../../sbp/decomposePrompt';
import { FLAGS } from '../../../../config/featureFlags';

/* ------------------------------------------------------------------ the shapes */

/** The seven shapes the ticket names, plus D, which §103 lists as case 4. */
interface ShapeRecord {
  case: number;
  id: string;
  shape: string;
  /** `pipeline` shapes walk the stages. `property` shapes are rules that live elsewhere. */
  kind: 'pipeline' | 'property';
  proves: string;
  outcome: string;
  /** Present for pipeline shapes only. */
  stagesDriven?: string[];
  stagesNotReached?: Array<{ stage: string; reason: string }>;
  generationStoppedAt?: string | null;
  refusals?: Array<{ stage: string; code: string; subject?: string }>;
  effortBases?: string[];
  workspaceCount?: number;
  /** Present for property shapes only: what was read, and what it said. */
  observed?: Record<string, unknown>;
}

const pipelineShape = (
  caseNo: number, shape: string, fixture: CorpusFixture,
): ShapeRecord => {
  const run: CorpusRun = runCorpusCase(fixture);
  if (!partitionIsTotal(run)) {
    throw new Error(
      `REFUSED: shape ${fixture.id} has a stage partition that is not total. `
      + `${run.outcomes.length} outcomes against ${CORPUS_STAGES.length} stages.`,
    );
  }
  const refusals = (run.composed?.refusals ?? []).map((r) => ({
    stage: String(r.stage), code: r.code, subject: r.subject,
  }));
  return {
    case: caseNo,
    id: fixture.id,
    shape,
    kind: 'pipeline',
    proves: fixture.proves,
    outcome: run.generationStoppedAt
      ? `generation stopped at \`${run.generationStoppedAt}\` with ${refusals.length} refusal(s)`
      : `generation ran to \`complete\` with ${refusals.length} refusal(s) from the surface checks`,
    stagesDriven: run.stagesDriven.map(String),
    stagesNotReached: run.stagesNotReached.map((s) => ({ stage: String(s.stage), reason: s.reason })),
    generationStoppedAt: run.generationStoppedAt,
    refusals,
    effortBases: run.effortBases,
    workspaceCount: run.workspaceCount,
  };
};

/** Case 6's fixture: one task assessed, one not. NOT an empty list, which is a different case. */
const lowInformation = (): CorpusFixture => ({
  id: 'C-low-information',
  proves: 'a task with no assessment refuses rather than shrinking the denominator',
  build: () => ({ ...fieldsOf(fixtureC), effort: [fixtureC.effort()[1]] }),
  composition: abcComposition(),
});

/* ------------------------------------------- case 5: one person in several roles (the gate) */

function multiRoleShape(): ShapeRecord {
  const same = 'capture.manager@example.test';
  const read = (approvedBy: string, approvedByRole?: string) => {
    const e = completeEvidence();
    e.proposedBy = same;
    e.approval = { ...e.approval!, approvedBy, ...(approvedByRole ? { approvedByRole } : {}) };
    return prerequisiteGaps('blueprint_approved', e).map((g) => g.rule);
  };

  const sameIdentity = read(same);
  const twoRoleHats = read(same, 'DELIVERY_OWNER');
  const differentHuman = read('director@example.test');

  const rule = 'approval_self_approved';
  if (!sameIdentity.includes(rule) || !twoRoleHats.includes(rule)) {
    throw new Error('REFUSED: case 5 did not observe the self-approval refusal it exists to prove.');
  }
  if (differentHuman.includes(rule)) {
    throw new Error('REFUSED: case 5 control failed, the rule refuses a legitimate approver too.');
  }

  return {
    case: 5,
    id: 'B-multi-role',
    shape: 'multiple roles held by one person',
    kind: 'property',
    proves: 'separation of duty keys on IDENTITY, so a second role hat does not launder a self-approval',
    outcome: 'REFUSED with `approval_self_approved`, and a different approver is NOT refused',
    observed: {
      gate: 'prerequisiteGaps("blueprint_approved")',
      same_identity: sameIdentity.includes(rule) ? rule : null,
      same_identity_second_role: twoRoleHats.includes(rule) ? rule : null,
      different_human_control: differentHuman.includes(rule) ? rule : 'not refused, as intended',
    },
  };
}

/* ------------------- case 7: source over the model limit, on BOTH paths that have one */

function overLimitShape(): ShapeRecord {
  // The FACTORY path: a block over the count cap is dropped, says so, and the coverage check
  // now refuses rather than reading the instruction line and reporting full coverage.
  const block = (id: string, text: string) =>
    ({ id, locator: '1.0', text, kind: 'requirement' as const });
  const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) =>
    block(`blk-${i + 1}`, `requirement number ${i + 1}`));
  const factoryInputs = { sourceBlocks: blocks, requirements: [], context: 'c' };
  const factoryPrompt = buildFactoryDecomposeUserPrompt(factoryInputs);
  const factoryCovers = coversRequirementBlocks(factoryPrompt, factoryInputs);

  // The SBP path, and the arm this run exists to confirm. T12 flipped
  // `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` to on by default, so an over-budget brief is now
  // REFUSED rather than clipped with a label.
  const overBudget = { brief: 'x'.repeat(MAX_BRIEF_CHARS + 1), document: '' };
  const overflows = sourceOverflows(overBudget);

  let errorClass: string | null = null;
  let message: string | null = null;
  try {
    sourceBlocks(overBudget);
  } catch (err: unknown) {
    if (err instanceof SourceOverflowError) {
      errorClass = err.error_class;
      message = err.message;
    } else {
      throw err;
    }
  }

  // The control, and it is not decoration: without it, a `sourceBlocks` that threw on every
  // input would satisfy the assertion above.
  let underBudgetThrew = false;
  try {
    sourceBlocks({ brief: 'a short brief', document: '' });
  } catch {
    underBudgetThrew = true;
  }

  if (!FLAGS.sbpSourceOverflowBlock) {
    throw new Error(
      'REFUSED: `FLAGS.sbpSourceOverflowBlock` is OFF in this environment, so this run cannot '
      + 'observe the behavior change it exists to confirm. Unset ENABLE_SBP_SOURCE_OVERFLOW_BLOCK '
      + 'and run again.',
    );
  }
  if (errorClass !== 'SourceOverflowBlocked') {
    throw new Error(
      `REFUSED: the over-limit shape produced \`${errorClass}\` rather than `
      + '`SourceOverflowBlocked`. The acceptance criterion for this task is that it is REFUSED.',
    );
  }
  if (underBudgetThrew) {
    throw new Error('REFUSED: an under-budget source also threw, so the refusal is not selective.');
  }
  if (factoryCovers !== false) {
    throw new Error('REFUSED: the factory coverage check reported full coverage over a clipped body.');
  }

  return {
    case: 7,
    id: 'A-source-overflow',
    shape: 'source exceeding the model input limits',
    kind: 'property',
    proves: '§103 asks for "an explicit completeness check, chunking, or a VISIBLE BLOCKING overflow"',
    outcome: 'the SBP path now REFUSES with `SourceOverflowBlocked`; the factory path drops, labels, and its coverage check refuses',
    observed: {
      sbp_path: {
        entry: 'sourceBlocks() via buildDecomposeUserPrompt()',
        flag: 'FLAGS.sbpSourceOverflowBlock',
        flag_state: FLAGS.sbpSourceOverflowBlock,
        brief_chars: overBudget.brief.length,
        limit: MAX_BRIEF_CHARS,
        overflows: overflows.map((o) => ({
          tag: o.tag, actual: o.actual, limit: o.limit, droppedChars: o.droppedChars,
        })),
        error_class: errorClass,
        message,
        under_budget_control: 'did not throw',
      },
      factory_path: {
        entry: 'buildFactoryDecomposeUserPrompt()',
        blocks_supplied: blocks.length,
        cap: MAX_BLOCKS,
        dropped_id_named_in_body: factoryPrompt.includes(`blk-${MAX_BLOCKS + 1}`),
        coversRequirementBlocks: factoryCovers,
      },
    },
  };
}

/* ---------------- case 8: a blueprint changed while generation was in flight (the gate) */

function inFlightShape(): ShapeRecord {
  /*
   * The mechanism is a REVISION COMPARISON, not a condition flag. The first version of this
   * function set `condition = 'needs_reapproval'` and looked for extra gaps; the generator
   * refused to write a record rather than reporting an outcome I had guessed at. The real rule
   * is `approval_revision_moved`: the approval holds the revision it was given, and
   * `currentManifestRevision` is what the manifest is NOW.
   */
  const stale = (stage: 'blueprint_approved' | 'planning') => {
    const e = completeEvidence();
    e.approval = { ...e.approval!, revision: 4 };
    e.currentManifestRevision = 5;
    return blockingGaps(prerequisiteGaps(stage, e));
  };

  const rule = 'approval_revision_moved';
  const atApproval = stale('blueprint_approved');
  const atPlanning = stale('planning');

  // The control. A rule that refused every input would satisfy both checks above.
  const matched = completeEvidence();
  matched.approval = { ...matched.approval!, revision: 4 };
  matched.currentManifestRevision = 4;
  const control = blockingGaps(prerequisiteGaps('planning', matched));

  if (!atApproval.some((g) => g.rule === rule) || !atPlanning.some((g) => g.rule === rule)) {
    throw new Error(
      'REFUSED: case 8 did not observe `approval_revision_moved` at BOTH `blueprint_approved` '
      + 'and `planning`. Checking once at approval is what the rule exists to prevent.',
    );
  }
  if (control.length) {
    throw new Error(
      `REFUSED: case 8 control failed, a matching revision was blocked by `
      + `${control.map((g) => g.rule).join(', ')}.`,
    );
  }

  const moved = atPlanning.find((g) => g.rule === rule);
  return {
    case: 8,
    id: 'A-in-flight-change',
    shape: 'blueprint changed while plan generation is in flight',
    kind: 'property',
    proves: 'an in-flight generation cannot publish against a superseded revision',
    outcome: `REFUSED with \`${rule}\` at \`blueprint_approved\` AND re-checked at \`planning\``,
    observed: {
      gate: 'blockingGaps(prerequisiteGaps(stage))',
      approval_revision: 4,
      current_manifest_revision: 5,
      blocking_at_blueprint_approved: atApproval.map((g) => g.rule),
      blocking_at_planning: atPlanning.map((g) => g.rule),
      message: moved?.message ?? null,
      matching_revision_control: control.length === 0 ? 'no blocking gaps, as intended' : control.map((g) => g.rule),
    },
  };
}

/* ------------------------------------------------------------------ the record */

function build(): { shapes: ShapeRecord[]; stages: string[] } {
  const shapes: ShapeRecord[] = [
    pipelineShape(1, 'ordinary AI service application',
      caseOf('C-ordinary', 'the common path works end to end', fixtureC)),
    pipelineShape(2, 'government project, linked proposal and solution tracks',
      caseOf('A-government', 'track mappings preserved', fixtureA)),
    pipelineShape(3, 'human-heavy workflow',
      caseOf('B-human-heavy', 'below-target is honest, not reclassified', fixtureB)),
    pipelineShape(4, 'manual-only workflow', fixtureDCase()),
    multiRoleShape(),
    pipelineShape(6, 'low-information interview', lowInformation()),
    overLimitShape(),
    inFlightShape(),
  ].sort((a, b) => a.case - b.case);

  const seen = new Set(shapes.map((s) => s.case));
  for (let c = 1; c <= 8; c += 1) {
    if (!seen.has(c)) throw new Error(`REFUSED: §103 case ${c} has no recorded outcome.`);
  }
  return { shapes, stages: CORPUS_STAGES.map(String) };
}

function renderMarkdown(r: { shapes: ShapeRecord[]; stages: string[] }, when: string): string {
  const lines: string[] = [
    '# L7.1 - the reference corpus, run and recorded',
    '',
    `Run ${when} - session \`CC-20261120-k4d9\` - ticket L7.1 (\`10396178198\`).`,
    '',
    '## The ticket says six stages. The vocabulary is ten, across fifteen names.',
    '',
    'L7.1 is titled "Run the reference corpus across all six stages", written when the generation',
    'vocabulary was `handoff`, `process`, `allocation`, `agents`, `effort` and `complete`. P5-T1.4',
    `added \`workspaces\`, \`workspace_states\`, \`controls\` and \`design\`, so it is now **${GENERATION_STAGES.length}**.`,
    `\`CORPUS_STAGES\` then appends the ${DB_BACKED_STAGES.length} database-backed lifecycle stages, which is what a case is`,
    `actually driven across: **${r.stages.length} names** in total.`,
    '',
    `**Generation (${GENERATION_STAGES.length}):** ${GENERATION_STAGES.map((s) => `\`${s}\``).join(', ')}`,
    '',
    `**Database-backed (${DB_BACKED_STAGES.length}), reported not reached with the blocker named:** ${DB_BACKED_STAGES.map((s) => `\`${s}\``).join(', ')}`,
    '',
    'Every count here is read from the code, not from the ticket. Running six of ten against a',
    'ticket that says six would have read as complete.',
    '',
    '## One row per shape',
    '',
    '| # | Shape | Kind | Outcome |',
    '|---|---|---|---|',
    ...r.shapes.map((s) => `| ${s.case} | ${s.shape} | ${s.kind} | ${s.outcome} |`),
    '',
    '`pipeline` shapes walk the stage vocabulary. `property` shapes are rules that do not live in',
    'generation at all: cases 5 and 8 are properties of the prerequisite gate, and case 7 is a',
    'property of the two prompt builders. Recording them as stage walks would have been a stage',
    'partition over a journey none of them takes.',
    '',
    '## What this run confirms that the previous one could not',
    '',
    'Case 7 is the behavior change. `ENABLE_SBP_SOURCE_OVERFLOW_BLOCK` now defaults ON, so an',
    'over-budget brief is **REFUSED** with `error_class: SourceOverflowBlocked` rather than clipped',
    'with a label inside the prompt. The record carries the measured overflow, the error class, and',
    'the under-budget control that proves the refusal is selective rather than unconditional.',
    '',
    '## Per-shape detail',
    '',
  ];

  for (const s of r.shapes) {
    lines.push(`### Case ${s.case}: ${s.shape}`, '');
    lines.push(`**Fixture:** \`${s.id}\`  `, `**Proves:** ${s.proves}  `, `**Outcome:** ${s.outcome}`, '');
    if (s.kind === 'pipeline') {
      lines.push(`**Stages driven (${s.stagesDriven!.length}):** ${s.stagesDriven!.map((x) => `\`${x}\``).join(', ') || 'none'}`, '');
      /*
       * Grouped by reason rather than one line per stage. The five database-backed stages share
       * one blocker verbatim, and printing it five times per shape, across five shapes, buries
       * the per-shape findings under twenty-five copies of the same paragraph. Grouping loses
       * nothing: every stage is still named, beside the reason it carries.
       */
      const byReason = new Map<string, string[]>();
      for (const n of s.stagesNotReached!) {
        byReason.set(n.reason, [...(byReason.get(n.reason) ?? []), n.stage]);
      }
      lines.push(`**Stages not reached (${s.stagesNotReached!.length}),** each with its reason:`, '');
      for (const [reason, stages] of byReason) {
        lines.push(`- ${stages.map((x) => `\`${x}\``).join(', ')}: ${reason}`);
      }
      lines.push('');
      if (s.refusals!.length) {
        lines.push('**Refusals:**', '');
        for (const f of s.refusals!) {
          lines.push(`- \`${f.stage}\` / \`${f.code}\`${f.subject ? ` on \`${f.subject}\`` : ''}`);
        }
        lines.push('');
      }
      lines.push(`**Effort bases declared:** ${s.effortBases!.join(', ') || 'none'}  `);
      lines.push(`**Workspaces:** ${s.workspaceCount}`, '');
    } else {
      lines.push('**Observed:**', '', '```json', JSON.stringify(s.observed, null, 2), '```', '');
    }
  }

  lines.push(
    '## What this run does NOT cover',
    '',
    'The five database-backed stages are reported not reached, with the blocker named per shape.',
    'That is accounted for rather than skipped: `approveBlueprint` writes the approval row and',
    '`publishedPlanState` reads the published plan, and neither has a database here. The pure parts',
    'of that half do run.',
    '',
    'No model was called. The fixtures supply model output as input, which is what makes this',
    'deterministic and runnable with no network. A live-generation evaluation is a separate,',
    'authorized exercise and this record makes no claim about one.',
    '',
  );
  return lines.join('\n');
}

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: generateCorpusRecord.ts <out-dir>');
  process.exit(2);
}

const record = build();
const when = new Date().toISOString().slice(0, 10);

fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, 'corpus-run-l71.json');
const mdPath = path.join(outDir, 'corpus-run-l71.md');
fs.writeFileSync(jsonPath, `${JSON.stringify({ ticket: 'L7.1', run: when, session: 'CC-20261120-k4d9', stages: record.stages, shapes: record.shapes }, null, 2)}\n`, 'utf8');
fs.writeFileSync(mdPath, renderMarkdown(record, when), 'utf8');

console.log(`${record.shapes.length} shapes recorded across ${record.stages.length} stages.`);
console.log(`wrote ${jsonPath}`);
console.log(`wrote ${mdPath}`);
