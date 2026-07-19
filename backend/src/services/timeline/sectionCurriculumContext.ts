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
 *  week-summary types (wrap-ups, weekly reflections) need it. `announcement` is
 *  the friendly week-opener that scans the section and reports what's ahead. */
export const SECTION_ROSTER_TYPES = new Set(['overview', 'announcement']);

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
  est_minutes: number;   // per-activity time: the card's estimated_time, or the type default
}

export interface SectionCurriculumContext {
  week: number;
  items: SectionCurriculumItem[];
  /** The formatted block injected into LLM prompts. */
  prompt_text: string;
}

/** Student-journey phase label per bucket, surfaced in the roster context so a
 *  week-summary generator can group the week by phase. */
const PHASE_LABEL: Record<string, string> = {
  pre_class: 'Prep', learn: 'Learn', practice: 'Practice', build: 'Build',
  reflect: 'Reflect', share: 'Share', advance: 'Advance',
};

/** Human duration: minutes under an hour, else hours to one decimal. */
function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.round((mins / 60) * 10) / 10;
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** Pure formatter — deterministic and unit-testable (mirrors buildBlueprintPromptText).
 *  Leads with the TOTAL count + total time, tags each item with its phase AND minutes,
 *  and lists per-phase time subtotals — so a week-summary card (announcement/overview)
 *  can show a real, curriculum-derived time budget (total at the top, per phase, per
 *  activity) and cover the WHOLE week grouped by phase instead of cherry-picking. */
export function buildSectionCurriculumText(week: number, items: SectionCurriculumItem[]): string {
  const total = items.reduce((s, it) => s + (it.est_minutes || 0), 0);
  const byPhase = new Map<string, number>();
  for (const it of items) {
    const p = PHASE_LABEL[it.bucket] || it.bucket;
    byPhase.set(p, (byPhase.get(p) || 0) + (it.est_minutes || 0));
  }
  const phaseTotals = Array.from(byPhase.entries()).map(([p, m]) => `${p} ${m} min`).join(' · ');
  const lines: string[] = [
    `THIS WEEK'S ACTIVITIES (Week ${week}) — ${items.length} items, about ${fmtDuration(total)} of work total (${total} min), in journey order (phase in brackets, minutes in parentheses):`,
    `Phase totals: ${phaseTotals}`,
    ...items.map((it, i) => `${i + 1}. [${PHASE_LABEL[it.bucket] || it.bucket}] ${it.label} (${it.est_minutes} min): ${it.title}`),
    'When you describe the week: put the TOTAL time in the overview at the top, each PHASE\'s total on its phase heading, and each ACTIVITY\'s minutes on its card — use these exact numbers, do not re-estimate. Cover ALL activities; do not invent or omit any.',
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
      est_minutes: (c as any).estimated_time ?? def?.est_minutes ?? 0,
    });
  }
  if (!items.length) return null;

  items.sort((a, b) => (BUCKET_ORDER[a.bucket] ?? 9) - (BUCKET_ORDER[b.bucket] ?? 9));
  return { week, items, prompt_text: buildSectionCurriculumText(week, items) };
}
