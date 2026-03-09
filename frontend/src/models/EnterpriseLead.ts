export interface EnterpriseLead {
  // Identity
  fullName: string;
  email: string;
  phone?: string;

  // Company
  company?: string;
  title?: string;
  companySize?: string;
  industry?: string;

  // AI Initiative Context
  roleInAIInitiative?: string;
  aiMaturityLevel?: string;
  primaryObjective?: string[];

  // Sponsorship & Budget
  willSeekCorporateSponsorship?: boolean;
  budgetOwner?: string;
  timeline?: string;

  // Cohort
  cohortInterest?: string;
  cohortStartDate?: string;

  // Tracking
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  pageOrigin?: string;
  formType: string;

  // Optional
  message?: string;
  consentContact?: boolean;

  // Scoring (frontend-computed)
  intentScore?: number;
}

/**
 * Transform an EnterpriseLead into a payload compatible with the backend leadSchema.
 *
 * Backend accepts: name, email, company, role, phone, title, company_size,
 * evaluating_90_days, interest_area, message, source, form_type,
 * consent_contact, utm_source, utm_campaign, page_url
 *
 * Extra fields are serialized into message and interest_area.
 */
export function toLeadPayload(lead: EnterpriseLead): Record<string, unknown> {
  const extras: string[] = [];

  if (lead.industry) extras.push(`Industry: ${lead.industry}`);
  if (lead.roleInAIInitiative) extras.push(`Role in AI Initiative: ${lead.roleInAIInitiative}`);
  if (lead.aiMaturityLevel) extras.push(`AI Maturity: ${lead.aiMaturityLevel}`);
  if (lead.budgetOwner) extras.push(`Budget Owner: ${lead.budgetOwner}`);
  if (lead.timeline) extras.push(`Timeline: ${lead.timeline}`);
  if (lead.cohortInterest) extras.push(`Cohort Interest: ${lead.cohortInterest}`);
  if (lead.cohortStartDate) extras.push(`Preferred Start: ${lead.cohortStartDate}`);
  if (lead.intentScore !== undefined) extras.push(`Intent Score: ${lead.intentScore}`);

  const baseMessage = lead.message || '';
  const extraBlock = extras.length > 0 ? `\n---\n${extras.join('\n')}` : '';

  return {
    name: lead.fullName,
    email: lead.email,
    phone: lead.phone || undefined,
    company: lead.company || undefined,
    title: lead.title || undefined,
    company_size: lead.companySize || undefined,
    role: lead.industry || undefined,
    evaluating_90_days: lead.willSeekCorporateSponsorship ?? undefined,
    interest_area: lead.primaryObjective?.join(', ') || undefined,
    message: (baseMessage + extraBlock).trim() || undefined,
    form_type: lead.formType,
    consent_contact: lead.consentContact ?? undefined,
    utm_source: lead.utmMedium
      ? `${lead.utmSource || 'direct'}|${lead.utmMedium}`
      : lead.utmSource || undefined,
    utm_campaign: lead.utmCampaign || undefined,
    page_url: lead.pageOrigin || undefined,
  };
}
