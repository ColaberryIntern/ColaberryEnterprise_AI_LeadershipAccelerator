/**
 * Measures whether an agent-domain story can be verified at all, and by whom. READ-ONLY: SELECTs
 * only, no writes of any kind. AF4.1.
 *
 * ## Why
 *
 * AF4.1's own comments record that its three stated premises were wrong and its acceptance
 * criterion was already met, and then flag the one thing nobody had checked: "what is still not
 * proved, and it is the half that matters for scoring, is that a connected repo actually makes a
 * story VERIFIABLE". The workspace promises an intern that "verification is a read of your repo".
 * Reading the code suggests that read can never reach a domain story, because the only route that
 * runs the verifier resolves its subject from the CALLER'S OWN enrollment, and the provisioner
 * deliberately attaches domain projects to an ai_staff enrollment instead.
 *
 * That is a static trace, not a measurement, and a static trace is exactly the kind of claim that
 * is wrong in production for a reason the code does not show. This script measures it against the
 * live database before anybody acts on it. The decision logic lives in
 * `services/agentDomain/agentDomainVerifiability.ts` so it can be unit-tested without a database;
 * this file only gathers the evidence it needs.
 *
 * ## What it reads, and why these queries are exhaustive rather than a sample
 *
 * `getProjectByEnrollment` can return a project two ways, and each is closed under one query:
 *
 *   - POINTER: `enrollments.active_project_id` names the row. Enumerated by asking which
 *     enrollments point at the ten ids. Nothing else can reach a row this way.
 *   - FALLBACK: it requires `projects.enrollment_id` to equal the caller's own enrollment, so the
 *     only enrollment that can reach a domain row this way is the row's OWN owner. Enumerated by
 *     reading the ten rows' `enrollment_id`.
 *
 * So the verdict covers every enrollment from which the verifier could resolve a domain project.
 * A third group -- a small sample of ordinary enrollments -- is read ONLY to drive the controls,
 * never to reach a conclusion.
 *
 * Run (inside the backend container):
 *   docker exec -w /app accelerator-backend node dist/scripts/queryAgentDomainVerifiability.js
 * Locally:
 *   npx ts-node src/scripts/queryAgentDomainVerifiability.ts
 */
import { QueryTypes, Sequelize } from 'sequelize';
import { sequelize } from '../config/database';
import { PROTECTED_PROJECT_IDS } from '../services/projects/protectedProjects';
import { derivedProjectId } from '../services/agentDomain/agentDomainProvisionPlan';
import { AGENT_DOMAIN_KEYS } from '../services/agentDomain/agentDomainRegistry';
import {
  classify,
  renderReport,
  type DomainProjectFacts,
  type EnrollmentFacts,
  type Evidence,
} from '../services/agentDomain/agentDomainVerifiability';

/** How many ordinary enrollments to read for the controls. Enough to prove the reads work; this
 *  group is deliberately excluded from the verdict, so a larger sample would buy nothing. */
const CONTROL_SAMPLE = 25;

/** A uuid that matches nothing, so an empty protected list cannot produce `NOT IN ()`. */
const NEVER = '00000000-0000-0000-0000-000000000000';

interface ProjectRow {
  id: string;
  name: string | null;
  archived_at: Date | null;
  enrollment_id: string | null;
}
interface IdRow { id: string }
interface EnrollmentRow {
  id: string;
  email: string | null;
  active_project_id: string | null;
  active_pointer_resolves: boolean | null;
  is_ai_staff: boolean | null;
}
interface FallbackRow { enrollment_id: string; fallback_project_id: string }

