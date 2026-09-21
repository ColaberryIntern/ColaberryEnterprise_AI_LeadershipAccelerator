import { Op } from 'sequelize';
import { GrowthJourneyExecutionControl, JourneyProgram, Lead } from '../../../models';
import type { GrowthJourneyControlKind, GrowthJourneyControlMode } from '../../../models/GrowthJourneyExecutionControl';
import { recordJourneyEvent } from '../ledger';
import { pauseScopeKey, rolloutScopeKey, ScopeKeyError } from './scopeKey';

/**
 * Writing the operator's switchboard (Phase 5 T518).
 *
 * T504 reads `growth_journey_execution_controls`; this is the ONE writer. Every
 * write is one row plus one ledger row, and a row is CLEARED, never edited or
 * deleted: changing a control means clearing the active row and writing a new
 * one, so who paused what, and when, survives the change.
 *
 * ─── WHAT THE DATABASE DECIDES ──────────────────────────────────────────────
 *
 *   one active control per scope   the partial unique on `scope_key` - a second
 *                                  active row for a scope is a unique violation,
 *                                  answered here as a 409, never a read-then-write
 *   a cleared row stays cleared    the clear is `UPDATE ... WHERE id AND cleared_at IS NULL`,
 *                                  so two clears write one ledger row
 *   no all-wildcard pause          `pauseScopeKey` refuses it (a second kill switch)
 *
 * ─── WHAT THIS MODULE DECIDES ───────────────────────────────────────────────
 *
 *   a rollout's programme belongs to its brand; a limited rollout's cohort is
 *   existing lead ids (every id must resolve) - both 400, named.
 *
 * Authorisation is the controller's, before any of this runs. The actor on the
 * row and in the ledger is the admin's id, never an email. No address is
 * written here: a subject ref is `lead:<id>` / `enrollment:<uuid>`, the reason
 * is the operator's own words, bounded by the schema, carried on the row and
 * NOT copied into the ledger payload (ids and codes only there).
 */

const ENTITY = 'growth_journey_execution_control' as const;
export const CONTROL_SET_EVENT = 'growth_journey.execution.control_set';
export const CONTROL_CLEARED_EVENT = 'growth_journey.execution.control_cleared';

export class ControlConflictError extends Error {
  readonly error_class = 'ConflictError';
  readonly status = 409;
  constructor(readonly scope_key: string) {
    super(`an active control already exists for scope ${scope_key}`);
    this.name = 'ControlConflictError';
  }
}

export class ControlValidationError extends Error {
  readonly error_class = 'ValidationError';
  readonly status = 400;
  constructor(readonly code: string, message: string, readonly detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ControlValidationError';
  }
}

export interface ControlView {
  id: string;
  tenant_id: string;
  kind: GrowthJourneyControlKind;
  scope_key: string;
  brand_id: string | null;
  program_id: string | null;
  channel: string | null;
  subject_ref: string | null;
  mode: GrowthJourneyControlMode;
  cohort_lead_ids: number[] | null;
  daily_limit: number | null;
  reason: string | null;
  set_by_admin_id: string | null;
  created_at: Date;
  cleared_at: Date | null;
  cleared_by_admin_id: string | null;
}

export interface ControlActor {
  /** The admin's id (`sub`), never the email. */
  id: string;
}

export interface SetPauseInput {
  tenantId: string;
  brandId?: string | null;
  programId?: string | null;
  channel?: string | null;
  subjectRef?: string | null;
  reason: string;
}

export interface SetRolloutInput {
  tenantId: string;
  brandId: string;
  programId: string;
  channel: string;
  mode: 'review' | 'limited';
  cohortLeadIds?: number[] | null;
  dailyLimit?: number | null;
  reason: string;
}

export type ClearResult =
  | { status: 'cleared'; control: ControlView }
  | { status: 'already_cleared'; control: ControlView }
  | { status: 'not_found' };

type Row = { get(k: string): unknown };
const field = <T,>(row: Row, k: string): T => row.get(k) as T;

/** The row, column by column, so a model instance and a plain object shape the same. */
export function controlView(row: Row): ControlView {
  return {
    id: String(field(row, 'id')),
    tenant_id: String(field(row, 'tenant_id')),
    kind: field<GrowthJourneyControlKind>(row, 'kind'),
    scope_key: String(field(row, 'scope_key')),
    brand_id: field<string | null>(row, 'brand_id') ?? null,
    program_id: field<string | null>(row, 'program_id') ?? null,
    channel: field<string | null>(row, 'channel') ?? null,
    subject_ref: field<string | null>(row, 'subject_ref') ?? null,
    mode: field<GrowthJourneyControlMode>(row, 'mode'),
    cohort_lead_ids: field<number[] | null>(row, 'cohort_lead_ids') ?? null,
    daily_limit: field<number | null>(row, 'daily_limit') ?? null,
    reason: field<string | null>(row, 'reason') ?? null,
    set_by_admin_id: field<string | null>(row, 'set_by_admin_id') ?? null,
    created_at: new Date(field<Date>(row, 'created_at')),
    cleared_at: field<Date | null>(row, 'cleared_at') ?? null,
    cleared_by_admin_id: field<string | null>(row, 'cleared_by_admin_id') ?? null,
  };
}

const isUniqueViolation = (err: unknown): boolean =>
  (err as { name?: string })?.name === 'SequelizeUniqueConstraintError' || (err as { parent?: { code?: string } })?.parent?.code === '23505';

/** One row, or the 409 the database's index answers with. */
async function insert(attrs: Record<string, unknown>, scopeKey: string): Promise<ControlView> {
  try {
    const row = await GrowthJourneyExecutionControl.create(attrs as never);
    return controlView(row as unknown as Row);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new ControlConflictError(scopeKey);
    throw err;
  }
}

