import type { DemoSpec } from '../demoSpec/contract';
import { TIME_FIELD_TYPES, type FieldType } from './visualRules';

/**
 * demoVisual/specReaders - read the loosely-typed half of a demo spec without trusting it. PURE.
 *
 * ## Why this exists
 *
 * `DemoSpecSchema` types `events` precisely and then types `screens`, `entities` and `nav` as
 * `z.record(z.string(), z.unknown())`. That is deliberate (the shapes are the engine's contract,
 * not the persistence contract) but it means everything the visual rules need to inspect arrives
 * as `unknown`, from a document an agent wrote and a student may have edited.
 *
 * So every reader here answers with a narrowed value or omits the thing entirely. None throws.
 * A spec with a malformed entity must still produce a plan for the rest of the spec: refusing the
 * whole demo because one field object is a string would turn a cosmetic flaw into a blank page,
 * and the renderer already has a fallback for every block.
 *
 * ## What it does NOT do
 *
 * It makes no decisions. Nothing here knows what a timeline is or when one is worth drawing;
 * `visualPlan.ts` owns that. Keeping the two apart is what lets the rules be tested against hand
 * written shapes without a spec, and the readers against broken specs without a rule in sight.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface FieldView {
  key: string;
  type: FieldType | null;
  unit: string | null;
  /** `max` on a meter, or any stated ceiling a number is measured against. */
  max: number | null;
  warn: number | null;
  /** The entity a `ref` points at. */
  ref: string | null;
  /** enum value -> words, and enum value -> tone. */
  labels: Record<string, string> | null;
  tones: Record<string, string> | null;
  /** Set only on `private`. The field has no value anywhere; this is all that may be shown. */
  shownAs: string | null;
}

export interface ActionView {
  label: string | null;
  when: Record<string, unknown> | null;
}

export interface EntityView {
  key: string;
  label: string | null;
  plural: string | null;
  /** The field key naming this entity's status, when it declares one. */
  statusField: string | null;
  columns: string[];
  fields: FieldView[];
  rows: Array<Record<string, unknown>>;
  actions: ActionView[];
}

function readField(key: string, raw: unknown): FieldView {
  const r = isRecord(raw) ? raw : {};
  const type = str(r.type);
  return {
    key,
    type: (type as FieldType) || null,
    unit: str(r.unit),
    // `target` is not in the v1 contract. It is read here because phase 3 adds it as an optional
    // field and a spec that already carries one should get its reference line today.
    max: num(r.max) ?? num(r.target),
    warn: num(r.warn),
    ref: str(r.ref),
    labels: isRecord(r.labels) ? (r.labels as Record<string, string>) : null,
    tones: isRecord(r.tones) ? (r.tones as Record<string, string>) : null,
    shownAs: str(r.shown_as),
  };
}

function readEntity(key: string, raw: unknown): EntityView | null {
  if (!isRecord(raw)) return null;
  const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : [];
  const fields: FieldView[] = [];
  for (const f of fieldsRaw) {
    const fk = isRecord(f) ? str(f.key) : null;
    if (fk) fields.push(readField(fk, f));
  }
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(isRecord) : [];
  const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
  const actions: ActionView[] = actionsRaw.filter(isRecord).map((a) => ({
    label: str(a.label),
    when: isRecord(a.when) ? a.when : null,
  }));
  return {
    key,
    label: str(raw.label),
    plural: str(raw.plural),
    statusField: str(raw.status),
    columns: Array.isArray(raw.columns) ? raw.columns.filter((c): c is string => typeof c === 'string') : [],
    fields,
    rows: rows as Array<Record<string, unknown>>,
    actions,
  };
}

export function entitiesOf(spec: DemoSpec): EntityView[] {
  const raw = (spec as { entities?: unknown }).entities;
  if (!isRecord(raw)) return [];
  const out: EntityView[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const entity = readEntity(key, value);
    if (entity) out.push(entity);
  }
  // Sorted by key so the plan is deterministic whatever order the JSONB column came back in.
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export interface ScreenView {
  id: string;
  type: string | null;
  title: string | null;
  entity: string | null;
  /** home screens only: the declared blocks, in the order the spec gives them. */
  blocks: Array<Record<string, unknown>>;
}

export function screensOf(spec: DemoSpec): ScreenView[] {
  const raw = (spec as { screens?: unknown }).screens;
  if (!isRecord(raw)) return [];
  const out: ScreenView[] = [];
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    out.push({
      id,
      type: str(value.type),
      title: str(value.title),
      entity: str(value.entity),
      blocks: Array.isArray(value.blocks) ? value.blocks.filter(isRecord) : [],
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** A field a number can be measured against: a meter, or a number with a stated ceiling. */
export function measuredFields(entity: EntityView): FieldView[] {
  return entity.fields.filter(
    (f) => f.type !== 'private' && f.max !== null && (f.type === 'meter' || f.type === 'number'),
  );
}

/** Numeric fields with no stated ceiling. Compared against each other rather than a target. */
export function plainNumberFields(entity: EntityView): FieldView[] {
  return entity.fields.filter((f) => f.type === 'number' && f.max === null);
}

export function enumFields(entity: EntityView): FieldView[] {
  return entity.fields.filter((f) => f.type === 'enum');
}

export function refFields(entity: EntityView): FieldView[] {
  return entity.fields.filter((f) => f.type === 'ref' && f.ref !== null);
}

export function timeFields(entity: EntityView): FieldView[] {
  return entity.fields.filter((f) => f.type !== null && TIME_FIELD_TYPES.includes(f.type));
}

/**
 * How many rows actually carry a usable number for this field.
 *
 * Counted rather than assumed from `rows.length`, because a field declared on an entity is not a
 * field every row fills, and a bar chart of nine rows where four are blank is a chart that lies
 * about its own completeness.
 */
export function rowsWithNumber(entity: EntityView, fieldKey: string): number {
  return entity.rows.filter((r) => num(r[fieldKey]) !== null).length;
}

/** Distinct non-empty values of a field across an entity's rows, in first-seen order. */
export function distinctValues(entity: EntityView, fieldKey: string): string[] {
  const seen: string[] = [];
  for (const row of entity.rows) {
    const v = row[fieldKey];
    const key = typeof v === 'string' || typeof v === 'number' ? String(v) : null;
    if (key !== null && key !== '' && !seen.includes(key)) seen.push(key);
  }
  return seen;
}

export { isRecord, num, str };
