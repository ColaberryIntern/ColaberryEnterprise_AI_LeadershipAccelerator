import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { LifecycleStage } from './lifecycle';
import { normalizeEmail } from './identityResolution';
import { visibleStagesForSections } from './personScope';
import { EventDomain, TimelineEvent, domainsForSections, getPersonTimeline } from './personTimelineService';
import {
  AcquisitionPanel, AppointmentRow, AutomationRow,
  INTENT_SUPPRESSED_REASON, POST_CONVERSION_STAGES,
  loadAcquisition, loadAppointments, loadAutomation,
} from './panels/acquisitionPanels';
import { JourneySummary, buildJourney } from './panels/journeyPanel';
import { ClassActivityPanel, CurriculumPanel, loadClassActivity, loadCurriculum } from './panels/classPanels';
import { WorkPanel, loadWork } from './panels/workPanels';
import { AccountPanel, BillingDetailPanel, loadAccount, loadBillingDetail } from './panels/accountPanels';
import { CommunicationsPanel, loadCommunications } from './panels/communicationPanels';
import { CcppHistory, loadCcppHistory } from './panels/historyPanels';
import {
  CommunityPanel, ContentPanel, MentorPanel, ProfileContextPanel, SkillsPanel,
  loadCommunity, loadContent, loadMentor, loadProfileContext, loadSkills,
} from './panels/growthPanels';

/**
 * The 360° person profile — the composer.
 *
 * Panel LOADERS live in ./panels. This file decides who may see what, resolves
 * the person's source-record ids once, and assembles the result. It was split
 * on 2026-09-09 when it passed the 500-line ceiling and an audit of every
 * person-keyed table added twelve more panels.
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
 * `visibleEnrollmentIds` says WHICH learners. `null` from that helper means "no
 * filter" (an admin) and `[]` means "a mentor with no grants, who must see
 * nothing". Collapsing the two is the classic way a scoped surface shows
 * everything, so they are handled separately below.
 *
 * Every enrolment-keyed panel is fed the ALREADY-NARROWED id list, so the
 * narrowing cannot be forgotten one panel at a time.
 */

export type {
  AcquisitionPanel, AppointmentRow, AutomationRow,
} from './panels/acquisitionPanels';
export type { JourneySummary } from './panels/journeyPanel';
export type { ClassActivityPanel, CurriculumPanel } from './panels/classPanels';
export type { WorkPanel, ProjectRow, CaseStudyRow, CapstoneRow, CertPrepPanel } from './panels/workPanels';
export type { AccountPanel, BillingDetailPanel, SubscriptionRow } from './panels/accountPanels';
export type {
  CommunicationsPanel, CommunicationThread, CommunicationMessage,
} from './panels/communicationPanels';
export type { CcppHistory, CcppEnrolment, CcppDisc } from './panels/historyPanels';
export type {
  SkillsPanel, MentorPanel, ContentPanel, CommunityPanel, ProfileContextPanel,
} from './panels/growthPanels';

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
  leadIds: number[];
  enrollmentIds: string[];
  matchMethod: 'exact_email' | 'none';
  tracedToLead: boolean;
  consentRecorded: boolean | null;
  lastActivity: string | null;
  gaps: Array<{ field: string; reason: string }>;
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
  appointments?: AppointmentRow[];
  automation?: AutomationRow[];
  /** Added 2026-09-09: what they did, built, pay, and who they belong to. */
  classActivity?: ClassActivityPanel | null;
  curriculum?: CurriculumPanel | null;
  work?: WorkPanel | null;
  account?: AccountPanel | null;
  billingDetail?: BillingDetailPanel | null;
  /** Every communication, threaded by campaign. Added 2026-09-10. */
  communications?: CommunicationsPanel | null;
  /** What they did with Colaberry BEFORE this platform. Added 2026-09-10. */
  history?: CcppHistory | null;
  skills?: SkillsPanel | null;
  mentor?: MentorPanel | null;
  content?: ContentPanel | null;
  community?: CommunityPanel | null;
  profileContext?: ProfileContextPanel | null;
  /**
   * Why intent and temperature are absent, when they are.
   *
   * They are acquisition signals. Once somebody has enrolled, "this student is
   * hot" tells a reader nothing they can act on — the question that scoring
   * answered has already been answered by the enrolment.
   */
  intentSuppressedReason?: string;
  trust?: TrustPanel;
  journey?: JourneySummary;
  timeline?: TimelineEvent[];
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

