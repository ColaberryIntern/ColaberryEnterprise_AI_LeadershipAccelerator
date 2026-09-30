import { sequelize } from '../config/database';
import { createCaseStudyFromProject } from '../services/caseStudy/caseStudyAdminService';

/**
 * Turn a learner's project into a Case Study they own.
 *
 * WHY THIS EXISTS. Ali: "Case study can then become an asset for the student ... add that
 * process." The machinery already existed - `createCaseStudyFromProject` builds the row,
 * attaches the repository, and links the learner's evidence and artifacts - but it was
 * reachable only through an admin HTTP route, one project at a time, by hand. A student
 * asset that depends on somebody remembering to POST is not a process.
 *
 * WHAT IT DOES, AND WHERE IT STOPS. It performs step ONE of four and then tells you the
 * other three:
 *
 *   1. create    <- this script. Row is born draft / private / no consent.
 *   2. sync      analyse the repository. A network call taking minutes, deliberately
 *                separate from create so a slow repo cannot fail the creation.
 *   3. approve   a human decides the case study is true and fair.
 *   4. publish   a publication row per surface; only then does /stories/:slug resolve,
 *                and only then does the learner's portfolio card link to it.
 *
 * IT CANNOT PUBLISH, by construction rather than by restraint - `caseStudyAdminService`
 * has no publish path at all. That matters: a case study carries a learner's name and an
 * employer's name, and nothing in a script should be able to put either on the internet.
 *
 * IDEMPOTENT. A project that already has a non-archived case study is skipped and named,
 * so a re-run after adding one student does not create a second row for everyone else.
 *
 * FAILURE-FIRST (root CLAUDE.md):
 *  1. On failure: per project. One unresolvable repository is logged and skipped; the
 *     rest of the batch still lands. Creation is one row plus its attachments inside the
 *     service's own transaction, so a failure leaves nothing half-made.
 *  2. Retry: none internally. Re-running is the retry, and idempotency makes it safe.
 *  3. Recovery: re-run. A project that failed still has no case study and is picked up.
 *  4. Handled: unknown project, archived project, a project whose repository cannot be
 *     resolved, and a project already carrying a case study. NOT handled: the database
 *     being unavailable, which propagates and stops the run.
 *
 * Usage:
 *   node dist/scripts/createCaseStudyForProject.js --enrollment=<id>          # dry run
 *   node dist/scripts/createCaseStudyForProject.js --enrollment=<id> --apply
 *   node dist/scripts/createCaseStudyForProject.js --project=<id> --apply
 */

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');

function argValue(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

const ENROLLMENT = argValue('enrollment');
const PROJECT = argValue('project');
const ACTOR = argValue('actor') || 'ali@colaberry.com';

interface Candidate { id: string; name: string | null; existing_slug: string | null }

async function main(): Promise<void> {
  if (!ENROLLMENT && !PROJECT) {
    console.error('Give --enrollment=<id> or --project=<id>.');
    process.exit(1);
  }

  // LEFT JOIN so a project that already has one is reported rather than silently skipped:
  // "nothing to do" and "already done" are different answers and the operator needs both.
  const [rows]: any = await sequelize.query(
    `SELECT p.id, p.name, c.slug AS existing_slug
       FROM projects p
       LEFT JOIN case_studies c
         ON c.project_id = p.id AND c.archived_at IS NULL
      WHERE p.archived_at IS NULL
        AND ($1::uuid IS NULL OR p.enrollment_id = $1::uuid)
        AND ($2::uuid IS NULL OR p.id = $2::uuid)
      ORDER BY p.created_at ASC`,
    { bind: [ENROLLMENT, PROJECT] },
  );

  const candidates: Candidate[] = Array.isArray(rows) ? rows : [];
  const todo = candidates.filter((c) => !c.existing_slug);
  const already = candidates.filter((c) => !!c.existing_slug);

  console.log(JSON.stringify({
    event: 'case_study_for_project_plan',
    mode: APPLY ? 'apply' : 'dry-run',
    projects_found: candidates.length,
    already_have_one: already.length,
    will_create: todo.length,
  }, null, 2));

  already.forEach((c) => console.log(JSON.stringify({
    event: 'case_study_for_project_skipped',
    project: c.name, reason: 'already has a case study', slug: c.existing_slug,
  })));

  if (!todo.length) { console.log('Nothing to create.'); return; }

  let created = 0;
  let failed = 0;

  for (const c of todo) {
    if (!APPLY) {
      console.log(JSON.stringify({
        event: 'case_study_for_project_would_create', project: c.name, project_id: c.id,
      }));
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- each create attaches a repository and
      // links evidence; sequential keeps the log readable and the load predictable.
      const res: any = await createCaseStudyFromProject({ projectId: c.id, actor: ACTOR });
      const cs = res?.caseStudy ?? res;
      created += 1;
      console.log(JSON.stringify({
        event: 'case_study_for_project_created',
        project: c.name, slug: cs?.slug, status: cs?.status,
        warnings: res?.warnings ?? [],
      }));
    } catch (err: any) {
      failed += 1;
      console.warn(JSON.stringify({
        event: 'case_study_for_project_failed',
        project: c.name, project_id: c.id,
        error_class: err?.error_class || err?.name || 'Error',
        message: err?.message,
      }));
    }
  }

  console.log(JSON.stringify({
    event: 'case_study_for_project_done',
    mode: APPLY ? 'apply' : 'dry-run', created, failed,
    // Said in full every run, because a draft case study looks finished from the outside
    // and a learner's card stays unlinked until all three of these have happened.
    next_steps: [
      '2. sync   — POST /api/admin/case-studies/:id/sync to analyse the repository',
      '3. approve — a human confirms the case study is true and fair',
      '4. publish — publish to the `enterprise` surface; only then does /stories/:slug '
        + 'resolve and the learner portfolio card link to it',
    ],
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('createCaseStudyForProject failed:', err);
    process.exit(1);
  });
