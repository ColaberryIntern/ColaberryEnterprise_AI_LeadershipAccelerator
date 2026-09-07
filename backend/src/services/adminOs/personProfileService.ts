import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { LifecycleStage } from './lifecycle';
import { normalizeEmail } from './identityResolution';
import { visibleStagesForSections } from './personScope';

/**
 * The 360° person profile.
 *
 * ── PANELS ARE OMITTED SERVER-SIDE, NOT HIDDEN IN THE UI ────────────────────
 *
 * A panel the caller may not see is never fetched and never serialised. Sending
 * the data and hiding it in the browser is not access control — it is a CSS
 * rule over a payload the reader already has.
 *
 * This is where the per-section split earns its keep. A revenue rep sees billing
 * and acquisition; a mentor sees learning; neither sees the other's. The section
 * gate could not express that, because it grants a whole SURFACE — so the
 * surface is granted broadly and the CONTENT is filtered here.
 *
 * ── A MENTOR IS NARROWED TWICE ──────────────────────────────────────────────
 *
 * `personScope` flags `career_review` as needing a per-record narrowing, and
 * this is where that promise is kept. A mentor's stage scope says "learners";
 * `visibleEnrollmentIds` says WHICH learners. Without the second check a mentor
 * would read every learner on the platform, which is exactly what mgmtRoles
 * warns about.
 *
 * `null` from that helper means "no filter" (an admin) and `[]` means "a mentor
 * with no grants, who must see nothing". Collapsing the two is the classic way a
 * scoped surface shows everything, so they are handled separately below.
 */

export interface AcquisitionPanel {
  source: string | null;
  formType: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  pipelineStage: string | null;
  leadScore: number | null;
  firstSeen: string | null;
}

export interface LearningPanel {
  enrollmentId: string;
  cohortId: string | null;
  status: string | null;
  tier: string | null;
  enrollmentType: string | null;
  enrolledAt: string | null;
}

export interface BillingPanel {
  enrollmentId: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  amountPaid: number | null;
}

export interface EngagementPanel {
  sessions: number;
  firstSeen: string | null;
  lastSeen: string | null;
  sites: string[];
}

export interface PersonProfile {
  email: string;
  name: string | null;
  stage: LifecycleStage;
  tracedToLead: boolean;
  company: string | null;
  title: string | null;
  /** Only the panels this caller may see. An absent key means "not permitted". */
  acquisition?: AcquisitionPanel | null;
  learning?: LearningPanel[];
  billing?: BillingPanel[];
  engagement?: EngagementPanel | null;
  /** Named so the UI can say what it is NOT showing, rather than silently omitting. */
  withheldPanels: string[];
}

export interface ProfileQuery {
  email: string;
  sections: readonly string[];
  /**
   * Enrollment ids this caller may see, from careerMentorScopeService.
   * `null` means no per-record filter (an admin). `[]` means see nothing.
   */
  visibleEnrollmentIds: string[] | null;
}

/** Which section grants which panel. One place, so a panel cannot drift. */
const PANEL_SECTIONS: Record<string, readonly string[]> = {
  acquisition: ['leads', 'revenue', 'lead_ingestion'],
  learning: ['students', 'program', 'career_review'],
  billing: ['revenue'],
  engagement: ['campaigns'],
};

function may(panel: string, sections: readonly string[]): boolean {
  return (PANEL_SECTIONS[panel] ?? []).some((s) => sections.includes(s));
}

/**
 * Read one person's profile, or null when this caller may not see them.
 *
 * Returns null rather than an empty profile for someone outside scope: an empty
 * profile confirms the person EXISTS, which is itself a disclosure. "Not found"
 * and "not yours" must look identical from outside.
 */