/** Which section grants which panel. One place, so a panel cannot drift. */
const PANEL_SECTIONS: Record<string, readonly string[]> = {
  acquisition: ['leads', 'revenue', 'lead_ingestion'],
  learning: ['students', 'program', 'career_review'],
  billing: ['revenue'],
  engagement: ['campaigns'],
  // Programme surfaces: what they did and built.
  programme: ['students', 'program', 'career_review'],
  // Commercial identity is read by both the revenue side and the programme side.
  account: ['revenue', 'students', 'program'],
  // Mirrors the timeline's `communication` domain, so a caller who may read
  // communication events on the timeline may also read them threaded.
  communications: ['leads', 'revenue', 'campaigns', 'inbox_content'],
  // Pre-platform customer history. Carries fees and placement outcomes, so it
  // reads to the commercial and programme sides, not to a bare support role.
  history: ['leads', 'revenue', 'students', 'program'],
};

function may(panel: string, sections: readonly string[]): boolean {
  return (PANEL_SECTIONS[panel] ?? []).some((s) => sections.includes(s));
}

/** Whether a caller with these sections may read a named panel. The one rule, exported for per-panel endpoints. */
export function mayReadPanel(panel: string, sections: readonly string[]): boolean {
  return may(panel, sections);
}

export interface PersonIdentity {
  email: string;
  name: string | null;
  stage: LifecycleStage;
  company: string | null;
  title: string | null;
  traced: boolean;
}

/**
 * Who this is and whether the caller may see them — the gate every per-person
 * read passes through, extracted so a panel-scoped endpoint (one message's
 * content, say) enforces the SAME stage scope as the full profile without
 * loading the full profile to do it.
 *
 * Returns null for "not found" and "not yours" alike; see getPersonProfile.
 */
export async function resolvePersonIdentity(
  rawEmail: string,
  sections: readonly string[],
): Promise<PersonIdentity | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  const visibleStages = visibleStagesForSections(sections);
  if (visibleStages.length === 0) return null;

  const rows = await sequelize.query<PersonIdentity>(
    `SELECT COALESCE(l.email, e.email) AS email,
            COALESCE(e.name, l.name) AS name,
            COALESCE(e.company, l.company) AS company,
            COALESCE(e.title, l.title) AS title,
            (CASE
               WHEN e.status = 'withdrawn' THEN 'lapsed'
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
              -- Any CURRENT enrolment outranks a withdrawn one: someone who left
              -- a cohort and re-enrolled is active, not lapsed.
              --
              -- Written as bool_or rather than MAX(status). MAX is alphabetical,
              -- so 'withdrawn' beat 'active' and mislabelled all 29 people who
              -- had ever re-enrolled — shipped 2026-09-08, caught 2026-09-09 by
              -- a profile that read "lapsed" over a live enrolment.
              CASE
                WHEN bool_or(status::text = 'active') THEN 'active'
                WHEN bool_or(status::text = 'completed') THEN 'completed'
                ELSE 'withdrawn'
              END AS status
       FROM enrollments WHERE lower(btrim(email)) = :email GROUP BY lower(btrim(email))
     ) e ON e.email = l.email`,
    { type: QueryTypes.SELECT, replacements: { email } },
  );

  const person = rows[0];
  if (!person) return null;

  // Stage scope. A support identity must not reach a lead's profile by typing
  // the address, even though it may open the People surface.
  if (!visibleStages.includes(person.stage)) return null;
  return person;
}

