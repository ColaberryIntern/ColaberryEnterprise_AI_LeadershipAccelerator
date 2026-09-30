/**
 * capeCurriculumSkillMapService — the CAPE Phase 3 resolution hierarchy (design doc §7):
 *
 *   1. card override   — exact learning object
 *   2. week/blueprint mapping — curriculum intent for that week
 *   3. curriculum type default — general behavior
 *   4. AI-suggested draft — authoring aid only, a human approves it before it can resolve
 *
 * `resolveSkillMapping()` is the ONLY read path anything in this repo should use to
 * answer "what does this card/type/week currently map to" — it never returns an
 * unapproved AI-suggested draft (source:'ai_suggested', approved:false), matching §7's
 * "AI-suggested draft — only as an authoring aid; a human approves it."
 *
 * `createOrVersionMapping()` is the ONLY write path onto `curriculum_skill_maps` —
 * editing a mapping NEVER mutates an existing row in place; it flips the current row's
 * `is_current` to false and inserts a new row at `version+1`. The old row is left
 * untouched (fetchable via `is_current=false`) so evidence already stamped under it is
 * never silently rewritten (design doc §7, §13 "mapping edits create a new mapping
 * version; they never double-replay historical credit").
 */
import CurriculumSkillMap, { LearningPlacementContract } from '../../models/CurriculumSkillMap';
import TimelineCard from '../../models/TimelineCard';
import { curriculumSkillMapCreateSchema, CurriculumSkillMapCreateInput } from '../../schemas/capeSchema';

export class CapeCurriculumSkillMapValidationError extends Error {
  error_class = 'ValidationError';
  status = 400;
  constructor(message: string) { super(message); this.name = 'CapeCurriculumSkillMapValidationError'; }
}

export type ResolvedMappingSource = 'card_override' | 'week_blueprint' | 'type_default' | 'none';

export interface ResolvedMapping {
  contract: LearningPlacementContract;
  source: ResolvedMappingSource;
  map_id: string | null;
  version: number | null;
}

const EMPTY_CONTRACT: LearningPlacementContract = {
  skill_impacts: [],
  prerequisite_skills: [],
  recommended_range: { min: 0, max: 0 },
  freshness_days: null,
  reviewable: true,
};

function toContract(row: CurriculumSkillMap): LearningPlacementContract {
  return {
    skill_impacts: row.skill_impacts,
    prerequisite_skills: row.prerequisite_skills as any,
    recommended_range: row.recommended_range as any,
    freshness_days: row.freshness_days ?? null,
    reviewable: row.reviewable,
  };
}

/**
 * Resolve card -> week -> type, in that strict order. Only `approved:true` rows are
 * ever considered — an AI-suggested draft (`approved:false`) never resolves on its
 * own; a human approving it creates a NEW `source:'human', approved:true` row, which
 * is what then resolves. Returns `source:'none'` (never throws) if nothing resolves —
 * callers (the publish-time stamp, the evidence bridge) treat that as "no credit,"
 * not an error, since a not-yet-seeded type/week is a legitimate transient state.
 */
export async function resolveSkillMapping(params: {
  cardId?: string | null;
  typeSlug: string;
  weekNumber?: number | null;
}): Promise<ResolvedMapping> {
  const { cardId, typeSlug, weekNumber } = params;

  if (cardId) {
    const cardRow = await CurriculumSkillMap.findOne({
      where: { scope_type: 'card', card_id: cardId, is_current: true, approved: true },
    });
    if (cardRow) return { contract: toContract(cardRow), source: 'card_override', map_id: cardRow.id, version: cardRow.version };
  }

  if (weekNumber !== undefined && weekNumber !== null) {
    const weekRow = await CurriculumSkillMap.findOne({
      where: { scope_type: 'week', week_number: weekNumber, is_current: true, approved: true },
    });
    if (weekRow) return { contract: toContract(weekRow), source: 'week_blueprint', map_id: weekRow.id, version: weekRow.version };
  }

  const typeRow = await CurriculumSkillMap.findOne({
    where: { scope_type: 'type', type_slug: typeSlug, is_current: true, approved: true },
  });
  if (typeRow) return { contract: toContract(typeRow), source: 'type_default', map_id: typeRow.id, version: typeRow.version };

  return { contract: EMPTY_CONTRACT, source: 'none', map_id: null, version: null };
}