/** Ids and codes only - the operator's reason stays on the row. */
const ledgerPayload = (v: ControlView): Record<string, unknown> => ({
  control_id: v.id, kind: v.kind, scope_key: v.scope_key, mode: v.mode, brand_id: v.brand_id, program_id: v.program_id, channel: v.channel,
  subject_ref: v.subject_ref, cohort_size: v.cohort_lead_ids?.length ?? null, daily_limit: v.daily_limit,
});

/** A pause: `off` for a brand, a programme, a channel or one subject - never all four wild. Throws `ScopeKeyError` (400) for that. */
export async function setPause(input: SetPauseInput, actor: ControlActor): Promise<ControlView> {
  const scopeKey = pauseScopeKey({ brandId: input.brandId, programId: input.programId, channel: input.channel, subjectRef: input.subjectRef });
  const view = await insert({
    tenant_id: input.tenantId, kind: 'pause', scope_key: scopeKey, mode: 'off',
    brand_id: input.brandId ?? null, program_id: input.programId ?? null, channel: input.channel ?? null, subject_ref: input.subjectRef ?? null,
    cohort_lead_ids: null, daily_limit: null, reason: input.reason, set_by_admin_id: actor.id, cleared_at: null, cleared_by_admin_id: null,
  }, scopeKey);
  await recordJourneyEvent(CONTROL_SET_EVENT, ENTITY, view.id, { tenant_id: view.tenant_id, brand_id: view.brand_id }, ledgerPayload(view), actor.id);
  return view;
}

/** A rollout: one brand x programme x channel raised to `review` or `limited` (a named cohort of existing leads, a daily limit). */
export async function setRollout(input: SetRolloutInput, actor: ControlActor): Promise<ControlView> {
  const scopeKey = rolloutScopeKey({ brandId: input.brandId, programId: input.programId, channel: input.channel });
  const program = await JourneyProgram.findByPk(input.programId, { attributes: ['id', 'brand_id', 'tenant_id'] });
  if (!program || String(program.brand_id) !== input.brandId || String(program.tenant_id) !== input.tenantId) {
    throw new ControlValidationError('program_not_in_brand', 'the programme is not this brand\'s', { program_id: input.programId, brand_id: input.brandId });
  }
  let cohort: number[] | null = null;
  let dailyLimit: number | null = null;
  if (input.mode === 'limited') {
    cohort = [...new Set(input.cohortLeadIds ?? [])];
    dailyLimit = input.dailyLimit ?? null;
    if (cohort.length === 0 || dailyLimit === null || dailyLimit <= 0) {
      throw new ControlValidationError('limited_needs_cohort_and_limit', 'a limited rollout needs a cohort and a daily limit');
    }
    const found = await Lead.findAll({ where: { id: { [Op.in]: cohort } }, attributes: ['id'] });
    const known = new Set((found as unknown as Row[]).map((r) => Number(r.get('id'))));
    const missing = cohort.filter((id) => !known.has(id));
    if (missing.length > 0) throw new ControlValidationError('cohort_lead_missing', 'every cohort lead id must exist', { missing });
  }
  const view = await insert({
    tenant_id: input.tenantId, kind: 'rollout', scope_key: scopeKey, mode: input.mode,
    brand_id: input.brandId, program_id: input.programId, channel: input.channel, subject_ref: null,
    cohort_lead_ids: cohort, daily_limit: dailyLimit, reason: input.reason, set_by_admin_id: actor.id, cleared_at: null, cleared_by_admin_id: null,
  }, scopeKey);
  await recordJourneyEvent(CONTROL_SET_EVENT, ENTITY, view.id, { tenant_id: view.tenant_id, brand_id: view.brand_id }, ledgerPayload(view), actor.id);
  return view;
}

/** The row by id, for the controller to authorise against before a clear. */
export async function findControl(id: string): Promise<ControlView | null> {
  const row = await GrowthJourneyExecutionControl.findByPk(id);
  return row ? controlView(row as unknown as Row) : null;
}

/**
 * Clear one control: `UPDATE ... WHERE id AND cleared_at IS NULL`, so a second
 * clear changes nothing and writes no second ledger row. The row is never deleted.
 */
export async function clearControl(id: string, actor: ControlActor, asOf: Date = new Date()): Promise<ClearResult> {
  const [count] = await GrowthJourneyExecutionControl.update(
    { cleared_at: asOf, cleared_by_admin_id: actor.id },
    { where: { id, cleared_at: null } },
  );
  const after = await findControl(id);
  if (!after) return { status: 'not_found' };
  if (count === 0) return { status: 'already_cleared', control: after };
  await recordJourneyEvent(CONTROL_CLEARED_EVENT, ENTITY, after.id, { tenant_id: after.tenant_id, brand_id: after.brand_id }, ledgerPayload(after), actor.id);
  return { status: 'cleared', control: after };
}

export interface ListControlsArgs {
  /** The caller's scope as a where fragment (`tenantScopeWhere`), plus any requested narrowing. */
  where: Record<string, unknown>;
  includeCleared: boolean;
  limit: number;
}

/** The controls in a scope, active first, newest first. */
export async function listControls(args: ListControlsArgs): Promise<ControlView[]> {
  const rows = await GrowthJourneyExecutionControl.findAll({
    where: { ...args.where, ...(args.includeCleared ? {} : { cleared_at: null }) },
    order: [['created_at', 'DESC']],
    limit: args.limit,
  });
  return (rows as unknown as Row[]).map(controlView);
}

export { ScopeKeyError };
