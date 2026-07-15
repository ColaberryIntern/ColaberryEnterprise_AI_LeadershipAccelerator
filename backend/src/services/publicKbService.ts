/**
 * Public-facing KB projection — Phase 2 (BC #10036783688).
 *
 * Serves a public-safe subset of cora_kb_entries in the same shape as the
 * static frontend/public/knowledge/sales/kb-data.js file it's meant to
 * progressively replace: { categories: [{key,title}], qa: [{category,q,a,...}] }.
 * Never exposes internal routing fields (primary_person_id, escalation_logic,
 * team_person_ids, notes) — this is a public, unauthenticated endpoint.
 */
import { getActiveCohort, getCourseBySlug, listEntries, resolveMergeTags, hasUnresolvedTags } from './kbService';

const PUBLIC_KB_COURSE_SLUG = process.env.PUBLIC_KB_COURSE_SLUG || 'ai-architect';

export interface PublicKbCategory {
  key: string;
  title: string;
}

export interface PublicKbQaEntry {
  category: string;
  q: string;
  a: string;
  detail: string;
  tags: string[];
  confidence: 'grounded' | 'drafted-verify';
}

export interface PublicKbPayload {
  categories: PublicKbCategory[];
  qa: PublicKbQaEntry[];
}

function slugifyCategory(mainCategory: string): string {
  return mainCategory
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getPublicSalesKb(): Promise<PublicKbPayload> {
  const course = await getCourseBySlug(PUBLIC_KB_COURSE_SLUG);
  if (!course) return { categories: [], qa: [] };

  const active = await getActiveCohort(course.id);
  const entries = await listEntries({ courseId: course.id, activeOnly: true });

  const categoryMap = new Map<string, string>(); // key -> title, first-seen order
  const qa: PublicKbQaEntry[] = [];

  for (const entry of entries) {
    const key = slugifyCategory(entry.main_category);
    if (!categoryMap.has(key)) categoryMap.set(key, entry.main_category);

    const resolved = active
      ? resolveMergeTags(entry.answer_template, active.cohort, active.course)
      : entry.answer_template;

    qa.push({
      category: key,
      q: entry.question_pattern,
      a: resolved,
      detail: '',
      tags: (entry.keywords ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      confidence: hasUnresolvedTags(resolved) ? 'drafted-verify' : 'grounded',
    });
  }

  const categories: PublicKbCategory[] = Array.from(categoryMap, ([key, title]) => ({ key, title }));

  return { categories, qa };
}
