import { sequelize } from '../../config/database';
import type {
  MeasurementDefinition,
  MeasurementOutcome,
  MeasurementDirection,
} from './projectMeasurement';

/**
 * projectMeasurementStore - read and write measurement definitions and the
 * readings taken against them. I/O.
 *
 * The RULE about what counts lives in `projectMeasurement.ts`, which is pure. This
 * module only moves rows. That split is why the ladder can be tested without a
 * database, and it is the same split `storyEnrichmentLedger` and
 * `caseStudyFoundation` already use.
 *
 * ## Reads fail SOFT, and that is deliberate
 *
 * `loadCaseStudyFoundation` calls this on every read of any project's foundation.
 * If these tables are missing - the window between merging this and the schema
 * running at boot, or a database that never ran it - a throw here would take out
 * the foundation for every project on the platform to report that one optional
 * section is empty. So a failed read logs and returns `[]`, which renders exactly
 * what every project showed before these tables existed.
 *
 * Writes do NOT fail soft. Losing a measurement somebody recorded, silently, is
 * worse than an error they can see.
 */

const DEFINITION_COLUMNS = `
  id, measurement_key, name, question, method, unit, direction,
  baseline_display, status, created_by, approved_by, approved_at`;

const OUTCOME_COLUMNS = `
  id, definition_id, value_display, numeric_value, unit, baseline_display,
  sample, observed_from, observed_to, evidence, evidence_url, status,
  recorded_by, confirmed_by, confirmed_at`;

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** `DATE` columns come back as a Date or a string; the page wants a day, not an instant. */
const day = (v: unknown): string | null => {
  const s = iso(v);
  return s ? s.slice(0, 10) : null;
};

const str = (v: unknown): string => String(v ?? '');
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toDefinition(r: any): MeasurementDefinition {
  return {
    id: str(r.id),
    measurementKey: str(r.measurement_key),
    name: str(r.name),
    question: str(r.question),
    method: str(r.method),
    unit: strOrNull(r.unit),
    direction: str(r.direction) as MeasurementDirection,
    baselineDisplay: strOrNull(r.baseline_display),
    status: str(r.status) as MeasurementDefinition['status'],
    createdBy: str(r.created_by),
    approvedBy: strOrNull(r.approved_by),
    approvedAt: iso(r.approved_at),
  };
}

function toOutcome(r: any): MeasurementOutcome {
  return {
    id: str(r.id),
    definitionId: str(r.definition_id),
    valueDisplay: str(r.value_display),
    numericValue: r.numeric_value === null || r.numeric_value === undefined ? null : Number(r.numeric_value),
    unit: strOrNull(r.unit),
    baselineDisplay: strOrNull(r.baseline_display),
    sample: strOrNull(r.sample),
    observedFrom: day(r.observed_from),
    observedTo: day(r.observed_to),
    evidence: str(r.evidence),
    evidenceUrl: strOrNull(r.evidence_url),
    status: str(r.status) as MeasurementOutcome['status'],
    recordedBy: str(r.recorded_by),
    confirmedBy: strOrNull(r.confirmed_by),
    confirmedAt: iso(r.confirmed_at),
  };
}

function warnSoftRead(event: string, projectId: string, err: any): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'project-measurement',
    event,
    outcome: 'failure',
    error_class: err?.name || 'Error',
    context: { project_id: projectId, detail: String(err?.message ?? '').slice(0, 200) },
  }));
}

export async function listMeasurementDefinitions(projectId: string): Promise<MeasurementDefinition[]> {
  try {
    const [rows]: any = await sequelize.query(
      `SELECT ${DEFINITION_COLUMNS} FROM project_measurement_definitions
        WHERE project_id = $projectId ORDER BY created_at ASC`,
      { bind: { projectId } },
    );
    return (rows ?? []).map(toDefinition);
  } catch (err: any) {
    warnSoftRead('project_measurement.definitions_read_failed', projectId, err);
    return [];
  }
}

export async function listMeasurementOutcomes(projectId: string): Promise<MeasurementOutcome[]> {
  try {
    const [rows]: any = await sequelize.query(
      `SELECT ${OUTCOME_COLUMNS} FROM project_measurement_outcomes
        WHERE project_id = $projectId ORDER BY created_at ASC`,
      { bind: { projectId } },
    );
    return (rows ?? []).map(toOutcome);
  } catch (err: any) {
    warnSoftRead('project_measurement.outcomes_read_failed', projectId, err);
    return [];
  }
}

/** Both lists, in one round trip's worth of latency. */
export async function listProjectMeasurements(projectId: string): Promise<{
  definitions: MeasurementDefinition[];
  outcomes: MeasurementOutcome[];
}> {
  const [definitions, outcomes] = await Promise.all([
    listMeasurementDefinitions(projectId),
    listMeasurementOutcomes(projectId),
  ]);
  return { definitions, outcomes };
}

/* ─────────────────────────────────────────────────────────────── writes ──── */

export interface CreateDefinitionInput {
  projectId: string;
  measurementKey: string;
  name: string;
  question: string;
  method: string;
  unit?: string | null;
  direction?: MeasurementDirection;
  baselineDisplay?: string | null;
  createdBy: string;
}