export async function getPersonProfile(query: ProfileQuery): Promise<PersonProfile | null> {
  const email = normalizeEmail(query.email);
  if (!email) return null;

  const visibleStages = visibleStagesForSections(query.sections);
  if (visibleStages.length === 0) return null;

  const rows = await sequelize.query<{
    email: string; name: string | null; stage: LifecycleStage;
    company: string | null; title: string | null; traced: boolean;
  }>(
    `SELECT COALESCE(l.email, e.email) AS email,
            COALESCE(e.name, l.name) AS name,
            COALESCE(e.company, l.company) AS company,
            COALESCE(e.title, l.title) AS title,
            (CASE
               WHEN e.email IS NOT NULL THEN 'enrolled_student'
               WHEN l.pipeline_stage IS NOT NULL AND l.pipeline_stage <> 'new_lead' THEN 'applicant'
               ELSE 'lead'
             END) AS stage,
            (l.email IS NOT NULL) AS traced
     FROM (
       SELECT lower(btrim(email)) AS email, max(name) AS name, max(company) AS company,
              max(title) AS title, max(pipeline_stage) AS pipeline_stage
       FROM leads WHERE lower(btrim(email)) = :email GROUP BY lower(btrim(email))
     ) l
     FULL OUTER JOIN (
       SELECT lower(btrim(email)) AS email, max(full_name) AS name, max(company) AS company,
              max(title) AS title
       FROM enrollments WHERE lower(btrim(email)) = :email GROUP BY lower(btrim(email))
     ) e ON e.email = l.email`,
    { type: QueryTypes.SELECT, replacements: { email } },
  );

  const person = rows[0];
  if (!person) return null;

  // Stage scope. A support identity must not reach a lead's profile by typing
  // the address, even though it may open the People surface.
  if (!visibleStages.includes(person.stage)) return null;

  const profile: PersonProfile = {
    email: person.email,
    name: person.name,
    stage: person.stage,
    tracedToLead: person.traced,
    company: person.company,
    title: person.title,
    withheldPanels: [],
  };

  // ── Acquisition ───────────────────────────────────────────────────────────
  if (may('acquisition', query.sections)) {
    const acq = await sequelize.query<AcquisitionPanel>(
      `SELECT source, form_type AS "formType", utm_source AS "utmSource",
              utm_campaign AS "utmCampaign", pipeline_stage AS "pipelineStage",
              lead_score AS "leadScore", min(created_at) OVER () AS "firstSeen"
       FROM leads WHERE lower(btrim(email)) = :email
       ORDER BY created_at ASC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    profile.acquisition = acq[0] ?? null;
  } else {
    profile.withheldPanels.push('acquisition');
  }

  // ── Learning, narrowed a second time for a mentor ─────────────────────────
  if (may('learning', query.sections)) {
    const ids = query.visibleEnrollmentIds;
    if (ids !== null && ids.length === 0) {
      // A mentor with no grants. Not an empty list of enrolments — no access.
      profile.learning = [];
    } else {
      const scopeClause = ids === null ? '' : 'AND id IN (:ids)';
      const learning = await sequelize.query<LearningPanel>(
        `SELECT id AS "enrollmentId", cohort_id AS "cohortId", status::text AS status,
                tier, enrollment_type AS "enrollmentType", enrolled_at AS "enrolledAt"
         FROM enrollments
         WHERE lower(btrim(email)) = :email ${scopeClause}
         ORDER BY created_at DESC`,
        {
          type: QueryTypes.SELECT,
          replacements: ids === null ? { email } : { email, ids },
        },
      );
      profile.learning = learning;
    }
  } else {
    profile.withheldPanels.push('learning');
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  if (may('billing', query.sections)) {
    const billing = await sequelize.query<BillingPanel>(
      `SELECT id AS "enrollmentId", payment_status::text AS "paymentStatus",
              payment_method::text AS "paymentMethod", amount_paid AS "amountPaid"
       FROM enrollments WHERE lower(btrim(email)) = :email
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    profile.billing = billing;
  } else {
    profile.withheldPanels.push('billing');
  }

  // ── Engagement ────────────────────────────────────────────────────────────
  if (may('engagement', query.sections)) {
    const eng = await sequelize.query<{
      sessions: string; firstSeen: string | null; lastSeen: string | null; sites: string[] | null;
    }>(
      `SELECT COUNT(vs.id)::text AS sessions,
              min(vs.started_at) AS "firstSeen",
              max(vs.started_at) AS "lastSeen",
              array_remove(array_agg(DISTINCT vs.site_slug), NULL) AS sites
       FROM visitors v
       LEFT JOIN visitor_sessions vs ON vs.visitor_id = v.id
       JOIN leads l ON l.id = v.lead_id
       WHERE lower(btrim(l.email)) = :email`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const e = eng[0];
    profile.engagement = e
      ? {
          sessions: Number(e.sessions ?? 0),
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
          sites: e.sites ?? [],
        }
      : null;
  } else {
    profile.withheldPanels.push('engagement');
  }

  return profile;
}
