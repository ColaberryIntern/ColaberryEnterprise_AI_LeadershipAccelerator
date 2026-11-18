/**
 * needGrouping - pure, deterministic semantic grouping layer for gov proposal "Needs".
 *
 * Two axes give a need its identity:
 *   - GROUP  : the SHAPE of the answer - a fact in a taxonomy category, or a reference / personnel RECORD.
 *   - SUBJECT: what the ask is ABOUT (reporting, recruiting, data work, ...), so records are not
 *              interchangeable. A reporting reference must never satisfy a recruiting requirement.
 *
 * The 100+ flat near-duplicate needs ("project name 1", "project name 2", "specific project names",
 * "What are the specific project names?") all normalize to ONE concept (past_performance), so they
 * collapse into one group instead of one row each. Subject is a property of the project / requirement,
 * NOT of a generic "[RECORD: reference]" ask, so it is derived from surrounding context (deriveSubject)
 * and attached separately, then folded into the canonical id.
 *
 * No I/O, no imports. The AI classifier (needClassifier) handles only the long tail this cannot place.
 */

export type GroupKind = 'fact' | 'reference' | 'personnel';

/** The taxonomy seed: the groups needs fold into. Mirrors the library's FACT_CATEGORIES plus the two
 *  record groups and a solicitation bucket. Single source of truth for the gov_requirement_categories seed. */
export const GROUP_DEFS: ReadonlyArray<{ slug: string; label: string; kind: GroupKind }> = [
  { slug: 'registrations', label: 'Registrations (SAM, UEI, CAGE, DUNS)', kind: 'fact' },
  { slug: 'reps_certs', label: 'Representations and Certifications', kind: 'fact' },
  { slug: 'socioeconomic', label: 'Socioeconomic status (8a, HUBZone, SDVOSB, WOSB)', kind: 'fact' },
  { slug: 'financials', label: 'Financials, insurance and bonding', kind: 'fact' },
  { slug: 'quality_certs', label: 'Quality certifications (ISO, CMMI)', kind: 'fact' },
  { slug: 'pricing', label: 'Pricing and rate card', kind: 'fact' },
  { slug: 'solicitation', label: 'Solicitation facts (client, dates, contacts)', kind: 'fact' },
  { slug: 'past_performance', label: 'Past projects and references', kind: 'reference' },
  { slug: 'key_personnel', label: 'Key personnel', kind: 'personnel' },
  { slug: 'general', label: 'General', kind: 'fact' },
];

const GROUP_LABEL = new Map(GROUP_DEFS.map((g) => [g.slug, g.label]));

/** Subjects a requirement can be about. 'general' is the subject-agnostic default. */
export const SUBJECT_DEFS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'reporting', label: 'Reporting and analytics' },
  { slug: 'recruiting', label: 'Recruiting and staffing' },
  { slug: 'data', label: 'Data engineering and integration' },
  { slug: 'security', label: 'Security and compliance' },
  { slug: 'training', label: 'Training and curriculum' },
  { slug: 'asset_mgmt', label: 'Asset management and permitting' },
  { slug: 'software', label: 'Software and application development' },
  { slug: 'general', label: 'General' },
];

export interface ConceptMatch {
  /** stable concept id within a group; different phrasings of the same thing share it */
  conceptId: string;
  /** human label for the concept / its group */
  label: string;
  groupSlug: string;
  groupKind: GroupKind;
}

interface ConceptRule {
  conceptId: string;
  label: string;
  groupSlug: string;
  groupKind: GroupKind;
  patterns: RegExp[];
}

/**
 * Concept rules, most specific first. High precision on purpose: an ambiguous ask falls through to
 * the 'general' bucket (and later the AI classifier), rather than being force-fit into the wrong group.
 */