/** Create a PROPOSED definition. Nothing is approved by the act of writing it. */
export async function createMeasurementDefinition(input: CreateDefinitionInput): Promise<MeasurementDefinition> {
  const [rows]: any = await sequelize.query(
    `INSERT INTO project_measurement_definitions
       (project_id, measurement_key, name, question, method, unit, direction, baseline_display, created_by)
     VALUES ($projectId, $measurementKey, $name, $question, $method, $unit, $direction, $baselineDisplay, $createdBy)
     RETURNING ${DEFINITION_COLUMNS}`,
    {
      bind: {
        projectId: input.projectId,
        measurementKey: input.measurementKey.trim(),
        name: input.name.trim(),
        question: input.question.trim(),
        method: input.method.trim(),
        unit: input.unit ?? null,
        direction: input.direction ?? 'lower_is_better',
        baselineDisplay: input.baselineDisplay ?? null,
        createdBy: input.createdBy,
      },
    },
  );
  return toDefinition(rows[0]);
}

/**
 * Approve a definition, as somebody other than its author.
 *
 * The `LOWER(created_by) <> LOWER($approver)` in the WHERE is what makes a
 * self-approval return no row rather than succeeding quietly. The database carries
 * the same rule as a CHECK; this one turns it into a clear refusal instead of a
 * constraint violation.
 */
export async function approveMeasurementDefinition(
  definitionId: string, approver: string,
): Promise<MeasurementDefinition | null> {
  const [rows]: any = await sequelize.query(
    `UPDATE project_measurement_definitions
        SET status = 'approved', approved_by = $approver, approved_at = NOW(), updated_at = NOW()
      WHERE id = $definitionId
        AND status = 'proposed'
        AND LOWER(created_by) <> LOWER($approver)
      RETURNING ${DEFINITION_COLUMNS}`,
    { bind: { definitionId, approver } },
  );
  return rows && rows[0] ? toDefinition(rows[0]) : null;
}

export interface RecordOutcomeInput {
  projectId: string;
  definitionId: string;
  valueDisplay: string;
  numericValue?: number | null;
  unit?: string | null;
  baselineDisplay?: string | null;
  sample?: string | null;
  observedFrom?: string | null;
  observedTo?: string | null;
  evidence: string;
  evidenceUrl?: string | null;
  note?: string | null;
  recordedBy: string;
}

/**
 * Record a reading. It counts for nothing until somebody else confirms it.
 *
 * The definition must already be APPROVED. Recording against a proposal would let
 * the question be written around an answer that is already in hand, which is the
 * ordering this whole design exists to fix.
 */
export async function recordMeasurementOutcome(input: RecordOutcomeInput): Promise<MeasurementOutcome> {
  const [defRows]: any = await sequelize.query(
    `SELECT status FROM project_measurement_definitions WHERE id = $definitionId AND project_id = $projectId`,
    { bind: { definitionId: input.definitionId, projectId: input.projectId } },
  );
  const def = defRows && defRows[0];
  if (!def) throw new Error('MeasurementDefinitionNotFound');
  if (String(def.status) !== 'approved') throw new Error('MeasurementDefinitionNotApproved');

  const [rows]: any = await sequelize.query(
    `INSERT INTO project_measurement_outcomes
       (definition_id, project_id, value_display, numeric_value, unit, baseline_display,
        sample, observed_from, observed_to, evidence, evidence_url, note, recorded_by)
     VALUES ($definitionId, $projectId, $valueDisplay, $numericValue, $unit, $baselineDisplay,
             $sample, $observedFrom, $observedTo, $evidence, $evidenceUrl, $note, $recordedBy)
     RETURNING ${OUTCOME_COLUMNS}`,
    {
      bind: {
        definitionId: input.definitionId,
        projectId: input.projectId,
        valueDisplay: input.valueDisplay.trim(),
        numericValue: input.numericValue ?? null,
        unit: input.unit ?? null,
        baselineDisplay: input.baselineDisplay ?? null,
        sample: input.sample ?? null,
        observedFrom: input.observedFrom ?? null,
        observedTo: input.observedTo ?? null,
        evidence: input.evidence.trim(),
        evidenceUrl: input.evidenceUrl ?? null,
        note: input.note ?? null,
        recordedBy: input.recordedBy,
      },
    },
  );
  return toOutcome(rows[0]);
}

/** Confirm a reading, as somebody other than whoever recorded it. Null means refused. */
export async function confirmMeasurementOutcome(
  outcomeId: string, confirmer: string,
): Promise<MeasurementOutcome | null> {
  const [rows]: any = await sequelize.query(
    `UPDATE project_measurement_outcomes
        SET status = 'confirmed', confirmed_by = $confirmer, confirmed_at = NOW(), updated_at = NOW()
      WHERE id = $outcomeId
        AND status = 'recorded'
        AND LOWER(recorded_by) <> LOWER($confirmer)
      RETURNING ${OUTCOME_COLUMNS}`,
    { bind: { outcomeId, confirmer } },
  );
  return rows && rows[0] ? toOutcome(rows[0]) : null;
}
