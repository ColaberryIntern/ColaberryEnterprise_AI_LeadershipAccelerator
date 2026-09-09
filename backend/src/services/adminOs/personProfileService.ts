import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { LifecycleStage } from './lifecycle';
import { normalizeEmail } from './identityResolution';
import { visibleStagesForSections } from './personScope';
import { EventDomain, TimelineEvent, domainsForSections, getPersonTimeline } from './personTimelineService';

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

/**
 * Everything the Lead detail page shows, plus what it does not.
 *
 * The brief requires existing lead/enrollment/visitor detail URLs to resolve to
 * this profile, which only works if the profile is a SUPERSET. The first version
 * carried six fields against that page's contact block, tracking block,
 * qualification, ownership, consent and notes — so it was a downgrade for anyone
 * who opened it instead of the lead page.
 */
export interface AcquisitionPanel {
  // Contact
  phone: string | null;
  role: string | null;
  companySize: string | null;
  industry: string | null;
  linkedinUrl: string | null;
  // Attribution
  source: string | null;
  formType: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  pageUrl: string | null;
  interestArea: string | null;
  message: string | null;
  firstSeen: string | null;
  // Qualification
  pipelineStage: string | null;
  leadScore: number | null;
  temperature: string | null;
  temperatureUpdatedAt: string | null;
  qualificationLevel: string | null;
  interestLevel: string | null;
  maturityScore: number | null;
  // Ownership and follow-up
  status: string | null;
  assignedAdmin: string | null;
  lastContactedAt: string | null;
  notes: string | null;
  /** The brief asks for consent explicitly. Null means never recorded. */
  consentContact: boolean | null;
  evaluating90Days: boolean | null;
  createdAt: string | null;
  leadId: number | null;
  /** The denominator the Lead page shows beside the score. */
  leadScoreMax: number;
}

/**
 * Data & trust — the brief's last profile section, and the one this whole
 * workstream has been arguing for.
 *
 * It answers "how much of this should you believe": which source records
 * resolve to this person, how they were matched, whether consent was recorded,
 * how fresh the data is, and — most usefully — what CANNOT be computed for them
 * and why. A gap stated is a gap a reader can act on; a gap left blank reads as
 * a zero.
 */
export interface TrustPanel {
  /** Source records that resolve to this person. */
  leadIds: number[];
  enrollmentIds: string[];
  /** How identity was established. Email is the only automatic method. */
  matchMethod: 'exact_email' | 'none';
  /** False for the 86 enrolments with no acquisition record. */
  tracedToLead: boolean;
  consentRecorded: boolean | null;
  /** Most recent activity we hold, from the timeline. */
  lastActivity: string | null;
  /** What we cannot say about this person, and why. Never rendered as zero. */
  gaps: Array<{ field: string; reason: string }>;
}

export interface AppointmentRow {
  kind: 'appointment' | 'strategy_call';
  title: string | null;
  scheduledAt: string | null;
  status: string | null;
  notes: string | null;
  meetLink: string | null;
}

