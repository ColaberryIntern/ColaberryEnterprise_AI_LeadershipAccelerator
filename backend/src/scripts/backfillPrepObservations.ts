/**
 * Career Prep v27, CP1.4: turn the scores the platform already holds into prep_observations, once.
 *
 *   node dist/scripts/backfillPrepObservations.js [--dry] [--enrollment <id>]
 *
 * Sources: intro-video coaching (hire_profile_intro), quiz attempts on mapped cards
 * (runtime_assessment_attempts x prep_skill_sources), scored weekly interviews (interview_sessions),
 * and case studies published on Hire (hireTalentIndex). Mapping rules: services/careerPrep/observationAdapters.ts.
 *
 * IDEMPOTENT: rows are keyed (source_ref, skill_key); a second run inserts 0. --dry reads and maps
 * but writes nothing, and prints the counts per source.
 * ROLLBACK: DELETE FROM prep_observations WHERE source_ref LIKE 'hire-intro:%' OR source_ref LIKE
 * 'assessment:%' OR source_ref LIKE 'interview-session:%' OR source_ref LIKE 'case-study:%';
 * (exactly what this script writes; session attempts use 'attempt:%' and are untouched).
 */
import { sequelize } from '../config/database';
import { loadHireIndex } from '../services/hire/hireTalentIndex';
import {
  fromPublishedCaseStudy, fromQuizAttempt, fromVideoCoaching, fromWeeklyInterview, type Mapped,
} from '../services/careerPrep/observationAdapters';
import { logSkipped, writeObservations } from '../services/careerPrep/observationWriter';

type Row = Record<string, unknown>;
const q = async (sql: string, replacements: Record<string, unknown> = {}): Promise<Row[]> => (await sequelize.query(sql, { replacements }))[0] as Row[];

export async function collect(only: string | null): Promise<Record<string, Mapped[]>> {
  const filter = (col: string) => (only ? `AND ${col} = :only` : '');
  const r = { only };
  const videos = await q(`SELECT enrollment_id, video_asset_id, updated_at, video_coaching FROM hire_profile_intro
    WHERE video_coaching IS NOT NULL ${filter('enrollment_id')}`, r);
  const mapping = await q(`SELECT source_key, skill_key FROM prep_skill_sources WHERE source_type = 'card'`);
  const skillsByCard = new Map<string, string[]>();
  for (const m of mapping) skillsByCard.set(String(m.source_key), [...(skillsByCard.get(String(m.source_key)) ?? []), String(m.skill_key)]);
  const quizzes = mapping.length ? await q(`SELECT id, enrollment_id, card_id, score, created_at FROM runtime_assessment_attempts
    WHERE kind = 'quiz' AND card_id::text IN (:cards) ${filter('enrollment_id')}`, { ...r, cards: [...skillsByCard.keys()] }) : [];
  const weekly = await q(`SELECT id, enrollment_id, total_score, updated_at FROM interview_sessions
    WHERE total_score IS NOT NULL ${filter('enrollment_id')}`, r);
  const hire = (await loadHireIndex(['public', 'unlisted'])).filter((e) => !only || e.page.enrollment_id === only);
  return {
    video: videos.map((v) => fromVideoCoaching({ enrollmentId: String(v.enrollment_id), assetId: (v.video_asset_id as string) ?? null, updatedAt: new Date(v.updated_at as string), coaching: v.video_coaching })),
    quiz: quizzes.map((a) => fromQuizAttempt({ id: String(a.id), enrollmentId: String(a.enrollment_id), cardId: String(a.card_id), score: a.score, createdAt: new Date(a.created_at as string) }, skillsByCard.get(String(a.card_id)) ?? [])),
    weekly: weekly.map((w) => fromWeeklyInterview({ id: String(w.id), enrollmentId: String(w.enrollment_id), totalScore: w.total_score === null ? null : Number(w.total_score), updatedAt: new Date(w.updated_at as string) })),
    project: hire.flatMap((e) => e.cases.map((c) => fromPublishedCaseStudy({ enrollmentId: e.page.enrollment_id, slug: c.slug, publishedAt: c.publishedAt }))),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--enrollment');
  const only = i >= 0 ? argv[i + 1] : null;
  const dry = argv.includes('--dry');
  const bySource = await collect(only);
  const report: Record<string, { rows: number; skipped: number; inserted: number }> = {};
  for (const [source, mapped] of Object.entries(bySource)) {
    const rows = mapped.flatMap((m) => m.rows);
    mapped.forEach((m) => { if (m.skipped) logSkipped(m.skipped); });
    report[source] = { rows: rows.length, skipped: mapped.filter((m) => m.skipped).length, inserted: dry ? 0 : await writeObservations(rows) };
  }
  console.log(JSON.stringify({ event: 'career_prep_backfill', dry, report }));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'career_prep_backfill', outcome: 'failure', error_class: 'UpstreamUnavailable', message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
