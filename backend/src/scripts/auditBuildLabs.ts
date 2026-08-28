/**
 * auditBuildLabs — run the build-lab contract against the real curriculum.
 *
 * The labs live in the database as `authored` cards, so nothing in CI fails when
 * one drifts. This is the check that can actually see them. It shares its rules
 * with `services/sbp/buildLabContract.ts`, which is unit-tested against fixtures —
 * deliberately, because an ops check and a test that ask different questions are
 * worse than either alone.
 *
 * READ-ONLY. It reports and exits; there is no `--apply` and there should not be.
 * A lab is prose written for a student, and nothing here is qualified to rewrite
 * one automatically.
 *
 * Usage:
 *   node dist/scripts/auditBuildLabs.js
 *   node dist/scripts/auditBuildLabs.js --program <uuid>
 *
 * Exit code is 1 when any violation is found, so it can gate a deploy or run from
 * cron without anybody reading the output.
 */
import { LabInput, checkCurriculum } from '../services/sbp/buildLabContract';

/** The canonical program that owns the twelve weeks in production. */
const DEFAULT_PROGRAM_ID = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

export async function auditBuildLabs(programId: string): Promise<{ labs: LabInput[]; violations: ReturnType<typeof checkCurriculum> }> {
  const { default: TimelineCard } = await import('../models/TimelineCard');

  const cards: any[] = await TimelineCard.findAll({
    where: { program_id: programId, type: 'implementation_task', status: 'active' },
  });

  const labs: LabInput[] = cards
    .filter((c) => typeof c.week === 'number')
    .map((c) => ({
      week: c.week,
      bodyHtml: c?.metadata?.content?.body_html ?? '',
      source: c?.metadata?.source ?? null,
      authored: c?.metadata?.authored === true,
    }));

  return { labs, violations: checkCurriculum(labs) };
}

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const programId = argv.includes('--program') ? argv[argv.indexOf('--program') + 1] : DEFAULT_PROGRAM_ID;

    try {
      const { labs, violations } = await auditBuildLabs(programId);

      console.log(`\nBuild-lab audit — program ${programId}`);
      console.log(`${labs.length} lab(s) found\n`);

      for (const lab of [...labs].sort((a, b) => a.week - b.week)) {
        const mine = violations.filter((v) => v.week === lab.week);
        const steps = (lab.bodyHtml.match(/<h4>\s*Step\s+\d+/gi) || []).length;
        const shape = steps > 0 ? `${steps}-step` : 'document';
        console.log(`  week ${String(lab.week).padStart(2)}  ${mine.length === 0 ? 'OK  ' : 'FAIL'}  ${shape}`);
        for (const v of mine) console.log(`             - ${v.rule}: ${v.detail}`);
      }

      // A week with no card at all produces a violation but no row above, so it
      // would otherwise be the one problem the listing cannot show.
      for (const v of violations.filter((x) => x.rule === 'lab_exists')) {
        console.log(`  week ${String(v.week).padStart(2)}  FAIL  ${v.detail}`);
      }

      console.log(`\n${violations.length === 0 ? 'No violations.' : `${violations.length} violation(s).`}\n`);
      process.exit(violations.length === 0 ? 0 : 1);
    } catch (err: any) {
      console.error('audit failed:', err?.message);
      process.exit(2);
    }
  })();
}
