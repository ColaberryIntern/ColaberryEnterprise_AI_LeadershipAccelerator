/**
 * serviceGapSnapshotText - what an INSIDE case study actually says, read from its latest snapshot. PURE.
 *
 * Why this exists: inside case studies keep their story in `case_study_snapshots.content` (identity, situation,
 * taxonomy, decisions, closing), not in `case_studies.canonical_summary`, which is empty on almost all of them. Without
 * this the detector saw only a title and abstained ("need more detail") on fully written, approved case studies.
 *
 * Mapped onto the same `analysis` shape the outside import uses, so retrieval, the prompt and the fingerprint treat
 * both kinds alike:
 *   summary       identity.standfirst + identity.summary
 *   problem       situation.narrative (first two paragraphs) + situation.goals
 *   approach      decisions (title: decision), delivered items, closing
 *   capabilities  taxonomy.capabilities        techStack  taxonomy.stack
 *   outcomes      none: inside snapshots state what is NOT measured, and goals are not outcomes, so nothing is
 *                 promoted to a claimed result.
 * Deliberately skipped: builder/contributors (people), provenance, verification ids, URLs, artifacts.
 * Every piece is clipped so one long section cannot crowd out the rest (the prompt input is capped at 12k chars).
 */
import type { CaseStudyEvidence } from './serviceGapTypes';

type Analysis = NonNullable<CaseStudyEvidence['analysis']>;
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const text = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, n) : null;
};
const texts = (v: unknown, max: number, n: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => text(x, n)).filter((x): x is string => !!x).slice(0, max);
const joined = (parts: Array<string | null>, n: number): string | null => {
  const s = parts.filter(Boolean).join(' ');
  return s ? s.slice(0, n) : null;
};

export function analysisFromSnapshot(content: unknown): Analysis | null {
  const c = obj(content);
  const identity = obj(c.identity);
  const situation = obj(c.situation);
  const taxonomy = obj(c.taxonomy);

  const summary = joined([text(identity.standfirst, 600), text(identity.summary, 900)], 1400);
  const goals = texts(situation.goals, 5, 200);
  const problem = joined([...texts(situation.narrative, 2, 700), goals.length ? `Goals: ${goals.join('; ')}.` : null], 2000);
  const decisions = (Array.isArray(c.decisions) ? c.decisions : []).slice(0, 5).map(obj)
    .map((d) => joined([text(d.title, 160) && `${text(d.title, 160)}:`, text(d.decision, 400)], 560))
    .filter((d): d is string => !!d);
  const delivered = texts(taxonomy.deliverables, 8, 160);
  const approach = joined([
    ...decisions,
    delivered.length ? `Delivered: ${delivered.join('; ')}.` : null,
    text(c.closing, 600),
  ], 3500);
  const capabilities = texts(taxonomy.capabilities, 10, 160);
  const techStack = texts(taxonomy.stack, 15, 60);

  if (!summary && !problem && !approach && !capabilities.length) return null;
  return { summary, problem, approach, outcomes: [], capabilities, keywords: [], techStack };
}
