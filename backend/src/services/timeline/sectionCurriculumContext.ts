/**
 * sectionCurriculumContext — the week's ACTUAL activity roster as AI context.
 *
 * Where blueprintContext tells a generator what the week is ABOUT (topics,
 * objectives), this tells it what the student will actually DO — the published
 * TimelineCards placed in that (program, week). Injected ONLY for types that
 * summarize the week (SECTION_ROSTER_TYPES — today just `overview`) so a lab or
 * video generation never starts narrating its sibling cards.
 *
 * Failure mode: any lookup problem returns null and the generation proceeds on
 * blueprint context alone (same graceful-degrade contract as blueprintContext).
 */
import TimelineCard from '../../models/TimelineCard';
import { resolve } from './typeRegistry';

/** Types whose generation receives the week's activity roster. Extend as other
 *  week-summary types (wrap-ups, weekly reflections) need it. */
export const SECTION_ROSTER_TYPES = new Set(['overview']);

/** Meta/system cards excluded from the roster — they are not "things you'll do". */
const EXCLUDED_TYPES = new Set([
  'overview', 'announcement', 'event',
  'milestone', 'achievement', 'daily_streak', 'completion_badge',
]);

/** Student-journey order for the roster (mirrors the timeline buckets). */
const BUCKET_ORDER: Record<string, number> = {
  pre_class: 0, learn: 1, practice: 2, build: 3, reflect: 4, share: 5, advance: 6,
};

export interface SectionCurriculumItem {
  type: string;
  label: string;   // student-facing type label, e.g. "Prompt Lab"
  title: string;   // the card's own title
  bucket: string;
}

export interface SectionCurriculumContext {
  week: number;
  items: SectionCurriculumItem[];
  /** The formatted block injected into LLM prompts. */
  prompt_text: string;
}

/** Pure formatter — deterministic and unit-testable (mirrors buildBlueprintPromptText). */
export function buildSectionCurriculumText(week: number, items: SectionCurriculumItem[]): string {
  const lines: string[] = [
    `THIS WEEK'S ACTIVITIES — the concrete curriculum the student will work through in Week ${week}:`,
    ...items.map((it, i) => `${i + 1}. ${it.label}: ${it.title}`),
    'When describing what this week covers, describe what the student will actually DO in these activities — name the videos, labs, courses, and builds above rather than inventing others.',
  ];
  return lines.join('\n');
}

/**
 * The week's published activity roster for (program, week), or null when there
 * is none (unpublished week, no program context). `excludeCardId` lets the real
 * card-generation path drop the card being generated from its own roster.
 */
export async function getSectionCurriculumContext(
  programId?: string | null,
  week?: number | null,
  excludeCardId?: string | null,
): Promise<SectionCurriculumContext | null> {
  if (!programId || week == null) return null;
  let cards: TimelineCard[];
  try {
    cards = await TimelineCard.findAll({
      where: { program_id: programId, week, visibility: 'published' },
      order: [['priority', 'ASC'], ['created_at', 'ASC']],
    });
  } catch {
    return null; // graceful degrade — generation proceeds on blueprint context alone
  }

  const seen = new Set<string>();
  const items: SectionCurriculumItem[] = [];
  for (const c of cards) {
    if (excludeCardId && c.id === excludeCardId) continue;
    if (EXCLUDED_TYPES.has(c.type)) continue;
    const key = `${c.type}|${(c.title || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue; // collapse duplicate seeds of the same activity
    seen.add(key);
    const def = resolve(c.type);
    items.push({
      type: c.type,
      label: def?.student_label || c.type.replace(/_/g, ' '),
      title: c.title,
      bucket: c.bucket,
    });
  }
  if (!items.length) return null;

  items.sort((a, b) => (BUCKET_ORDER[a.bucket] ?? 9) - (BUCKET_ORDER[b.bucket] ?? 9));
  return { week, items, prompt_text: buildSectionCurriculumText(week, items) };
}
