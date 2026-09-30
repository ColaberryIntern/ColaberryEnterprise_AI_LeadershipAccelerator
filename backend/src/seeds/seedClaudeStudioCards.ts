/**
 * Idempotent seed: ensure every week 0-12 carries exactly one `claude_studio`
 * card, populated with the hand-authored studio for that week.
 *
 * Idempotent by (program_id, week, type): an existing card is UPDATED in place
 * so re-runs never duplicate; a missing one is CREATED. Nothing else about the
 * week is touched. Uses the timeline admin create/update path so the card gets
 * its lane order and the week's estimated_hours rollup (blueprintRollup) for
 * free — the same path seedSkilljarCards uses.
 *
 * The content is rendered from `data/claudeStudios` through the shared format
 * module, so the cards and the LLM generation prompt cannot drift apart.
 *
 * Failure-first: the whole set is validated BEFORE the first write. A studio
 * missing a stage or a prompt aborts the run with a named week rather than
 * writing half a curriculum and stopping — a partially-seeded set is worse than
 * an unseeded one because it looks finished.
 *
 * Run (in-container after deploy):
 *   docker exec accelerator-backend node dist/seeds/seedClaudeStudioCards.js
 * Or locally: cd backend && npx ts-node src/seeds/seedClaudeStudioCards.ts
 *
 * Dry run (no writes, prints the plan):
 *   CLAUDE_STUDIO_DRY_RUN=1 node dist/seeds/seedClaudeStudioCards.js
 */
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import TimelineCard from '../models/TimelineCard';
import { createCard, updateCard } from '../services/timeline/timelineAdminService';
import { CLAUDE_STUDIOS, CANONICAL_PROGRAM_ID, CLAUDE_LAUNCH, ClaudeStudioWeek, STAGE_ORDER } from '../data/claudeStudios';
import { renderClaudeStudio, studioSummary, studioCardTitle } from './claudeStudioFormat';

export const CLAUDE_STUDIO_TYPE = 'claude_studio';

export interface ClaudeStudioSeedResult {
  created: number;
  updated: number;
  weeks: Array<{ week: number; action: 'created' | 'updated'; title: string; minutes: number }>;
}

/**
 * PURE — validate one studio against the content contract. Returns the list of
 * problems (empty when valid). Exported so the unit tests assert the same rules
 * the seed enforces, rather than a re-implementation of them.
 */
export function validateStudio(s: ClaudeStudioWeek): string[] {
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => { if (!cond) problems.push(msg); };

  need(Number.isInteger(s.week) && s.week >= 0 && s.week <= 12, 'week must be an integer 0-12');
  need(!!s.key && !!s.title && !!s.career_asset, 'key, title and career_asset are required');
  need(s.objectives.length >= 3 && s.objectives.length <= 5, `objectives must be 3-5 (got ${s.objectives.length})`);
  need(s.stages.length === 4, `must have exactly 4 stages (got ${s.stages.length})`);

  STAGE_ORDER.forEach((key, i) => {
    const stage = s.stages[i];
    need(!!stage && stage.key === key, `stage ${i + 1} must be "${key}"`);
    if (stage) {
      need(stage.steps.length >= 2 && stage.steps.length <= 4, `stage "${key}" must have 2-4 steps`);
      need(stage.minutes > 0, `stage "${key}" needs a positive minute estimate`);
    }
  });

  const starters = s.prompts.filter((p) => p.kind === 'starter');
  need(starters.length >= 1, 'needs at least one starter prompt');
  need(s.prompts.length >= 3, `needs at least 3 prompts (got ${s.prompts.length})`);
  s.prompts.forEach((p) => need(p.text.trim().length >= 120, `prompt "${p.label}" is too short to be useful`));

  need(s.trust_checkpoints.length === 3, `needs exactly 3 trust checkpoints (got ${s.trust_checkpoints.length})`);
  need(s.deliverables.length >= 3, 'needs at least 3 deliverables');
  need(s.reflection.checks.length >= 3, 'needs at least 3 reflection checks');
  need(s.reflection.free_response.trim().length > 40, 'free-response reflection prompt is too thin');
  need(s.rubric.length === 5, `rubric must cover all 5 dimensions (got ${s.rubric.length})`);
  need(s.project.sources.length >= 2, 'Project needs at least 2 approved sources');
  need(s.competencies.length >= 3, 'needs at least 3 competencies');

  // Certification timing (Part 3F): weeks 0-6 must never present cert prep as active.
  need(s.week >= 7 || !s.certification_active, `week ${s.week} must not have certification_active`);

  // No stub text anywhere. This is the check that stops a half-authored week
  // shipping as if it were finished.
  //
  // The markers are deliberately specific rather than single words: an earlier
  // version banned the bare word "placeholder" and failed week 5, whose
  // misconception list legitimately describes options analysis with "two real
  // options and a decoy". A lint that forces prose to be worse than it should be
  // is a bad lint, so these match authoring stubs, not vocabulary.
  const blob = JSON.stringify(s).toLowerCase();
  ['tbd', 'lorem ipsum', 'add prompt here', 'placeholder text', 'placeholder here',
    'coming soon', 'todo:', 'fixme', 'to be written', 'fill this in']
    .forEach((bad) => need(!blob.includes(bad), `contains stub text "${bad}"`));

  return problems;
}