/**
 * Read one person's profile, or null when this caller may not see them.
 *
 * Returns null rather than an empty profile for someone outside scope: an empty
 * profile confirms the person EXISTS, which is itself a disclosure. "Not found"
 * and "not yours" must look identical from outside.
 */
export async function getPersonProfile(query: ProfileQuery): Promise<PersonProfile | null> {
  const person = await resolvePersonIdentity(query.email, query.sections);
  if (!person) return null;
  const email = person.email;

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
    const row = await loadAcquisition(email);
    if (row && POST_CONVERSION_STAGES.includes(person.stage)) {
      // Suppressed on the SERVER, not hidden in the UI: an intent score that
      // reaches the browser is one a future component can render by accident.
      row.temperature = null;
      row.temperatureUpdatedAt = null;
      row.leadScore = null;
      profile.intentSuppressedReason = INTENT_SUPPRESSED_REASON;
    }
    profile.acquisition = row;
  } else {
    profile.withheldPanels.push('acquisition');
  }

  // ── Learning enrolments, narrowed a second time for a mentor ──────────────
  const scoped = query.visibleEnrollmentIds;
  const mentorWithNoGrants = scoped !== null && scoped.length === 0;

  if (may('learning', query.sections)) {
    if (mentorWithNoGrants) {
      // A mentor with no grants. Not an empty list of enrolments — no access.
      profile.learning = [];
    } else {
      profile.learning = await sequelize.query<LearningPanel>(
        `SELECT id AS "enrollmentId", cohort_id AS "cohortId", status::text AS status,
                tier, enrollment_type AS "enrollmentType", enrolled_at AS "enrolledAt"
         FROM enrollments
         WHERE lower(btrim(email)) = :email ${scoped === null ? '' : 'AND id IN (:ids)'}
         ORDER BY created_at DESC`,
        {
          type: QueryTypes.SELECT,
          replacements: scoped === null ? { email } : { email, ids: scoped },
        },
      );
    }
  } else {
    profile.withheldPanels.push('learning');
  }

  // ── Billing (the enrolment's own payment columns) ─────────────────────────
  if (may('billing', query.sections)) {
    profile.billing = await sequelize.query<BillingPanel>(
      `SELECT id AS "enrollmentId", payment_status::text AS "paymentStatus",
              payment_method::text AS "paymentMethod", amount_paid AS "amountPaid"
       FROM enrollments WHERE lower(btrim(email)) = :email
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
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

  // ── Source-record ids, resolved once ──────────────────────────────────────
  //
  // The same email keys both, and re-deriving it per panel would let them drift
  // apart about who this person is.
  const leadRows = await sequelize.query<{ id: number }>(
    `SELECT id FROM leads WHERE lower(btrim(email)) = :email`,
    { type: QueryTypes.SELECT, replacements: { email } },
  );
  const leadIds = leadRows.map((r) => r.id);

  const enrollmentIds = mentorWithNoGrants
    ? []
    : (profile.learning ?? []).length > 0
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

  // ── Appointments and automation, both lead-page parity ────────────────────
  if (may('acquisition', query.sections)) {
    const leadIdForPanels = profile.acquisition?.leadId ?? null;
    profile.appointments = leadIdForPanels !== null ? await loadAppointments(leadIdForPanels) : [];
    profile.automation = leadIdForPanels !== null ? await loadAutomation(leadIdForPanels) : [];
  }

  // ── Programme panels: what they did, built and learned ────────────────────
  //
  // Every one of these is enrolment-keyed, so an empty id list (a mentor with
  // no grants, or a person who never enrolled) yields null rather than a query.
  if (may('programme', query.sections)) {
    const [classActivity, curriculum, work, skills, mentor, content, community, context] =
      await Promise.all([
        loadClassActivity(enrollmentIds),
        loadCurriculum(enrollmentIds),
        loadWork(enrollmentIds),
        loadSkills(enrollmentIds),
        loadMentor(enrollmentIds),
        loadContent(enrollmentIds),
        loadCommunity(enrollmentIds),
        loadProfileContext(enrollmentIds),
      ]);
    profile.classActivity = classActivity;
    profile.curriculum = curriculum;
    profile.work = work;
    profile.skills = skills;
    profile.mentor = mentor;
    profile.content = content;
    profile.community = community;
    profile.profileContext = context;
  } else {
    profile.withheldPanels.push('programme');
  }

  // ── Commercial identity and subscription history ──────────────────────────
  if (may('account', query.sections)) {
    profile.account = await loadAccount(enrollmentIds, leadIds);
  } else {
    profile.withheldPanels.push('account');
  }

  if (may('billing', query.sections)) {
    profile.billingDetail = await loadBillingDetail(enrollmentIds);
  }

  // ── Communications, threaded by campaign ──────────────────────────────────
  if (may('communications', query.sections)) {
    profile.communications = await loadCommunications(leadIds);
  } else {
    profile.withheldPanels.push('communications');
  }

  // ── Pre-platform history from CCPP ────────────────────────────────────────
  //
  // Degraded, never fatal: loadCcppHistory returns `available: false` with a
  // reason rather than throwing, so a CCPP outage cannot take the profile down.
  if (may('history', query.sections)) {
    profile.history = await loadCcppHistory(email);
  } else {
    profile.withheldPanels.push('history');
  }

  // ── Journey summary and the unified timeline ──────────────────────────────
  const domains = domainsForSections(query.sections);
  profile.timelineDomains = domains;
  profile.timeline = await getPersonTimeline({ leadIds, enrollmentIds, domains, limit: 150 });
  profile.journey = await buildJourney(leadIds, enrollmentIds, query.sections, profile.timeline);

  profile.trust = buildTrust(profile, leadIds, enrollmentIds);

  // The KPI has to obey the same rule as the field, or the header contradicts
  // the panel below it — which is worse than showing the number in both places.
  if (POST_CONVERSION_STAGES.includes(person.stage)) {
    profile.journey.intentScore = null;
  }

  return profile;
}

/**
 * What we cannot say about this person, and why.
 *
 * Derived from what the lifecycle contract records as unjoinable plus what is
 * genuinely absent for THIS person, so the list is specific rather than a
 * generic disclaimer nobody reads.
 */
function buildTrust(
  profile: PersonProfile,
  leadIds: number[],
  enrollmentIds: string[],
): TrustPanel {
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
  gaps.push({
    field: 'Graduation',
    reason: 'Computable but never set. enrollments.status supports "completed", and this profile '
      + 'reads it, but no enrolment has ever carried it (464 active, 24 lapsed, 0 completed as '
      + 'of 2026-09-09). Nothing marks a student complete when their cohort ends, so an empty '
      + 'graduate count means "not recorded", not "did not graduate".',
  });
  gaps.push({
    field: 'Placement and employment',
    reason: 'Not tracked anywhere in this database, so outcomes beyond graduation cannot be '
      + 'reported at all.',
  });
  if (enrollmentIds.length > 0) {
    gaps.push({
      field: 'Payment transactions',
      reason: 'Subscription STATE is local and shown above, but the individual charges live in '
        + 'PaySimple and are not joined. A failed subscription row proves a collection failed; '
        + 'it does not tell you the amount actually collected to date.',
    });
    if (profile.classActivity && profile.classActivity.attendanceTotal === 0) {
      gaps.push({
        field: 'Attendance',
        reason: 'No register was taken for this person\'s sessions. Content consumption and '
          + 'curriculum progress are the reliable engagement signals here, not attendance.',
      });
    }
  }

  return {
    leadIds,
    enrollmentIds,
    matchMethod: leadIds.length > 0 && enrollmentIds.length > 0 ? 'exact_email' : 'none',
    tracedToLead: profile.tracedToLead,
    consentRecorded: profile.acquisition?.consentContact ?? null,
    lastActivity: profile.journey?.lastActivity ?? null,
    gaps,
  };
}
