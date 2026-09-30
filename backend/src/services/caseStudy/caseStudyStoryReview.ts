import type {
  CaseStudyDecision,
  CaseStudySnapshotContent,
  CaseStudySurfaceKey,
} from '../../types/caseStudy';
import { arr, projectContributors, text } from './caseStudyPublicSections';
import { projectBuilder, resolveSurfaceContent } from './caseStudySurfaceVariant';

/**
 * caseStudyStoryReview — the editorial read of one record on one surface,
 * as warnings and a small rubric. ADVISORY. It is not a publish rule and never
 * blocks: the publish gate decides what may go live; this says what a reader
 * will notice.
 *
 * WHY IT EXISTS. Ali's review of the CORA storytelling pilot (2026-09-17)
 * found the defects a gate cannot see: the builder introduced four times, the
 * decisions arriving after the evidence they explain, editorial bookkeeping
 * ("this revision adds what the first one could not") left in the narrative,
 * an em-dash in a published line, "n/a" in a metric note. Each of those is
 * now a warning with the path that carries it, so the next record is read the
 * same way the pilot was, before Ali reads it.
 *
 * WHAT IT DOES NOT DO. It never judges causation, a person's feelings or the
 * truth of a claim; those belong to the evidence rules and to a person. A
 * record with no consented author gets a note, never a warning: an honest
 * role-only story is a valid story.
 */

export type StoryReviewLevel = 'warning' | 'note';

export interface StoryReviewFinding {
  readonly level: StoryReviewLevel;
  readonly code: string;
  /** The content path the finding is about, or the section it concerns. */
  readonly path: string;
  readonly message: string;
}

/** One rubric dimension, 0 to 2, with the passage or gap it rests on. */
export interface StoryRubricScore {
  readonly dimension: StoryRubricDimension;
  readonly score: 0 | 1 | 2;
  readonly evidence: string;
  /** True when the machine could only look for structure; a person settles the score. */
  readonly editorial: boolean;
}

export type StoryRubricDimension =
  | 'identifiable_person_or_team'
  | 'concrete_stakes'
  | 'decision_progression'
  | 'honest_complication'
  | 'supported_outcome'
  | 'audience_relevance';

export interface StoryReview {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly findings: readonly StoryReviewFinding[];
  readonly rubric: readonly StoryRubricScore[];
}

/** Phrases that belong in a review note, never in the story. */
export const BOOKKEEPING_PHRASES: readonly string[] = [
  'this revision',
  'first revision',
  'review notes',
  'candidates from the brief',
  'could not be built from the repository',
];

const DASH = /[–—]/;
const NA = /\bn\/a\b/i;
const COMPLICATION = /\b(unresolved|not pursued|limit|limitation|drift|caveat|remain|except|still|did not|does not|cannot)\b/i;
const IMPACT = /\b(reduced|saved|increased|cut|improved|faster|\d+(?:\.\d+)?%)\b/i;

