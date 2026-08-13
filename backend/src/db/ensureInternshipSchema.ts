import { sequelize } from '../config/database';

/**
 * AI Internship — schema. Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §22.
 *
 * The AI Internship is a REAL product (it evolved from the Data Analytics class
 * internship) that has never been marketed. What was missing was the software,
 * not the offering — there was no internships table, route, or application flow
 * anywhere in this repo, verified by grep before this module was written.
 *
 * Two tables, deliberately:
 *
 *  - `internship_offerings` — the thing being offered. A cohort/session of the
 *    internship, with its own window and capacity.
 *  - `internship_applications` — a person's application to one offering.
 *
 * This runs through an ensure*Schema() module rather than sequelize.sync()
 * because there is NO global sync at boot (server.ts, DB_BOOT_SYNC off) — an
 * ungated sync(alter) once produced ~50k duplicate constraints and OOM'd
 * Postgres. Raw idempotent DDL is the house pattern; see
 * ensureExplorerGrowthSchema.ts.
 *
 * IDEMPOTENCY (CLAUDE.md, non-negotiable): every statement is IF NOT EXISTS, so
 * this is safe to run on every boot and safe to re-run after a partial failure.
 * The UNIQUE index on (offering_id, email_normalized) is the duplicate-application
 * guarantee, enforced at the database rather than in application code — the same
 * choice made for explorer_journey_decisions in EPIC 1, and for the same reason:
 * an application flow WILL be double-submitted by a retried request or an
 * impatient double-click, and the only place that can be made impossible is here.
 */

/** Application lifecycle. `accepted` is what makes a learner CONVERTED (§8.1 line 763). */
export const INTERNSHIP_APPLICATION_STATUSES = [
  'started',
  'submitted',
  'under_review',
  'waitlisted',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

/** Offering lifecycle. Only `open` accepts applications. */
export const INTERNSHIP_OFFERING_STATUSES = [
  'draft',
  'open',
  'closed',
  'archived',
] as const;

export async function ensureInternshipSchema(): Promise<void> {
  // --- Offerings -----------------------------------------------------------
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS internship_offerings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      track VARCHAR(60) NOT NULL DEFAULT 'ai',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      starts_on DATE,
      ends_on DATE,
      application_opens_on DATE,
      application_deadline DATE,
      capacity INTEGER,
      is_paid BOOLEAN NOT NULL DEFAULT false,
      stipend_cents INTEGER,
      commitment_hours_per_week INTEGER,
      is_remote BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Slug is the public identifier a route will resolve on, so it must be unique.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_internship_offerings_slug
      ON internship_offerings (slug)
  `);

  // The listing query: "what can someone apply to right now."
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_internship_offerings_status_deadline
      ON internship_offerings (status, application_deadline)
  `);

  // --- Applications --------------------------------------------------------
  //
  // Identity here is deliberately THREE columns, because the same human reaches
  // us through three different keyspaces and none of them is reliably present:
  //
  //   enrollment_id  — UUID, set when the applicant is a known portal learner
  //   lead_id        — INTEGER, set when they came in as a marketing lead
  //   email_normalized — ALWAYS set; the only durable identity across both
  //
  // enrollments.email is not unique and leads.id is a different keyspace
  // entirely, so lowercased email is the join of last resort — the same bridge
  // explorerIdentityBridge.ts already relies on. NOT NULL on email_normalized is
  // what makes the dedupe index below meaningful.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS internship_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      offering_id UUID NOT NULL REFERENCES internship_offerings (id) ON DELETE CASCADE,
      enrollment_id UUID,
      lead_id INTEGER,
      email_normalized VARCHAR(320) NOT NULL,
      full_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'started',
      source VARCHAR(60),
      motivation TEXT,
      portfolio_url VARCHAR(500),
      resume_text TEXT,
      submitted_at TIMESTAMPTZ,
      decided_at TIMESTAMPTZ,
      decision_note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // THE duplicate-application guarantee. One application per person per
  // offering, enforced by the database so no caller can bypass it.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_internship_applications_unique
      ON internship_applications (offering_id, email_normalized)
  `);

  // Lookup paths that will actually be queried.
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_internship_applications_enrollment
      ON internship_applications (enrollment_id)
      WHERE enrollment_id IS NOT NULL
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_internship_applications_lead
      ON internship_applications (lead_id)
      WHERE lead_id IS NOT NULL
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_internship_applications_email
      ON internship_applications (email_normalized)
  `);
  // Admin review queue, and the query Explorer Growth reads for the CONVERTED
  // check (§8.1 line 763: internship acceptance is a conversion).
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_internship_applications_offering_status
      ON internship_applications (offering_id, status)
  `);

  // NOTE on the deliberate absence of foreign keys to enrollments/leads:
  // enrollment_id and lead_id are intentionally UNCONSTRAINED, matching the
  // choice made for page_events.lead_id in EPIC 1. Adding an FK to a
  // high-write table forces a validate-scan under lock on deploy, and neither
  // column is guaranteed present. The application row must survive an applicant
  // who is neither an enrolled learner nor a captured lead — which is exactly
  // the person a never-marketed product will attract first.
}
