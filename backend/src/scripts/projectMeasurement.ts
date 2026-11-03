/**
 * projectMeasurement - define, approve, record and confirm a project's measurements.
 *
 * This is the operator surface for the thing that lets a student project reach
 * `operational_result` and therefore have a publishable case study. Without it the
 * services exist and nobody can reach them.
 *
 *   node dist/scripts/projectMeasurement.js --project=<uuid> --list
 *
 *   node dist/scripts/projectMeasurement.js --project=<uuid> --define \
 *     --key=st2-review-minutes --name="ST2 reviewer minutes" \
 *     --question="How long does one ST2 review take a reviewer?" \
 *     --method="Active time between reviewer actions in the app audit trail." \
 *     --unit=minutes --direction=lower_is_better \
 *     --baseline="about 30 minutes by hand" --actor=<email> --apply
 *
 *   node dist/scripts/projectMeasurement.js --approve=<definitionId> --actor=<email> --apply
 *
 *   node dist/scripts/projectMeasurement.js --project=<uuid> --record \
 *     --definition=<definitionId> --value="about 12 minutes" --numeric=12 \
 *     --sample="4 ST2 reviews, 19 Oct to 2 Nov 2026" \
 *     --evidence="app audit trail" --actor=<email> --apply
 *
 *   node dist/scripts/projectMeasurement.js --confirm=<outcomeId> --actor=<email> --apply
 *
 * DRY RUN BY DEFAULT. Nothing writes without `--apply`.
 *
 * ## The two refusals this surface exists to make visible
 *
 * `--approve` refuses the author of the definition, and `--confirm` refuses whoever
 * recorded the reading. Both come back as a plain refusal rather than a constraint
 * violation, because the person running this needs to understand WHY, and "a second
 * person signs" is the rule the whole ladder rests on. The database carries the same
 * rule as a CHECK, so neither can be routed around by a different caller.
 */
import {
  listProjectMeasurements,
  createMeasurementDefinition,
  approveMeasurementDefinition,
  recordMeasurementOutcome,
  confirmMeasurementOutcome,
} from '../services/sbp/projectMeasurementStore';
import { outcomeEvidenceItems, outcomeGapReason, type MeasurementDirection } from '../services/sbp/projectMeasurement';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
};
const has = (name: string): boolean => flag(name) !== undefined;
const APPLY = has('apply');

const out = (o: unknown): void => { process.stdout.write(`${JSON.stringify(o, null, 2)}\n`); };
const fail = (msg: string): never => { process.stderr.write(`${msg}\n`); process.exit(2); };