function walk(value: unknown, path: string, out: { path: string; value: string }[]): void {
  if (typeof value === 'string') { out.push({ path, value }); return; }
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`, out)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k, out);
  }
}

/** Every string a reader could see, from the parts of the content the story is made of. */
function readerStrings(content: CaseStudySnapshotContent, standfirst: string | null, decisions: readonly CaseStudyDecision[], closing: string | null): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  if (standfirst) out.push({ path: 'standfirst', value: standfirst });
  walk(content.situation?.narrative, 'situation.narrative', out);
  walk(content.situation?.goals, 'situation.goals', out);
  walk(content.situation?.constraints, 'situation.constraints', out);
  walk(content.measurement?.narrative, 'measurement.narrative', out);
  arr(content.measurement?.metrics).forEach((m, i) => {
    walk(m?.measurement?.baseline, `measurement.metrics[${i}].measurement.baseline`, out);
    walk(m?.measurement?.sample, `measurement.metrics[${i}].measurement.sample`, out);
  });
  arr(content.heroMetrics).forEach((m, i) => {
    walk(m?.measurement?.baseline, `heroMetrics[${i}].measurement.baseline`, out);
    walk(m?.measurement?.sample, `heroMetrics[${i}].measurement.sample`, out);
  });
  walk(content.architecture?.narrative, 'architecture.narrative', out);
  decisions.forEach((d, i) => walk({ title: d.title, problem: d.problem, decision: d.decision, evidence: d.evidence, consequence: d.consequence, stage: d.stage, figure: d.figure }, `decisions[${i}]`, out));
  if (closing) out.push({ path: 'closing', value: closing });
  if (content.builder) walk({ intro: content.builder.intro, contribution: content.builder.contribution, skills: content.builder.skills }, 'builder', out);
  return out;
}

export function reviewCaseStudyStory(
  content: CaseStudySnapshotContent,
  surfaceKey: CaseStudySurfaceKey,
): StoryReview {
  const resolved = resolveSurfaceContent(content, surfaceKey);
  const c = resolved.content;
  const people = projectContributors(c);
  const builder = projectBuilder(resolved.builder, people.contributors);
  const decisions = resolved.decisions;
  const closing = resolved.closing;
  const standfirst = resolved.standfirst ?? (text(c.identity?.standfirst) || null);
  const findings: StoryReviewFinding[] = [];
  const add = (level: StoryReviewLevel, code: string, path: string, message: string): void => {
    findings.push({ level, code, path, message });
  };

  // The person.
  if (!builder) {
    add('warning', 'story_no_builder', 'builder', 'No builder card: the reader meets a project, not a person or a team. Author a profile (role title and repository-supported contribution at least).');
  } else if (!builder.name) {
    add('note', 'story_biography_unavailable', 'builder', 'The builder card credits the role only: no consented name, so no biography. Valid as it stands; record the gap in the handoff.');
  }

  // The decisions.
  if (decisions.length === 0) {
    add('warning', 'story_no_decisions', 'decisions', 'No decision cards: the story has no choices with consequences.');
  }
  decisions.forEach((d, i) => {
    if (!text(d.stage)) add('warning', 'story_decision_unpinned', `decisions[${i}].stage`, `"${text(d.title)}" is not pinned to a step of the drawing.`);
    if (!text(d.figure)) add('note', 'story_decision_no_figure', `decisions[${i}].figure`, `"${text(d.title)}" closes on no figure. Right for a demonstration; for a measured record, close on a number that is on the record.`);
  });

  // The closing.
  if (!closing) add('warning', 'story_no_closing', 'closing', 'No closing paragraph: the page ends on its last band instead of on what the work shows.');

  // The words.
  const strings = readerStrings(c, standfirst, decisions, closing);
  for (const s of strings) {
    const lower = s.value.toLowerCase();
    const phrase = BOOKKEEPING_PHRASES.find((p) => lower.includes(p));
    if (phrase) add('warning', 'story_bookkeeping', s.path, `Editorial bookkeeping in the story: "${phrase}". Keep it in the review notes.`);
    if (DASH.test(s.value)) add('warning', 'story_dash', s.path, 'An em-dash or en-dash in published copy. Rewrite with a comma, a colon or a full stop.');
    if ((s.path.startsWith('measurement.metrics') || s.path.startsWith('heroMetrics')) && NA.test(s.value)) add('warning', 'story_na_note', s.path, '"n/a" in a metric note. Say what is true instead, or leave the note out.');
  }

  // One introduction. The progression belongs to the builder card; the
  // standfirst may name it once; the situation must open on the problem.
  // The current role title is a role, not a career step: saying it again is not a repeat.
  const progression = builder ? builder.progression.filter((p) => p !== builder.roleTitle).map((p) => p.toLowerCase()).filter((p) => p.length > 3) : [];
  const first = text(arr(c.situation?.narrative)[0]);
  if (builder?.name && first) {
    const opensOnPerson = first.startsWith(builder.name) && progression.some((p) => first.toLowerCase().includes(p));
    if (opensOnPerson) add('warning', 'story_situation_opens_on_biography', 'situation.narrative[0]', 'The situation opens on the builder\'s career progression. Introduce the person once (standfirst) and let the situation start with the problem.');
  }
  if (progression.length > 0) {
    const repeats = strings.filter((s) => !s.path.startsWith('builder') && s.path !== 'standfirst' && progression.some((p) => s.value.toLowerCase().includes(p)));
    for (const r of repeats) add('warning', 'story_progression_repeated', r.path, 'The builder\'s career progression is repeated outside the builder card and the standfirst.');
  }

  return { surfaceKey, findings, rubric: rubric(c, surfaceKey, builder, decisions, closing, people.contributors.length, strings) };
}

function rubric(
  c: CaseStudySnapshotContent,
  surfaceKey: CaseStudySurfaceKey,
  builder: ReturnType<typeof projectBuilder>,
  decisions: readonly CaseStudyDecision[],
  closing: string | null,
  contributorCount: number,
  strings: readonly { path: string; value: string }[],
): StoryRubricScore[] {
  const metrics = arr(c.measurement?.metrics);
  const verified = metrics.filter((m) => m?.publishable !== false && text(m?.valueDisplay)).length;
  const situation = arr(c.situation?.narrative).join(' ');
  const pinned = decisions.filter((d) => text(d.stage)).length;
  const complication = [...decisions.map((d) => d.consequence), closing ?? '', ...metrics.flatMap((m) => arr(m?.measurement?.limitations))].some((t) => COMPLICATION.test(text(t)));
  const claimsImpact = strings.some((s) => IMPACT.test(s.value));
  const hasVariant = Boolean(c.surfaceVariants && (c.surfaceVariants as Record<string, unknown>)[surfaceKey]);
  return [
    {
      dimension: 'identifiable_person_or_team',
      score: builder?.name ? 2 : builder || contributorCount > 0 ? 1 : 0,
      evidence: builder?.name ? `builder.name = ${builder.name}` : builder ? 'builder card, role only' : contributorCount > 0 ? 'contributors only, no builder card' : 'no builder, no contributors',
      editorial: false,
    },
    {
      dimension: 'concrete_stakes',
      score: situation.length > 0 ? 1 : 0,
      evidence: situation.length > 0 ? `situation.narrative[0]: "${situation.slice(0, 80)}..."` : 'no situation narrative',
      editorial: true,
    },
    {
      dimension: 'decision_progression',
      score: decisions.length >= 3 && pinned === decisions.length ? 2 : decisions.length > 0 ? 1 : 0,
      evidence: `${decisions.length} decision card(s), ${pinned} pinned to a step`,
      editorial: false,
    },
    {
      dimension: 'honest_complication',
      score: complication ? 2 : decisions.length > 0 ? 1 : 0,
      evidence: complication ? 'a consequence, the closing or a metric limitation names a limit' : 'no limit named in the consequences, the closing or the metric limitations',
      editorial: true,
    },
    {
      dimension: 'supported_outcome',
      score: verified > 0 ? 2 : claimsImpact ? 0 : 1,
      evidence: verified > 0 ? `${verified} publishable metric(s)` : claimsImpact ? 'impact wording with no metric on the record' : 'no metrics and no impact wording: a demonstration told as one',
      editorial: verified === 0,
    },
    {
      dimension: 'audience_relevance',
      score: hasVariant ? 2 : 1,
      evidence: hasVariant ? `surfaceVariants.${surfaceKey} present` : `no variant for ${surfaceKey}: the canonical words serve every audience`,
      editorial: true,
    },
  ];
}

/** Plain-text rendering for the script and the handoff. */
export function formatStoryReview(review: StoryReview): string {
  const lines: string[] = [`Story review, surface ${review.surfaceKey}`];
  if (review.findings.length === 0) lines.push('  no findings');
  for (const f of review.findings) lines.push(`  ${f.level.toUpperCase().padEnd(7)} ${f.code} @ ${f.path}: ${f.message}`);
  lines.push('  rubric (0 to 2; "editorial" means a person settles it):');
  for (const r of review.rubric) lines.push(`    ${r.score} ${r.dimension}${r.editorial ? ' (editorial)' : ''}: ${r.evidence}`);
  return lines.join('\n');
}