export interface AutomationRow {
  type: string;
  status: string | null;
  detail: string | null;
  createdAt: string | null;
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

/**
 * The journey summary the brief asks for: first touch, time in stage, and the
 * shape of the relationship, above the detail.
 *
 * Every figure is counted, not estimated. A count we cannot compute is null
 * rather than 0 — the same rule the metric registry enforces everywhere else.
 */
export interface JourneySummary {
  firstTouch: string | null;
  lastActivity: string | null;
  daysKnown: number | null;
  sessions: number;
  pageEvents: number;
  campaigns: number;
  emailsSent: number;
  enrollments: number;
  /** Highest recorded intent score, when the caller may see sales data. */
  intentScore: number | null;
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
  /** The summary above the detail. Progressive disclosure, as the brief asks. */
  appointments?: AppointmentRow[];
  automation?: AutomationRow[];
  /**
   * Why intent and temperature are absent, when they are.
   *
   * They are acquisition signals. Once somebody has enrolled, "this student is
   * hot" tells a reader nothing they can act on — the question that scoring
   * answered has already been answered by the enrolment. Suppressed rather than
   * shown, and explained rather than silently missing.
   */
  intentSuppressedReason?: string;
  trust?: TrustPanel;
  journey?: JourneySummary;
  /** One ordered history across every domain the caller may see. */
  timeline?: TimelineEvent[];
  /** Domains excluded from the timeline by this caller's permissions. */
  timelineDomains?: EventDomain[];
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

/**
 * Stages at which intent and temperature stop being informative.
 *
 * Ali, 2026-09-08: "if they are enrolled, hide their current intent. Knowing
 * that an enrolled student is hot, is not informing to us."
 *
 * He is right, and the reason is worth stating: a temperature or intent score
 * answers "how likely are they to convert". Once they HAVE converted, the score
 * is a stale answer to a settled question, and leaving it on the page invites
 * someone to act on it as though it still meant something.
 */
const POST_CONVERSION_STAGES: readonly string[] = [
  'enrolled_student', 'active_learner', 'graduate', 'returning_customer',
];

/** The Lead page's score denominator, kept here so both surfaces agree. */
const LEAD_SCORE_MAX = 105;

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
               WHEN e.status = 'completed' THEN 'graduate'
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
              max(title) AS title,
              -- Most advanced status wins, so one completed enrolment makes the
              -- person a graduate even if they also hold an active one.
              MAX(CASE WHEN status::text = 'completed' THEN 'completed' ELSE NULL END) AS status
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
      `SELECT id AS "leadId", phone, role, company_size AS "companySize", industry,
              linkedin_url AS "linkedinUrl",
              source, form_type AS "formType", utm_source AS "utmSource",
              utm_campaign AS "utmCampaign", page_url AS "pageUrl",
              interest_area AS "interestArea", message,
              pipeline_stage AS "pipelineStage", lead_score AS "leadScore",
              lead_temperature AS temperature,
              temperature_updated_at AS "temperatureUpdatedAt",
              qualification_level AS "qualificationLevel",
              interest_level AS "interestLevel", maturity_score AS "maturityScore",
              status, assigned_admin AS "assignedAdmin",
              last_contacted_at AS "lastContactedAt", notes,
              consent_contact AS "consentContact",
              evaluating_90_days AS "evaluating90Days",
              created_at AS "createdAt",
              min(created_at) OVER () AS "firstSeen"
       FROM leads WHERE lower(btrim(email)) = :email
       ORDER BY created_at ASC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const row = acq[0] ?? null;
    if (row) {
      row.leadScoreMax = LEAD_SCORE_MAX;
      if (POST_CONVERSION_STAGES.includes(person.stage)) {
        // Suppressed on the SERVER, not hidden in the UI: an intent score that
        // reaches the browser is one a future component can render by accident.
        row.temperature = null;
        row.temperatureUpdatedAt = null;
        row.leadScore = null;
        profile.intentSuppressedReason =
          'Intent and temperature are hidden for enrolled people. They score how likely '
          + 'someone is to convert, and this person already has.';
      }
    }
    profile.acquisition = row;
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

  // ── Appointments and automation, both lead-page parity ────────────────────
  if (may('acquisition', query.sections)) {
    const leadIdForPanels = profile.acquisition?.leadId ?? null;
    if (leadIdForPanels !== null) {
      // Booked time, from both places it is recorded. A strategy call and an
      // appointment are the same fact to a reader, and splitting them across two
      // panels is how someone concludes there is nothing booked.
      profile.appointments = await sequelize.query<AppointmentRow>(
        `SELECT 'appointment' AS kind, title, scheduled_at AS "scheduledAt",
                status::text AS status, outcome_notes AS notes, NULL AS "meetLink"
         FROM appointments WHERE lead_id = :leadId
         UNION ALL
         SELECT 'strategy_call' AS kind, 'Strategy call' AS title, scheduled_at AS "scheduledAt",
                status::text AS status, notes, meet_link AS "meetLink"
         FROM strategy_calls WHERE lead_id = :leadId
         ORDER BY "scheduledAt" DESC NULLS LAST`,
        { type: QueryTypes.SELECT, replacements: { leadId: leadIdForPanels } },
      );

      profile.automation = await sequelize.query<AutomationRow>(
        `SELECT type, status, provider_response AS detail, created_at AS "createdAt"
         FROM automation_logs
         WHERE related_type = 'lead' AND related_id = :leadIdText
         ORDER BY created_at DESC LIMIT 50`,
        { type: QueryTypes.SELECT, replacements: { leadIdText: String(leadIdForPanels) } },
      );
    } else {
      profile.appointments = [];
      profile.automation = [];
    }
  }

  // ── Journey summary and the unified timeline ──────────────────────────────
  //
  // Both need the person's source-record ids. Resolved once, here, rather than
  // per branch: the same email keys both, and re-deriving it in every query
  // would let them drift apart about who this person is.
  const leadRows = await sequelize.query<{ id: number }>(
    `SELECT id FROM leads WHERE lower(btrim(email)) = :email`,
    { type: QueryTypes.SELECT, replacements: { email } },
  );
  const leadIds = leadRows.map((r) => r.id);

  // Enrolment ids respect the mentor narrowing, so a mentor's timeline cannot
  // carry learning events from a learner outside their scope.
  const scoped = query.visibleEnrollmentIds;
  const enrollmentIds =
    scoped !== null && scoped.length === 0
      ? []
      : (profile.learning ?? []).map((l) => l.enrollmentId).length > 0
        ? (profile.learning ?? []).map((l) => l.enrollmentId)
        : (
            await sequelize.query<{ id: string }>(
              `SELECT id FROM enrollments WHERE lower(btrim(email)) = :email
               ${scoped === null ? '' : 'AND id IN (:ids)'}`,
              {
                type: QueryTypes.SELECT,
                replacements: scoped === null ? { email } : { email, ids: scoped },
              },
            )
          ).map((r) => r.id);

  const domains = domainsForSections(query.sections);
  profile.timelineDomains = domains;
  profile.timeline = await getPersonTimeline({
    leadIds,
    enrollmentIds,
    domains,
    limit: 150,
  });

  profile.journey = await buildJourney(email, leadIds, enrollmentIds, query.sections, profile.timeline);

  // ── Data & trust ──────────────────────────────────────────────────────────
  //
  // The gaps are derived from what the lifecycle contract already records as
  // unjoinable, plus what is genuinely absent for THIS person — so the list is
  // specific rather than a generic disclaimer nobody reads.
  const gaps: Array<{ field: string; reason: string }> = [];
  if (leadIds.length === 0) {
    gaps.push({
      field: 'Acquisition history',
      reason: 'No lead record. This person enrolled without ever being captured as a lead, '
        + 'so there is nothing recorded about how they found us.',
    });
  }
  if (profile.acquisition && profile.acquisition.consentContact === null) {
    gaps.push({
      field: 'Contact consent',
      reason: 'Never recorded. This is not the same as consent being refused.',
    });
  }
  // Corrected 2026-09-08. The earlier wording said no completion state existed —
  // it does: 'completed' is a value in enum_enrollments_status and the stage
  // expression now reads it. The real gap is that NOTHING SETS IT.
  gaps.push({
    field: 'Graduation',
    reason: 'Computable but never set. enrollments.status supports "completed", and this profile '
      + 'reads it, but no enrolment has ever carried it (464 active, 62 withdrawn, 0 completed as '
      + 'of 2026-09-08). Nothing marks a student complete when their cohort ends, so an empty '
      + 'graduate count means "not recorded", not "did not graduate".',
  });
  gaps.push({
    field: 'Placement and employment',
    reason: 'Not tracked anywhere in this database, so outcomes beyond graduation cannot be '
      + 'reported at all.',
  });
  if (enrollmentIds.length > 0) {
    gaps.push({
      field: 'Lifetime revenue',
      reason: 'No local payments table. Transactions live in PaySimple and are not yet joined, '
        + 'so per-person revenue is unavailable rather than zero.',
    });
  }

  profile.trust = {
    leadIds,
    enrollmentIds,
    matchMethod: leadIds.length > 0 && enrollmentIds.length > 0 ? 'exact_email' : 'none',
    tracedToLead: profile.tracedToLead,
    consentRecorded: profile.acquisition?.consentContact ?? null,
    lastActivity: profile.journey.lastActivity,
    gaps,
  };

  // The KPI has to obey the same rule as the field, or the header contradicts
  // the panel below it — which is worse than showing the number in both places.
  if (POST_CONVERSION_STAGES.includes(person.stage)) {
    profile.journey.intentScore = null;
  }

  return profile;
}

/**
 * The counts above the detail.
 *
 * Counted from the source tables rather than inferred from the timeline page,
 * because the timeline is capped at 150 events and a count taken from it would
 * silently understate anyone busier than that.
 */
async function buildJourney(
  email: string,
  leadIds: number[],
  enrollmentIds: string[],
  sections: readonly string[],
  timeline: TimelineEvent[],
): Promise<JourneySummary> {
  const hasLeads = leadIds.length > 0;

  const counts = hasLeads
    ? (
        await sequelize.query<{
          sessions: string; page_events: string; campaigns: string;
          emails: string; first_touch: string | null; intent: string | null;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM visitor_sessions WHERE lead_id IN (:leadIds))::text AS sessions,
             (SELECT COUNT(*) FROM page_events WHERE lead_id IN (:leadIds) AND event_type <> 'heartbeat')::text AS page_events,
             (SELECT COUNT(*) FROM campaign_leads WHERE lead_id IN (:leadIds))::text AS campaigns,
             (SELECT COUNT(*) FROM scheduled_emails WHERE lead_id IN (:leadIds) AND sent_at IS NOT NULL)::text AS emails,
             (SELECT MIN(created_at) FROM leads WHERE id IN (:leadIds)) AS first_touch,
             (SELECT MAX(score)::text FROM intent_scores WHERE lead_id IN (:leadIds)) AS intent`,
          { type: QueryTypes.SELECT, replacements: { leadIds } },
        )
      )[0]
    : null;

  const firstTouch = counts?.first_touch ?? null;
  const lastActivity = timeline.length > 0 ? timeline[0].occurredAt : null;

  return {
    firstTouch,
    lastActivity,
    // null, not 0, when there is no first touch to measure from.
    daysKnown: firstTouch
      ? Math.max(0, Math.round((Date.now() - new Date(firstTouch).getTime()) / 86400000))
      : null,
    sessions: Number(counts?.sessions ?? 0),
    pageEvents: Number(counts?.page_events ?? 0),
    campaigns: Number(counts?.campaigns ?? 0),
    emailsSent: Number(counts?.emails ?? 0),
    enrollments: enrollmentIds.length,
    // Sales data. Withheld rather than shown as 0 when the caller lacks it.
    intentScore:
      sections.includes('leads') || sections.includes('revenue') || sections.includes('lead_ingestion')
        ? (counts?.intent != null ? Number(counts.intent) : null)
        : null,
  };
}