const CONCEPTS: ConceptRule[] = [
  // Grouped records --------------------------------------------------------------------------------
  {
    conceptId: 'key_personnel', label: 'Key personnel', groupSlug: 'key_personnel', groupKind: 'personnel',
    patterns: [/key personnel/, /project manager/, /\bstaffing plan\b/, /\bresume\b/, /\bcv\b/, /team member/, /technical lead/, /\bqa lead\b/, /proposed (staff|team|personnel)/, /qualifications of (the )?(staff|team|personnel|key)/],
  },
  {
    conceptId: 'past_performance', label: 'Past projects and references', groupSlug: 'past_performance', groupKind: 'reference',
    patterns: [/past[ -]?perform/, /\breference(s)?\b/, /prior (contract|project|work|engagement)/, /relevant experience/, /similar (project|contract|work|engagement)/, /project name/, /specific project/, /project.*(detail|name|align|requirement|relevant|complet|similar)/, /detail.*of (each|the|every) project/, /completed project/, /\bcase stud/],
  },
  // Fact categories --------------------------------------------------------------------------------
  {
    conceptId: 'registration', label: 'Registrations and identifiers', groupSlug: 'registrations', groupKind: 'fact',
    patterns: [/\bsam\.gov\b/, /\bsam\b/, /\buei\b/, /\bcage\b/, /\bduns\b/, /unique entity/, /entity id/, /\bein\b/, /tax id/, /registration/],
  },
  {
    conceptId: 'socioeconomic', label: 'Socioeconomic status', groupSlug: 'socioeconomic', groupKind: 'fact',
    patterns: [/socio[- ]?economic/, /\b8\s*\(?a\)?\b/, /hubzone/, /sdvosb/, /\bwosb\b/, /\bvosb\b/, /small business/, /disadvantaged business/, /minority[- ]?owned/, /veteran[- ]?owned/, /women[- ]?owned/, /\bmbe\b/, /\bdbe\b/],
  },
  {
    conceptId: 'quality_certs', label: 'Quality certifications', groupSlug: 'quality_certs', groupKind: 'fact',
    patterns: [/\biso[ -]?\d/, /\biso \d/, /\bcmmi\b/, /quality (management|certification|assurance|system)/, /\bsoc ?2\b/],
  },
  {
    conceptId: 'financials', label: 'Financials, insurance and bonding', groupSlug: 'financials', groupKind: 'fact',
    patterns: [/financial statement/, /\bfinancials?\b/, /insurance/, /\bbond(ing|ed|s)?\b/, /audited/, /balance sheet/, /annual revenue/, /\brevenue\b/, /credit rating/, /\bletter of credit\b/],
  },
  {
    conceptId: 'pricing', label: 'Pricing and rate card', groupSlug: 'pricing', groupKind: 'fact',
    patterns: [/pricing/, /rate card/, /\brates?\b/, /\bcost(s|ing)?\b/, /\bfees?\b/, /hourly rate/, /labor rate/, /price (proposal|schedule|sheet)/, /cost proposal/],
  },
  {
    conceptId: 'reps_certs', label: 'Representations and certifications', groupSlug: 'reps_certs', groupKind: 'fact',
    patterns: [/representations? (and|&) certifications?/, /\breps? (and|&) certs?\b/, /\bfar 52\./, /debarment/, /lobbying/, /\bcertif/, /\brepresentation\b/],
  },
  // Solicitation metadata the drafter could not fill ----------------------------------------------
  {
    conceptId: 'due_date', label: 'Submission due date', groupSlug: 'solicitation', groupKind: 'fact',
    patterns: [/due date/, /\bdeadline\b/, /submission (date|deadline)/, /closing date/, /date for (the )?(proposal )?submission/, /\bdue\b.*submission/],
  },
  {
    conceptId: 'client', label: 'Client / agency', groupSlug: 'solicitation', groupKind: 'fact',
    patterns: [/\bclient\b/, /\bagency\b/, /issuing (agency|organization)/, /\bbuyer\b/],
  },
  {
    conceptId: 'contact', label: 'Point of contact', groupSlug: 'solicitation', groupKind: 'fact',
    patterns: [/point of contact/, /contact (detail|information|person|name)/, /\bemail( address)?\b/, /\bphone( number)?\b/, /mailing address/, /\bpoc\b/],
  },
  {
    conceptId: 'project_overview', label: 'Project description', groupSlug: 'solicitation', groupKind: 'fact',
    patterns: [/description of (the|this) project/, /brief description of (the )?project/, /project (overview|summary|background)/, /scope of (the )?(solicitation|work)/],
  },
];

/** Normalize an ask to a matchable form: lowercase, strip punctuation, collapse whitespace. Numbers are
 *  KEPT, because concept patterns are substring matches ("project name 1" still contains "project name")
 *  and real tokens like "ISO 9001", "8a", "SOC 2" and "FAR 52" depend on their digits. */