(async () => {
  const actor = flag('actor') || '';

  /* ── list ─────────────────────────────────────────────────────────────── */
  if (has('list')) {
    const projectId = flag('project') || fail('--project=<uuid> is required');
    const { definitions, outcomes } = await listProjectMeasurements(projectId);
    const counted = outcomeEvidenceItems(definitions, outcomes);
    out({
      project_id: projectId,
      definitions: definitions.map((d) => ({
        id: d.id, key: d.measurementKey, name: d.name, status: d.status,
        created_by: d.createdBy, approved_by: d.approvedBy,
      })),
      outcomes: outcomes.map((o) => ({
        id: o.id, definition_id: o.definitionId, value: o.valueDisplay,
        status: o.status, recorded_by: o.recordedBy, confirmed_by: o.confirmedBy,
      })),
      // The number that decides the rung, and the sentence explaining any shortfall.
      counting_outcomes: counted.length,
      gap: counted.length ? null : outcomeGapReason(definitions, outcomes),
    });
    process.exit(0);
  }

  /* ── define ───────────────────────────────────────────────────────────── */
  if (has('define')) {
    const projectId = flag('project') || fail('--project=<uuid> is required');
    const key = flag('key') || fail('--key=<slug> is required');
    const name = flag('name') || fail('--name=<text> is required');
    const question = flag('question') || fail('--question=<text> is required');
    const method = flag('method') || fail('--method=<text> is required');
    if (!actor) fail('--actor=<email> is required');

    const direction = (flag('direction') || 'lower_is_better') as MeasurementDirection;
    if (!['lower_is_better', 'higher_is_better', 'target'].includes(direction)) {
      fail(`--direction must be lower_is_better | higher_is_better | target, got "${direction}"`);
    }

    const plan = {
      action: 'define', apply: APPLY, project_id: projectId,
      key, name, question, method,
      unit: flag('unit') || null, direction, baseline: flag('baseline') || null,
      created_by: actor,
      note: 'A definition is created PROPOSED. It counts for nothing until somebody other than its author approves it.',
    };
    if (!APPLY) { out({ ...plan, would_write: true }); process.exit(0); }

    const def = await createMeasurementDefinition({
      projectId, measurementKey: key, name, question, method,
      unit: flag('unit') || null, direction, baselineDisplay: flag('baseline') || null,
      createdBy: actor,
    });
    out({ ...plan, created: true, definition_id: def.id, status: def.status });
    process.exit(0);
  }

  /* ── approve ──────────────────────────────────────────────────────────── */
  if (has('approve')) {
    const definitionId = flag('approve') || fail('--approve=<definitionId> is required');
    if (!actor) fail('--actor=<email> is required');
    if (!APPLY) { out({ action: 'approve', apply: false, definition_id: definitionId, approver: actor }); process.exit(0); }

    const def = await approveMeasurementDefinition(definitionId, actor);
    if (!def) {
      out({
        action: 'approve', definition_id: definitionId, approved: false,
        reason: 'Refused. Either the definition is not in "proposed", or the approver is its own author. A measurement is approved by somebody other than whoever wrote it.',
      });
      process.exit(1);
    }
    out({ action: 'approve', definition_id: def.id, approved: true, approved_by: def.approvedBy, status: def.status });
    process.exit(0);
  }

  /* ── record ───────────────────────────────────────────────────────────── */
  if (has('record')) {
    const projectId = flag('project') || fail('--project=<uuid> is required');
    const definitionId = flag('definition') || fail('--definition=<definitionId> is required');
    const valueDisplay = flag('value') || fail('--value=<text> is required');
    const evidence = flag('evidence') || fail('--evidence=<text> is required: where the number came from');
    if (!actor) fail('--actor=<email> is required');

    const numericRaw = flag('numeric');
    const numericValue = numericRaw === undefined || numericRaw === '' ? null : Number(numericRaw);
    if (numericValue !== null && !Number.isFinite(numericValue)) fail(`--numeric must be a number, got "${numericRaw}"`);

    const plan = {
      action: 'record', apply: APPLY, project_id: projectId, definition_id: definitionId,
      value: valueDisplay, numeric: numericValue, unit: flag('unit') || null,
      baseline: flag('baseline') || null, sample: flag('sample') || null,
      observed_from: flag('from') || null, observed_to: flag('to') || null,
      evidence, recorded_by: actor,
      note: 'The definition must already be approved, and the reading counts for nothing until somebody else confirms it.',
    };
    if (!APPLY) { out({ ...plan, would_write: true }); process.exit(0); }

    try {
      const o = await recordMeasurementOutcome({
        projectId, definitionId, valueDisplay, numericValue,
        unit: flag('unit') || null, baselineDisplay: flag('baseline') || null,
        sample: flag('sample') || null, observedFrom: flag('from') || null,
        observedTo: flag('to') || null, evidence, evidenceUrl: flag('evidence-url') || null,
        note: flag('note') || null, recordedBy: actor,
      });
      out({ ...plan, created: true, outcome_id: o.id, status: o.status });
      process.exit(0);
    } catch (e: any) {
      const m = String(e?.message ?? e);
      out({
        ...plan, created: false, error_class: m,
        reason: m === 'MeasurementDefinitionNotApproved'
          ? 'The definition is not approved yet. A reading recorded against a proposal would let the question be written around an answer already in hand.'
          : m === 'MeasurementDefinitionNotFound'
            ? 'No such definition on that project.'
            : 'See error_class.',
      });
      process.exit(1);
    }
  }

  /* ── confirm ──────────────────────────────────────────────────────────── */
  if (has('confirm')) {
    const outcomeId = flag('confirm') || fail('--confirm=<outcomeId> is required');
    if (!actor) fail('--actor=<email> is required');
    if (!APPLY) { out({ action: 'confirm', apply: false, outcome_id: outcomeId, confirmer: actor }); process.exit(0); }

    const o = await confirmMeasurementOutcome(outcomeId, actor);
    if (!o) {
      out({
        action: 'confirm', outcome_id: outcomeId, confirmed: false,
        reason: 'Refused. Either the reading is not in "recorded", or the confirmer is whoever recorded it. The person who read the number does not get to be the person who establishes it.',
      });
      process.exit(1);
    }
    out({ action: 'confirm', outcome_id: o.id, confirmed: true, confirmed_by: o.confirmedBy, status: o.status });
    process.exit(0);
  }

  process.stderr.write(
    'Usage: --project=<uuid> --list\n'
    + '       --project=<uuid> --define --key= --name= --question= --method= [--unit=] [--direction=] [--baseline=] --actor= [--apply]\n'
    + '       --approve=<definitionId> --actor= [--apply]\n'
    + '       --project=<uuid> --record --definition= --value= --evidence= [--numeric=] [--unit=] [--sample=] [--from=] [--to=] --actor= [--apply]\n'
    + '       --confirm=<outcomeId> --actor= [--apply]\n',
  );
  process.exit(2);
})().catch((e) => {
  process.stderr.write(`FAILED ${e?.message ?? e}\n`);
  process.exit(1);
});
