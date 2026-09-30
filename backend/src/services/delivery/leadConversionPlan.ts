/**
 * leadConversionPlan — decide what converting a lead should produce, without writing it.
 *
 * The write half lives in `leadConversion.ts`. This half holds every judgement: whether
 * the lead can be converted at all, what the engagement and project should be called,
 * which rows already exist, and therefore which must be created.
 *
 * ## Why the split
 *
 * It follows the shape already used here for client acceptance - `clientAcceptanceService`
 * decides, `clientAcceptance` persists - and for the same reason. Every delivery test in
 * this codebase runs without a database, because the decisions were kept separable from
 * the I/O. A conversion planner that needed a live Postgres to assert "a second run
 * creates nothing" would be a test nobody runs, and the second-run behaviour is the exact
 * property most worth pinning.
 *
 * So the interesting cases here - a replay, a half-written chain, a lead with no email -
 * are ordinary function calls with ordinary inputs.
 */

export type ConversionRefusalReason =
  | 'no_such_lead'
  | 'lead_has_no_email'
  | 'lead_has_no_company'
  | 'no_such_brand';

export interface ConversionRefusal {
  refused: true;
  reason: ConversionRefusalReason;
  detail: string;
}

/** The fields of a lead this decision actually depends on. */
export interface LeadFacts {
  id: number;
  email: string | null;
  company: string | null;
  name?: string | null;
  message?: string | null;
}

/** What the database already holds for this lead. Every field is optional by nature. */
export interface ExistingChain {
  organizationId?: string | null;
  engagementId?: string | null;
  identityId?: string | null;
  projectId?: string | null;
  membershipId?: string | null;
}

export interface ConversionPlan {
  refused: false;
  /**
   * True when anything at all still has to be written.
   *
   * Deliberately NOT "the engagement is missing". A previous run that died between the
   * engagement and the membership leaves a lead that looks converted and has a client who
   * cannot sign in; treating that as done would strand them permanently.
   */
  createsAnything: boolean;
  organizationName: string;
  engagementName: string;
  engagementType: 'commercial_client';
  projectName: string;
  projectSlug: string;
  projectClass: 'commercial_client';
  projectStatus: 'discovery';
  businessProblem: string | null;
  clientEmail: string;
  clientDisplayName: string | null;
  /** Which steps are already satisfied, so the writer can skip them. */
  reuse: Required<{ [K in keyof ExistingChain]: boolean }>;
}

/** Lowercase, hyphenated, and short enough for the column (120). */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 110)
    // Stripped AGAIN after truncation, not only before it. Cutting at 110 characters can
    // land exactly on a separator, and the first strip has already run by then - so a
    // long name produced a slug ending in a hyphen.
    .replace(/-+$/, '');
  // An all-symbol company name would otherwise produce an empty slug and violate a NOT
  // NULL column at write time, which is a failure a long way from its cause.
  return slug || 'project';
}

export interface PlanInput {
  lead: LeadFacts | null;
  /** Null when no brand was requested; false when one was requested and does not exist. */
  brandExists: boolean | null;
  existing?: ExistingChain;
  engagementName?: string;
  projectName?: string;
}

export function planConversion(input: PlanInput): ConversionPlan | ConversionRefusal {
  const { lead } = input;
  if (!lead) {
    return { refused: true, reason: 'no_such_lead', detail: 'the lead does not exist' };
  }
  // Checked before company so the operator hears about the blocking problem first: a
  // client with no address can never be given a session, whatever else is present.
  if (!lead.email || !lead.email.trim()) {
    return {
      refused: true,
      reason: 'lead_has_no_email',
      detail: `lead ${lead.id} has no email, so its client could never sign in`,
    };
  }
  if (!lead.company || !lead.company.trim()) {
    return {
      refused: true,
      reason: 'lead_has_no_company',
      detail: `lead ${lead.id} has no company, and an organization needs a name`,
    };
  }
  if (input.brandExists === false) {
    return { refused: true, reason: 'no_such_brand', detail: 'the requested brand does not exist' };
  }

  const company = lead.company.trim();
  const existing = input.existing ?? {};
  const reuse = {
    organizationId: Boolean(existing.organizationId),
    engagementId: Boolean(existing.engagementId),
    identityId: Boolean(existing.identityId),
    projectId: Boolean(existing.projectId),
    membershipId: Boolean(existing.membershipId),
  };
  const projectName = input.projectName?.trim() || `${company} - initial build`;

  return {
    refused: false,
    createsAnything: Object.values(reuse).some((satisfied) => !satisfied),
    organizationName: company,
    engagementName: input.engagementName?.trim() || `${company} - delivery`,
    engagementType: 'commercial_client',
    projectName,
    projectSlug: slugify(projectName),
    projectClass: 'commercial_client',
    projectStatus: 'discovery',
    // The client's own words, carried across rather than re-summarised by us. Empty is
    // normal - an intake form with no message is common and is not a failure.
    businessProblem: lead.message?.trim() || null,
    clientEmail: lead.email.trim(),
    clientDisplayName: lead.name?.trim() || null,
    reuse,
  };
}
