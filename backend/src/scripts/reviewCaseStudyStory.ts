/**
 * reviewCaseStudyStory — print the editorial story review of one record on
 * one surface (or every publishable surface). Advisory; exits 0 always.
 *
 *   npx ts-node -T src/scripts/reviewCaseStudyStory.ts <slug-or-id> [surface]
 *   node dist/scripts/reviewCaseStudyStory.js <slug-or-id> [surface]   (inside the container)
 *   ... --file <content.json> [surface]   (a composed content file, no database)
 *
 * Reads the latest APPROVED snapshot of the record, which is what a publish
 * would ship, and runs `reviewCaseStudyStory` over it. Nothing is written.
 */
import * as fs from 'fs';
import { PUBLISHABLE_SURFACE_KEYS } from '../types/caseStudy';
import type { CaseStudySnapshotContent, CaseStudySurfaceKey } from '../types/caseStudy';
import { formatStoryReview, reviewCaseStudyStory } from '../services/caseStudy/caseStudyStoryReview';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const surfaceArg = args.find((a, i) => i > 0 && !a.startsWith('--') && args[i - 1] !== '--file' && (PUBLISHABLE_SURFACE_KEYS as readonly string[]).includes(a)) as CaseStudySurfaceKey | undefined;
const surfaces: readonly CaseStudySurfaceKey[] = surfaceArg ? [surfaceArg] : PUBLISHABLE_SURFACE_KEYS;

function report(content: CaseStudySnapshotContent, label: string): void {
  console.log(`# ${label}`);
  for (const surfaceKey of surfaces) console.log(formatStoryReview(reviewCaseStudyStory(content, surfaceKey)));
}

async function main(): Promise<void> {
  if (fileIndex >= 0) {
    const file = args[fileIndex + 1];
    if (!file) throw new Error('--file needs a path');
    report(JSON.parse(fs.readFileSync(file, 'utf8')) as CaseStudySnapshotContent, file);
    return;
  }
  const target = args[0];
  if (!target || target.startsWith('--')) throw new Error('usage: reviewCaseStudyStory <slug-or-id> [surface] | --file <content.json> [surface]');
  // Loaded here, not at module top, so `--file` never opens a database connection.
  const { sequelize } = await import('../config/database');
  const [rows] = await sequelize.query(
    `select cs.slug, s.version, s.content
       from case_studies cs
       join case_study_snapshots s on s.case_study_id = cs.id
      where (cs.slug = :target or cs.id::text = :target) and s.status = 'approved'
      order by s.version desc limit 1`,
    { replacements: { target } },
  );
  const row = (rows as { slug: string; version: number; content: CaseStudySnapshotContent }[])[0];
  if (!row) throw new Error(`no approved snapshot for ${target}`);
  report(row.content, `${row.slug} v${row.version} (approved)`);
  await sequelize.close();
}

main().catch((e: unknown) => {
  console.error('review failed:', e instanceof Error ? e.message : String(e));
  process.exit(0);
});