/** Validate the whole set; throws with every problem listed rather than the first. */
export function validateAllStudios(studios: ClaudeStudioWeek[] = CLAUDE_STUDIOS): void {
  const all: string[] = [];
  studios.forEach((s) => validateStudio(s).forEach((p) => all.push(`week ${s.week} (${s.key}): ${p}`)));

  const weeks = studios.map((s) => s.week);
  if (new Set(weeks).size !== weeks.length) all.push('duplicate week numbers in the studio set');
  const keys = studios.map((s) => s.key);
  if (new Set(keys).size !== keys.length) all.push('duplicate studio keys in the studio set');

  if (all.length) throw new Error(`[claude-studio] content validation failed:\n  - ${all.join('\n  - ')}`);
}

export async function seedClaudeStudioCards(opts?: { programId?: string; dryRun?: boolean }): Promise<ClaudeStudioSeedResult> {
  const programId = opts?.programId || process.env.CLAUDE_STUDIO_PROGRAM_ID || CANONICAL_PROGRAM_ID;
  const dryRun = opts?.dryRun ?? process.env.CLAUDE_STUDIO_DRY_RUN === '1';

  // Validate everything before touching the database.
  validateAllStudios();

  console.log(`[claude-studio] program_id=${programId} — ensuring ${CLAUDE_STUDIOS.length} Claude Studio cards${dryRun ? ' (DRY RUN — no writes)' : ''}`);

  const result: ClaudeStudioSeedResult = { created: 0, updated: 0, weeks: [] };

  for (const studio of CLAUDE_STUDIOS) {
    const title = studioCardTitle(studio);
    const content = {
      title,
      summary: studioSummary(studio),
      body_html: renderClaudeStudio(studio, CLAUDE_LAUNCH),
      reflection: studio.reflection.free_response,
    };

    const existing = await TimelineCard.findOne({
      where: { program_id: programId, week: studio.week, type: CLAUDE_STUDIO_TYPE },
      order: [['updated_at', 'DESC']],
    });

    if (dryRun) {
      const action = existing ? 'updated' : 'created';
      result.weeks.push({ week: studio.week, action, title, minutes: studio.estimated_minutes });
      console.log(`  wk${studio.week}: would ${action === 'created' ? 'create' : 'update'} -> "${title}" (${studio.estimated_minutes}m, ${content.body_html.length} bytes)`);
      continue;
    }

    const payload = {
      title,
      subtitle: studio.career_asset,
      description: studio.intro,
      difficulty: 'core' as const,
      visibility: 'published' as const,
      estimated_time: studio.estimated_minutes,
      competencies: studio.competencies,
      content,
    };

    if (existing) {
      await updateCard(existing.id, payload);
      result.updated += 1;
      result.weeks.push({ week: studio.week, action: 'updated', title, minutes: studio.estimated_minutes });
      console.log(`  wk${studio.week}: updated -> "${title}" (${studio.estimated_minutes}m)`);
    } else {
      await createCard({ type: CLAUDE_STUDIO_TYPE, week: studio.week, program_id: programId, ...payload } as any);
      result.created += 1;
      result.weeks.push({ week: studio.week, action: 'created', title, minutes: studio.estimated_minutes });
      console.log(`  wk${studio.week}: created -> "${title}" (${studio.estimated_minutes}m)`);
    }
  }

  console.log(`[claude-studio] done — ${result.created} created, ${result.updated} updated (re-runs are idempotent).`);
  return result;
}

if (require.main === module) {
  connectDatabase()
    .then(() => seedClaudeStudioCards())
    .then((r) => {
      console.log(`[claude-studio] complete: created=${r.created}, updated=${r.updated}`);
      return sequelize.close();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[claude-studio] FATAL:', err.message || err);
      process.exit(1);
    });
}

export default seedClaudeStudioCards;