export function normalizeAsk(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fallback concept slug only: drop bare enumerator numbers so "attachment 1" / "attachment 2" dedupe. */
function slugify(text: string): string {
  return normalizeAsk(text).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_').slice(0, 60) || 'item';
}

function titleize(text: string): string {
  const t = String(text || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'General';
}

/** Strip a need-key prefix like "fact:" / "reference:" and turn underscores to spaces. */
function textFromKey(key?: string): string {
  return String(key || '').replace(/^[a-z_]+:/i, '').replace(/_/g, ' ');
}

/**
 * Map a need to its concept + group (NOT its subject). A record-kind need groups straight by its
 * recordType; everything else is matched against the concept rules, falling back to a per-ask
 * 'general' concept (stable, so identical asks still dedupe exactly as they did before).
 */
export function canonicalizeNeed(need: { ask?: string; key?: string; kind?: string; recordType?: string }): ConceptMatch {
  if (need.kind === 'record' && (need.recordType === 'reference' || need.recordType === 'personnel')) {
    const groupSlug = need.recordType === 'reference' ? 'past_performance' : 'key_personnel';
    return { conceptId: groupSlug, label: GROUP_LABEL.get(groupSlug) || groupSlug, groupSlug, groupKind: need.recordType };
  }
  const text = normalizeAsk(`${need.ask ?? ''} ${textFromKey(need.key)}`);
  for (const c of CONCEPTS) {
    if (c.patterns.some((p) => p.test(text))) {
      return { conceptId: c.conceptId, label: c.label, groupSlug: c.groupSlug, groupKind: c.groupKind };
    }
  }
  return { conceptId: `other_${slugify(need.ask || need.key || 'general')}`, label: titleize(need.ask || 'General'), groupSlug: 'general', groupKind: 'fact' };
}

/**
 * Derive the SUBJECT of a requirement from whatever context text is available (solicitation title,
 * section, requirement statement, ask). Deterministic keyword map; 'general' when nothing matches.
 * The AI classifier refines the long tail; this is the fast, free, auditable default.
 */
const SUBJECT_RULES: Array<{ slug: string; patterns: RegExp[] }> = [
  { slug: 'reporting', patterns: [/report(ing|s)?\b/, /dashboard/, /analytics/, /business intelligence/, /\bbi\b/, /\bkpi\b/, /data visuali/] },
  { slug: 'recruiting', patterns: [/recruit(ing|ment)?/, /staffing/, /talent/, /\bhiring\b/, /candidate/, /applicant tracking/, /workforce/] },
  { slug: 'security', patterns: [/cyber ?security/, /\bsecurity\b/, /\bnist\b/, /\bsoc ?2\b/, /compliance/, /penetration test/, /\bsiem\b/, /zero trust/] },
  { slug: 'data', patterns: [/data (engineering|integration|migration|warehouse|pipeline|lake)/, /\betl\b/, /\bdata\b.*(platform|governance)/, /master data/] },
  { slug: 'training', patterns: [/training/, /curriculum/, /\blearning\b/, /\blms\b/, /upskill/, /education/] },
  { slug: 'asset_mgmt', patterns: [/asset management/, /permitting/, /\bgis\b/, /maintenance management/, /work order/, /\beam\b/] },
  { slug: 'software', patterns: [/application (development|modernization)/, /software development/, /web (application|portal)/, /custom software/, /system integration/, /\bapi\b/] },
];

export function deriveSubject(text: string): string {
  const t = normalizeAsk(text);
  if (!t) return 'general';
  for (const r of SUBJECT_RULES) {
    if (r.patterns.some((p) => p.test(t))) return r.slug;
  }
  return 'general';
}

/** The stable cross-bid identity of a need: group + concept + subject. Same identity on three bids
 *  shows once; a different subject is a different slot even within the same group. */
export function canonicalNeedId(match: ConceptMatch, subject: string): string {
  return `${match.groupSlug}:${match.conceptId}:${subject || 'general'}`;
}

/**
 * Keep only references a requirement of `subject` may cite. Default-OPEN: an untagged reference
 * (no subject, or 'general') is always eligible, so before any record is subject-tagged this is a
 * no-op and nothing regresses. A tagged reference is kept only when its subject matches - this is
 * what stops a recruiting reference surfacing in a reporting proposal.
 */
export function filterReferencesBySubject<T extends { subject?: string | null }>(refs: T[], subject: string | null | undefined): T[] {
  const want = String(subject || '').trim();
  if (!want || want === 'general') return Array.isArray(refs) ? refs : [];
  if (!Array.isArray(refs)) return [];
  return refs.filter((r) => {
    const s = String(r?.subject || '').trim();
    return !s || s === 'general' || s === want;
  });
}

/** Human label for a group slug (falls back to the slug). */
export function groupLabel(slug: string): string {
  return GROUP_LABEL.get(slug) || slug;
}

/** Human label for a subject slug (falls back to a titleized slug). */
export function subjectLabel(slug: string): string {
  const d = SUBJECT_DEFS.find((s) => s.slug === slug);
  return d ? d.label : titleize(String(slug || 'general').replace(/_/g, ' '));
}