/**
 * Create the first version of a scope-key mapping, or version an existing one. Never
 * UPDATEs a row's skill_impacts/etc in place — always an insert. Validates via Zod
 * before touching the DB (backend/CLAUDE.md: reject malformed input before it reaches
 * a service).
 */
export async function createOrVersionMapping(input: CurriculumSkillMapCreateInput): Promise<CurriculumSkillMap> {
  const parsed = curriculumSkillMapCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new CapeCurriculumSkillMapValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const v = parsed.data;

  const scopeWhere =
    v.scope_type === 'type' ? { scope_type: 'type' as const, type_slug: v.type_slug } :
    v.scope_type === 'week' ? { scope_type: 'week' as const, week_number: v.week_number } :
    { scope_type: 'card' as const, card_id: v.card_id };

  const existing = await CurriculumSkillMap.findOne({ where: { ...scopeWhere, is_current: true } });
  if (existing) {
    await existing.update({ is_current: false });
  }

  const created = await CurriculumSkillMap.create({
    scope_type: v.scope_type,
    type_slug: v.type_slug ?? null,
    week_number: v.week_number ?? null,
    card_id: v.card_id ?? null,
    skill_impacts: v.skill_impacts,
    prerequisite_skills: v.prerequisite_skills,
    recommended_range: v.recommended_range,
    freshness_days: v.freshness_days ?? null,
    reviewable: v.reviewable,
    source: v.source,
    approved: v.source === 'ai_suggested' ? false : true,
    version: existing ? existing.version + 1 : 1,
    is_current: true,
    created_by: v.created_by ?? null,
  } as any);

  return created;
}

export class CapeCurriculumSkillMapNotFoundError extends Error {
  error_class = 'NotFoundError';
  status = 404;
  constructor(message: string) { super(message); this.name = 'CapeCurriculumSkillMapNotFoundError'; }
}

/**
 * Look up a real card's type + week and resolve its mapping through the full
 * hierarchy (card override -> week -> type). The single function admin endpoints
 * (T008) and the publish-time stamp (T009) both call, so "what does this card
 * currently resolve to" always answers identically everywhere it's asked.
 */
export async function resolveMappingForCard(cardId: string): Promise<ResolvedMapping> {
  const card = await TimelineCard.findByPk(cardId, { attributes: ['id', 'type', 'week'] });
  if (!card) {
    throw new CapeCurriculumSkillMapNotFoundError(`Timeline card "${cardId}" not found`);
  }
  return resolveSkillMapping({ cardId: card.id, typeSlug: card.type, weekNumber: card.week });
}

/** Throws CapeCurriculumSkillMapNotFoundError (404-shaped) if the card doesn't exist.
 * Used before a card-scoped write so a PUT against an unknown cardId fails clean
 * rather than surfacing a raw FK-constraint DB error. */
export async function assertCardExists(cardId: string): Promise<void> {
  const card = await TimelineCard.findByPk(cardId, { attributes: ['id'] });
  if (!card) {
    throw new CapeCurriculumSkillMapNotFoundError(`Timeline card "${cardId}" not found`);
  }
}

/** All versions (current + historical) for a scope key — used by admin history views. */
export async function getMappingHistory(scopeType: 'type' | 'week' | 'card', key: string | number): Promise<CurriculumSkillMap[]> {
  const where: any = { scope_type: scopeType };
  if (scopeType === 'type') where.type_slug = key;
  else if (scopeType === 'week') where.week_number = key;
  else where.card_id = key;
  return CurriculumSkillMap.findAll({ where, order: [['version', 'ASC']] });
}

/** Unapproved AI-suggested drafts awaiting human review — never returned by resolveSkillMapping. */
export async function listPendingAiDrafts(): Promise<CurriculumSkillMap[]> {
  return CurriculumSkillMap.findAll({
    where: { source: 'ai_suggested', approved: false, is_current: true },
    order: [['created_at', 'DESC']],
  });
}
