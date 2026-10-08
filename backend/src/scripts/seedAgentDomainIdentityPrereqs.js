#!/usr/bin/env node
/**
 * T02 — the two additive data prerequisites the Agent Domain factory reads before it writes.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * WHAT THIS WRITES, AND WHY EACH ROW IS AUTHORIZED
 *
 *   1. ONE `org_members` row for dhee@colaberry.com.
 *      Pre-approved verbatim by the DRI on 2026-09-15, recorded in
 *      docs/architecture/ai-workforce-management/HUMAN_OWNERSHIP_MAP.md:52 --
 *      "one additive org_members row approved, to be created when the Internship employee's
 *      Phase 1 begins". That precondition is now satisfied.
 *      WHY IT IS NEEDED: `ai_agents.reports_to_type = 'human'` targets `org_members.id`. Without
 *      this row the Internship domain has no addressable accountable human, and the measurement
 *      task that follows would record a FALSE `manager_unresolved` blocker -- the exact defect an
 *      independent plan audit caught in this run's first planning cycle.
 *
 *   2. ONE `program_blueprints` row for internal AI-employee work.
 *      All three existing rows are external *learner* programmes -- verified by reading their
 *      `target_persona`, not merely their names. `projects.program_id` is a NOT NULL FK into this
 *      table, so the ten AI-domain projects need a programme that describes internal work rather
 *      than being filed under a student cohort.
 *
 * WHAT THIS DOES NOT DO
 *   - grants no login, no role elevation, no section access. `role` is 'member', the lower of the
 *     only two values `OrgMemberRole` permits, and no `admin_users` row is created or touched.
 *     (`mgmt_role` does not exist on either model, so a bare org_members row cannot grant a
 *     section.)
 *   - touches no agent, no enrollment's `active_project_id`, no project, no intern assignment.
 *   - creates nothing for Ruth Kumera and advances no internship application.
 *
 * IDEMPOTENCY
 *   Row 1 keys on the real unique index `org_members_org_email_unique (org_id, email)`.
 *   Row 2 has no natural key and `program_blueprints.id` carries NO database default, so the id is
 *   DERIVED (uuid5 over a fixed namespace, the same construction as
 *   services/factory/factoryIds.ts) rather than random. A re-run therefore re-mints the SAME id and
 *   conflicts on the primary key instead of inserting a second programme.
 *
 * SAFETY
 *   Dry-run by default. Writes only with `--apply`. Every statement is INSERT ... ON CONFLICT DO
 *   NOTHING; there is no UPDATE and no DELETE anywhere in this file.
 */

const { createHash } = require('crypto');

/** The write-set this script declares. A test asserts the SQL touches nothing else. */
const DECLARED_WRITE_SET = Object.freeze(['org_members', 'program_blueprints']);

/**
 * The Colaberry organisation of record. MEASURED, not assumed: three organisations are named
 * "Colaberry" (acdfa378..., f1ab8d0b..., ae873552...). This one holds 21 members including all
 * eight managers named in HUMAN_OWNERSHIP_MAP.md; the other two hold one member each. Writing into
 * the wrong one would create a member in a stale org and break manager resolution later.
 */
const COLABERRY_ORG_ID = 'acdfa378-3613-4e6f-850f-1bbfb9d3e789';

/** Dhee's existing identity rows, both measured 2026-10-08. Neither is modified. */
const DHEE_EMAIL = 'dhee@colaberry.com';
const DHEE_ENROLLMENT_ID = 'a67fa986-b0ca-4a27-ae1a-61af875eeed2';

/**
 * `team` is 'Operations' by CONVENTION, not by instruction. 0 of the 21 existing members carry a
 * NULL team, so a blank would make this row the single anomaly in the table and read as a defect.
 * The three other operations-domain owners -- Admissions (Taiwo), Curriculum (Swati) and Platform
 * (Kes) -- are all 'Operations', and Internship & Career Readiness sits with them. Flagged for the
 * DRI to change if wrong; it is a label and gates nothing.
 */
const DHEE_TEAM = 'Operations';