export async function gatherEvidence(db: Sequelize): Promise<Evidence> {
  const ids = AGENT_DOMAIN_KEYS.map((k) => derivedProjectId(k));
  const protectedIds = [...PROTECTED_PROJECT_IDS];
  const replProtected = protectedIds.length > 0 ? protectedIds : [NEVER];

  const projectRows = (await db.query(
    'SELECT id, name, archived_at, enrollment_id FROM projects WHERE id IN (:ids)',
    { type: QueryTypes.SELECT, replacements: { ids } },
  )) as ProjectRow[];
  const byId = new Map(projectRows.map((r) => [String(r.id), r]));

  const domains: DomainProjectFacts[] = AGENT_DOMAIN_KEYS.map((domain_key, i) => {
    const project_id = ids[i];
    const row = byId.get(project_id);
    return {
      domain_key,
      project_id,
      present: !!row,
      archived: !!row?.archived_at,
      name: row ? (row.name ?? null) : null,
      owner_enrollment_id: row ? (row.enrollment_id ?? null) : null,
    };
  });

  // Pointer path, exhaustively: whoever points at one of the ten.
  const pointing = (await db.query(
    'SELECT id FROM enrollments WHERE active_project_id IN (:ids)',
    { type: QueryTypes.SELECT, replacements: { ids } },
  )) as IdRow[];

  // Control group only. Ordinary enrollments that own a live project, so CTL-1 can show the
  // pointer read finding real pointers and CTL-5 can show the fallback read returning a row that
  // is NOT one of the ten.
  const sample = (await db.query(
    `SELECT DISTINCT e.id
       FROM enrollments e
       JOIN projects p ON p.enrollment_id = e.id AND p.archived_at IS NULL
      WHERE e.active_project_id IS NOT NULL
      ORDER BY e.id
      LIMIT :lim`,
    { type: QueryTypes.SELECT, replacements: { lim: CONTROL_SAMPLE } },
  )) as IdRow[];

  const enrollmentIds = [...new Set([
    ...domains.map((d) => d.owner_enrollment_id).filter((x): x is string => !!x),
    ...pointing.map((r) => String(r.id)),
    ...sample.map((r) => String(r.id)),
  ])];

  if (enrollmentIds.length === 0) {
    // No owners, no pointers, no sample: the controls will fail and say so rather than letting an
    // empty read look like a confirmed absence.
    return { domains, enrollments: [] };
  }

  const enrollmentRows = (await db.query(
    `SELECT e.id,
            e.email,
            e.active_project_id,
            (ap.id IS NOT NULL AND ap.archived_at IS NULL) AS active_pointer_resolves,
            COALESCE(au.role = 'ai_staff', false)          AS is_ai_staff
       FROM enrollments e
       LEFT JOIN projects ap    ON ap.id = e.active_project_id
       LEFT JOIN admin_users au ON lower(au.email) = lower(e.email)
      WHERE e.id IN (:enrollmentIds)`,
    { type: QueryTypes.SELECT, replacements: { enrollmentIds } },
  )) as EnrollmentRow[];

  // Mirrors `adoptableWhere` + `ORDER BY created_at DESC` exactly: live, not protected, newest
  // first, ONE row per enrollment. `DISTINCT ON` is what makes it one row -- the fallback returns
  // a single project, so an enrollment owning several domain rows still only reaches the newest.
  const fallbackRows = (await db.query(
    `SELECT DISTINCT ON (p.enrollment_id) p.enrollment_id, p.id AS fallback_project_id
       FROM projects p
      WHERE p.enrollment_id IN (:enrollmentIds)
        AND p.archived_at IS NULL
        AND p.id NOT IN (:replProtected)
      ORDER BY p.enrollment_id, p.created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { enrollmentIds, replProtected } },
  )) as FallbackRow[];
  const fallbackByEnrollment = new Map(
    fallbackRows.map((r) => [String(r.enrollment_id), String(r.fallback_project_id)]),
  );

  const enrollments: EnrollmentFacts[] = enrollmentRows.map((r) => ({
    enrollment_id: String(r.id),
    email: r.email ?? null,
    is_ai_staff: r.is_ai_staff === true,
    active_project_id: r.active_project_id ?? null,
    active_pointer_resolves: r.active_pointer_resolves === true,
    fallback_project_id: fallbackByEnrollment.get(String(r.id)) ?? null,
  }));

  return { domains, enrollments };
}

export async function main(): Promise<void> {
  const evidence = await gatherEvidence(sequelize);
  const report = classify(evidence);
  console.log(renderReport(report));
  console.log('');
  console.log(`read ${evidence.domains.length} domain projects and ${evidence.enrollments.length} enrollments; wrote nothing`);
}

/* istanbul ignore next -- entry point only; the tests drive classify/gatherEvidence. */
if (require.main === module) {
  main()
    .then(async () => { await sequelize.close(); process.exit(0); })
    .catch(async (err: unknown) => {
      console.error('queryAgentDomainVerifiability failed:', err instanceof Error ? err.message : String(err));
      await sequelize.close().catch(() => undefined);
      process.exit(1);
    });
}
