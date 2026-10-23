import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * Everything the Lead detail page shows, plus what it does not.
 *
 * Extracted from personProfileService on 2026-09-09 when that file passed the
 * 500-line ceiling and CLAUDE.md's composition rule required a split before
 * new panels could be added.
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
  /**
   * T211: the GHL contact id, when there is one. NO person view read this
   * column before — so an operator could not tell whether a person existed in
   * the CRM at all. Null means no linkage recorded, which is a real and common
   * state (a withheld sync leaves it null on purpose) and must read as absent
   * rather than as a failure.
   */
  ghlContactId: string | null;
  /**
   * Deep link to this person in the CRM sub-account they actually live in. Null when there is no
   * contact, or when the brand's key is not on file, because a link to the wrong account shows an
   * empty record rather than an error and reads as missing data.
   */
  ghlContactUrl?: string | null;
  /** The denominator the Lead page shows beside the score. */
  leadScoreMax: number;
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

/** The Lead page's score denominator, kept here so both surfaces agree. */
export const LEAD_SCORE_MAX = 105;

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
export const POST_CONVERSION_STAGES: readonly string[] = [
  'enrolled_student', 'active_learner', 'graduate', 'returning_customer',
];

export const INTENT_SUPPRESSED_REASON =
  'Intent and temperature are hidden for enrolled people. They score how likely '
  + 'someone is to convert, and this person already has.';

/** The lead record, or null when this person was never captured as a lead. */
export async function loadAcquisition(email: string): Promise<AcquisitionPanel | null> {
  const rows = await sequelize.query<AcquisitionPanel>(
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
            ghl_contact_id AS "ghlContactId",
            min(created_at) OVER () AS "firstSeen"
     FROM leads WHERE lower(btrim(email)) = :email
     ORDER BY created_at ASC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { email } },
  );

  const row = rows[0] ?? null;
  if (row) {
    row.leadScoreMax = LEAD_SCORE_MAX;
    // The deep link to this person in the CRM, resolved through the same routing the sync uses,
    // so it points at the sub-account they are actually in. Null whenever we cannot say, which
    // the UI renders as no link rather than as a link to an empty record.
    /**
     * The CRM deep link. BEST EFFORT, and lazily imported, for two separate reasons.
     *
     * Lazy, because the convention ghlService itself documents: a top-level import reaches
     * settingsService -> SystemSetting -> config/database and constructs Sequelize at module
     * load, which breaks every consumer without a DATABASE_URL. Importing it eagerly took this
     * file's own suite from passing to zero tests collected.
     *
     * Best effort, because a convenience link must never be able to empty a person's profile.
     * Moving the import to lazy only moved that failure from load time to call time, and three
     * more suites went red. Logged with a class rather than swallowed, so a real outage is
     * traceable instead of silently rendering every person as "not in the CRM".
     */
    try {
      const { ghlContactUrl } = await import('../../leads/ghlContactLink');
      row.ghlContactUrl = await ghlContactUrl(row.source, row.ghlContactId);
    } catch (error) {
      row.ghlContactUrl = null;
      console.error('[acquisition] GHL contact link unavailable', {
        error_class: error instanceof Error ? error.constructor.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return row;
}

/**
 * Booked time, from both places it is recorded.
 *
 * A strategy call and an appointment are the same fact to a reader, and
 * splitting them across two panels is how someone concludes there is nothing
 * booked.
 */
export async function loadAppointments(leadId: number): Promise<AppointmentRow[]> {
  return sequelize.query<AppointmentRow>(
    `SELECT 'appointment' AS kind, title, scheduled_at AS "scheduledAt",
            status::text AS status, outcome_notes AS notes, NULL AS "meetLink"
     FROM appointments WHERE lead_id = :leadId
     UNION ALL
     SELECT 'strategy_call' AS kind, 'Strategy call' AS title, scheduled_at AS "scheduledAt",
            status::text AS status, notes, meet_link AS "meetLink"
     FROM strategy_calls WHERE lead_id = :leadId
     ORDER BY "scheduledAt" DESC NULLS LAST`,
    { type: QueryTypes.SELECT, replacements: { leadId } },
  );
}

export async function loadAutomation(leadId: number): Promise<AutomationRow[]> {
  return sequelize.query<AutomationRow>(
    `SELECT type, status, provider_response AS detail, created_at AS "createdAt"
     FROM automation_logs
     WHERE related_type = 'lead' AND related_id = :leadIdText
     ORDER BY created_at DESC LIMIT 50`,
    { type: QueryTypes.SELECT, replacements: { leadIdText: String(leadId) } },
  );
}