const FACTORY_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToUuid(b) {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** uuid5, matching services/factory/factoryIds.ts so this run keeps ONE id derivation path. */
function uuid5(name, namespace = FACTORY_NAMESPACE) {
  const hash = createHash('sha1')
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  return bytesToUuid(bytes);
}

const BLUEPRINT_NAME = 'Internal AI Employee Operations';
const BLUEPRINT_ID = uuid5('program_blueprint:internal_ai_employee_operations');
const DHEE_ORG_MEMBER_ID = uuid5(`org_member:${COLABERRY_ORG_ID}:${DHEE_EMAIL}`);

const BLUEPRINT_DESCRIPTION =
  'Internal programme covering the ten AI employee domains and the Colaberry employees accountable '
  + 'for them. Distinct from the learner programmes: its participants are AI employees and their '
  + 'human managers, not enrolled students. Created for the Agent Domain factory so that internal '
  + 'projects are not filed under a student cohort.';

const BLUEPRINT_PERSONA =
  'Colaberry employees accountable for an AI employee domain, and the interns who build within one. '
  + 'Not external learners.';

/** Row 1. ON CONFLICT on the REAL unique index (org_id, email). */
const SQL_ORG_MEMBER = `
INSERT INTO public.org_members
  (id, org_id, enrollment_id, email, team, role, invite_status, joined_at, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, $5, 'member', 'active', now(), now(), now())
ON CONFLICT (org_id, email) DO NOTHING
RETURNING id;`;

/** Row 2. ON CONFLICT on the primary key, which is derived and therefore stable across re-runs. */
const SQL_BLUEPRINT = `
INSERT INTO public.program_blueprints
  (id, name, description, target_persona, is_active, version, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING
RETURNING id;`;

async function main() {
  const apply = process.argv.includes('--apply');
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const log = (o) => console.log(JSON.stringify(o));

  try {
    log({
      event: 'agent_domain_prereqs_start',
      mode: apply ? 'APPLY' : 'DRY_RUN',
      declared_write_set: DECLARED_WRITE_SET,
      derived_ids: { dhee_org_member_id: DHEE_ORG_MEMBER_ID, blueprint_id: BLUEPRINT_ID },
    });

    // Read current state first, so the report is a before/after rather than an assertion.
    const before = await client.query(
      `SELECT
         (SELECT count(*) FROM public.org_members WHERE org_id=$1 AND lower(email)=$2) AS dhee_rows,
         (SELECT count(*) FROM public.org_members WHERE org_id=$1) AS org_members_in_org,
         (SELECT count(*) FROM public.program_blueprints) AS blueprints,
         (SELECT count(*) FROM public.program_blueprints WHERE id=$3) AS target_blueprint,
         (SELECT count(*) FROM public.org_members WHERE lower(email) LIKE '%@colaberry.com') AS control_colaberry_members`,
      [COLABERRY_ORG_ID, DHEE_EMAIL, BLUEPRINT_ID],
    );
    log({ event: 'before', ...before.rows[0] });

    if (Number(before.rows[0].control_colaberry_members) === 0) {
      throw new Error('positive control failed: zero colaberry.com org_members, so a zero for Dhee proves nothing');
    }

    if (!apply) {
      log({
        event: 'dry_run_plan',
        would_insert_org_member: Number(before.rows[0].dhee_rows) === 0,
        would_insert_blueprint: Number(before.rows[0].target_blueprint) === 0,
        note: 'no write performed; re-run with --apply',
      });
      return;
    }

    const m = await client.query(SQL_ORG_MEMBER, [
      DHEE_ORG_MEMBER_ID, COLABERRY_ORG_ID, DHEE_ENROLLMENT_ID, DHEE_EMAIL, DHEE_TEAM,
    ]);
    log({ event: 'org_member', created: m.rowCount, id: m.rows[0] ? m.rows[0].id : null });

    const b = await client.query(SQL_BLUEPRINT, [
      BLUEPRINT_ID, BLUEPRINT_NAME, BLUEPRINT_DESCRIPTION, BLUEPRINT_PERSONA,
    ]);
    log({ event: 'program_blueprint', created: b.rowCount, id: b.rows[0] ? b.rows[0].id : null });

    const after = await client.query(
      `SELECT
         (SELECT count(*) FROM public.org_members WHERE org_id=$1 AND lower(email)=$2) AS dhee_rows,
         (SELECT count(*) FROM public.org_members WHERE org_id=$1) AS org_members_in_org,
         (SELECT count(*) FROM public.program_blueprints) AS blueprints,
         (SELECT count(*) FROM public.admin_users WHERE lower(email)=$2) AS dhee_admin_rows_untouched`,
      [COLABERRY_ORG_ID, DHEE_EMAIL],
    );
    log({ event: 'after', ...after.rows[0] });

    log({
      event: 'rollback_instructions',
      order_matters: 'projects.program_id references program_blueprints ON DELETE CASCADE, so DELETE the ten projects BEFORE the blueprint or they go with it',
      statements: [
        `DELETE FROM public.org_members WHERE id = '${DHEE_ORG_MEMBER_ID}';`,
        `DELETE FROM public.program_blueprints WHERE id = '${BLUEPRINT_ID}';`,
      ],
    });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ event: 'agent_domain_prereqs_failed', error_class: err.name, message: err.message }));
    process.exit(1);
  });
}

module.exports = {
  DECLARED_WRITE_SET,
  COLABERRY_ORG_ID,
  DHEE_ORG_MEMBER_ID,
  BLUEPRINT_ID,
  BLUEPRINT_NAME,
  SQL_ORG_MEMBER,
  SQL_BLUEPRINT,
  uuid5,
  main,
};
