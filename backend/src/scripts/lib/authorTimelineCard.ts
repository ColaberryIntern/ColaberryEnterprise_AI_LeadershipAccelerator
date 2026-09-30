/**
 * authorTimelineCard — shared, idempotent "hand-author a curriculum card" helper.
 *
 * Every hand-authored card in this repo follows the same shape: find the card by
 * (program, week, type), overwrite only the content keys we own, merge any extra
 * top-level metadata, and set `locked: true` so `ensureFreshContent` never
 * regenerates over the authored copy. This module is that pattern, once.
 *
 * Idempotency is real, not nominal: if every key we would write already matches and
 * the card is locked, NOTHING is written — so `content_at` does not churn and the
 * script is safe to run on every deploy. Callers get back which of those happened.
 *
 * Content keys the caller does not name are PRESERVED (questions, completion,
 * github_task, evaluation_criteria, …) — authoring the copy must never silently
 * drop a card's assessment wiring.
 */
import TimelineCard from '../../models/TimelineCard';

export interface AuthorCardSpec {
  week: number;
  /** Curriculum type slug, e.g. `warmup`, `prompt_lab`, `anthropic_skills_jar`. */
  type: string;
  /** Content keys to write. Absent keys are preserved from the existing card. */
  content: Record<string, unknown>;
  /** Extra top-level metadata to merge (e.g. `course` on a skills-jar card). */
  meta?: Record<string, unknown>;
  /** Card title, when the authored copy should also rename the card. */
  title?: string;
  /** Human label for log lines. */
  label: string;
}

export interface AuthorCardResult {
  label: string;
  card_id: string | null;
  changed: boolean;
  reason: 'applied' | 'already-current' | 'not-found' | 'dry-run';
}

/** Recursively sort object keys so two structurally-equal values stringify alike. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);   // array ORDER is meaningful — preserved
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    return Object.keys(src).sort().reduce((acc: Record<string, unknown>, k) => {
      acc[k] = canon(src[k]);
      return acc;
    }, {});
  }
  return v;
}

/**
 * Structural equality for authored literals (no cycles, no dates).
 *
 * Key order must be normalised first: Postgres `jsonb` does NOT preserve object key
 * order, so an authored nested object (e.g. a skills-jar `course`) comes back from
 * the DB reordered and a naive JSON.stringify comparison reports "changed" on a card
 * that is byte-identical in content. That made the card rewrite itself — and churn
 * content_at — on every single run. Caught by running the seeder twice.
 */
export function same(a: unknown, b: unknown): boolean {   // exported for tests
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export async function authorCard(
  spec: AuthorCardSpec,
  programId: string,
  dryRun = false,
): Promise<AuthorCardResult> {
  const cards = await TimelineCard.findAll({
    where: { program_id: programId, week: spec.week, type: spec.type },
    order: [['order', 'ASC'], ['created_at', 'ASC']],
  });

  if (!cards.length) {
    console.error(`[authorCard] ${spec.label}: no ${spec.type} card on program ${programId} week ${spec.week} — nothing applied`);
    return { label: spec.label, card_id: null, changed: false, reason: 'not-found' };
  }
  if (cards.length > 1) {
    // Duplicate cards are a known historical hazard on the canonical program. Author
    // the first and NAME the rest so an operator can decide, rather than silently
    // picking one and leaving a stale twin live.
    console.warn(`[authorCard] ${spec.label}: ${cards.length} ${spec.type} cards on week ${spec.week} — authoring the first, leaving untouched: ${cards.slice(1).map((c) => c.id).join(', ')}`);
  }

  const card: any = cards[0];
  const meta: Record<string, unknown> = card.metadata && typeof card.metadata === 'object'
    ? { ...(card.metadata as Record<string, unknown>) }
    : {};
  const prior = (meta.content && typeof meta.content === 'object' ? meta.content : {}) as Record<string, unknown>;

  const contentCurrent = Object.keys(spec.content).every((k) => same(prior[k], spec.content[k]));
  const metaCurrent = Object.keys(spec.meta || {}).every((k) => same(meta[k], (spec.meta as any)[k]));
  const titleCurrent = !spec.title || card.title === spec.title;
  if (contentCurrent && metaCurrent && titleCurrent && meta.locked === true) {
    console.log(`[authorCard] ${spec.label}: card ${card.id} already current + locked — no write`);
    return { label: spec.label, card_id: card.id, changed: false, reason: 'already-current' };
  }

  if (dryRun) {
    console.log(`[authorCard] ${spec.label}: DRY RUN — would author card ${card.id} (content keys: ${Object.keys(spec.content).join(', ')}${spec.title ? `; title -> "${spec.title}"` : ''})`);
    return { label: spec.label, card_id: card.id, changed: false, reason: 'dry-run' };
  }

  const update: Record<string, unknown> = {
    metadata: {
      ...meta,
      ...(spec.meta || {}),
      content: { ...prior, ...spec.content },
      content_at: new Date().toISOString(),
      locked: true,
      authored: true,
    },
  };
  if (spec.title) update.title = spec.title;
  await card.update(update as any);

  console.log(`[authorCard] ${spec.label}: authored + locked card ${card.id}`);
  return { label: spec.label, card_id: card.id, changed: true, reason: 'applied' };
}

export default authorCard;
