/**
 * apolloContactImportService — bring contacts that ALREADY EXIST in our Apollo
 * account into the portal's lead queue.
 *
 * Background (2026-08-11): the Apollo account holds ~29,700 saved contacts
 * while only 2,102 ever reached Postgres. Ali's decision was to import them so
 * the sales team can work them here rather than buying Apollo seats.
 *
 * The credit rule, which is the whole point of this module: two scheduled
 * agents were switched off on 2026-07-10 for burning Apollo credits. They
 * burned them on discovery — mixed_people/search paginating thousands of
 * records per ICP profile, then people/match enrichment and phone reveals per
 * imported row.
 *
 * This module reads only records we already own and have already paid for, via
 * the account-scoped contacts search. That endpoint returns our own saved
 * contacts and costs nothing. To keep that true no matter who edits this file
 * later, every request goes through apolloAccountPost(), which refuses any path
 * not on ALLOWED_PATHS. A rep clicking "pull in leads" therefore cannot spend
 * money, structurally rather than by intention.
 *
 * This module also does NOT read env.apolloEnabled: that kill switch guards the
 * billable discovery paths in apolloService.ts. Gating a free read on it would
 * mean the switch has to be flipped back on to do something safe, which is
 * exactly the mistake that would let the expensive paths back in.
 *
 * Idempotency: keyed on leads.apollo_id, which is Apollo's own stable contact
 * id, with a secondary check on email. Re-running imports nothing twice; a
 * re-run after a partial failure resumes cleanly. No row is ever updated
 * destructively — an existing lead is left exactly as the sales team left it.
 */
import { Op } from 'sequelize';
import Lead from '../../models/Lead';
import { apolloAccountFetch, ApolloImportError } from './apolloAccountClient';

/**
 * The only Apollo endpoints this module may touch. Both are account-scoped
 * reads over records we already own. Adding a mixed_people, people/match or
 * phone-reveal path here reintroduces the credit drain — do not.
 */
const CONTACTS_SEARCH = '/v1/contacts/search';
const LABELS = '/v1/labels';

/** Ceiling on a single import call, so a rep-triggered pull stays bounded. */
export const MAX_CONTACTS_PER_RUN = 500;
const APOLLO_PAGE_SIZE = 100;

export interface ApolloImportOptions {
  /** Restrict to specific Apollo list (label) ids. Empty = every saved contact. */
  labelIds?: string[];
  /** Hard cap on contacts examined in this run. Clamped to MAX_CONTACTS_PER_RUN. */
  limit?: number;
  /** Apollo page to start from, so a caller can resume where it stopped. */
  startPage?: number;
  /** false (default) reports what would happen and writes nothing. */
  commit?: boolean;
}

export interface ApolloImportResult {
  scanned: number;
  imported: number;
  skippedExisting: number;
  skippedNoEmail: number;
  failed: number;
  /** Page to pass as startPage next time, or null when the list is exhausted. */
  nextPage: number | null;
  totalAvailable: number | null;
  committed: boolean;
  errors: string[];
}

/** Minimal shape we rely on; Apollo returns far more per contact. */
export interface ApolloContact {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  title?: string;
  organization_name?: string;
  linkedin_url?: string;
  phone_numbers?: Array<{ raw_number?: string; sanitized_number?: string }>;
  sanitized_phone?: string;
  industry?: string;
  estimated_num_employees?: number;
  /**
   * What /v1/contacts/search ACTUALLY returns: the list ids a contact belongs
   * to, not their names. Verified against the live API 2026-08-24 after the
   * first production import landed 337 leads with no list attribution at all.
   * The name-bearing fields below are kept because other Apollo endpoints do
   * return them, and reading whichever is present costs nothing.
   */
  label_ids?: string[];
  contact_label_names?: string[];
  label_names?: string[];
}

function firstPhone(c: ApolloContact): string | null {
  if (c.sanitized_phone) return c.sanitized_phone;
  const p = c.phone_numbers?.find((n) => n.sanitized_number || n.raw_number);
  return p?.sanitized_number || p?.raw_number || null;
}

/**
 * The Apollo list names a contact belongs to.
 *
 * The contacts endpoint returns `label_ids`, so names are resolved through the
 * id -> name map the caller fetched from /v1/labels. An id with no known name
 * falls back to the id itself: a raw id in the field is ugly but traceable,
 * and silently dropping it is what caused the original bug.
 */
function listNames(c: ApolloContact, labelNames?: ReadonlyMap<string, string>): string[] {
  const byName = (c.contact_label_names || c.label_names || []).filter(Boolean);
  if (byName.length) return byName;

  const ids = (c.label_ids || []).filter(Boolean);
  if (!ids.length) return [];
  return ids.map((id) => labelNames?.get(id) ?? id);
}

/**
 * Apollo contact -> lead row.
 *
 * `source` is deliberately 'apollo_contacts', not 'apollo': the latter is the
 * 2,102 the retired agents imported, and keeping them distinct is what lets
 * anyone tell the two intakes apart later. Both roll up to the Apollo group in
 * leadSourceGroups, so they sort below website signups either way.
 *
 * Returns null for a contact with no usable email — the queue is worked by
 * email, so a row without one is noise.
 */
export function mapContactToLead(
  c: ApolloContact,
  importedOn: string,
  labelNames?: ReadonlyMap<string, string>
): Record<string, unknown> | null {
  const email = c.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;

  const name =
    c.name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || email;
  const lists = listNames(c, labelNames);

  return {
    name,
    email,
    company: c.organization_name?.trim() || null,
    title: c.title?.trim() || null,
    industry: c.industry?.trim() || null,
    linkedin_url: c.linkedin_url || null,
    phone: firstPhone(c),
    employee_count: typeof c.estimated_num_employees === 'number' ? c.estimated_num_employees : null,
    apollo_id: c.id || null,
    source: 'apollo_contacts',
    form_type: 'apollo_contact_import',
    lead_source_type: 'cold',
    status: 'new',
    utm_source: 'apollo',
    // The Apollo list is the closest thing these contacts have to a campaign,
    // and it is what the sales team actually recognises them by.
    utm_campaign: lists[0] || null,
    notes: lists.length
      ? `Imported from Apollo on ${importedOn}. Apollo lists: ${lists.join(', ')}.`
      : `Imported from Apollo on ${importedOn}.`,
  };
}

/**
 * Pull a bounded batch of saved Apollo contacts into `leads`.
 *
 * Dry run by default. Returns a `nextPage` cursor so a caller can walk a large
 * list in bounded steps rather than one long request.
 */
export async function importApolloContacts(
  options: ApolloImportOptions = {}
): Promise<ApolloImportResult> {
  const limit = Math.min(options.limit ?? MAX_CONTACTS_PER_RUN, MAX_CONTACTS_PER_RUN);
  const commit = options.commit === true;
  const importedOn = new Date().toISOString().slice(0, 10);

  const result: ApolloImportResult = {
    scanned: 0,
    imported: 0,
    skippedExisting: 0,
    skippedNoEmail: 0,
    failed: 0,
    nextPage: null,
    totalAvailable: null,
    committed: commit,
    errors: [],
  };

  // Fetch the id -> name map once per run so every contact's list membership
  // can be resolved. A failure here must not abort the import: leads landing
  // with a raw id beats leads not landing.
  let labelNames: ReadonlyMap<string, string> | undefined;
  try {
    const lists = await listApolloLists();
    labelNames = new Map(lists.map((l) => [l.id, l.name]));
  } catch {
    labelNames = undefined;
  }

  let page = Math.max(1, options.startPage ?? 1);

  while (result.scanned < limit) {
    const body: Record<string, unknown> = {
      page,
      per_page: Math.min(APOLLO_PAGE_SIZE, limit - result.scanned),
    };
    if (options.labelIds?.length) body.contact_label_ids = options.labelIds;

    const data = await apolloAccountFetch(CONTACTS_SEARCH, body);
    const contacts: ApolloContact[] = data?.contacts ?? [];
    if (result.totalAvailable === null) {
      result.totalAvailable = data?.pagination?.total_entries ?? null;
    }
    if (!contacts.length) {
      result.nextPage = null;
      break;
    }

    for (const contact of contacts) {
      result.scanned++;
      const mapped = mapContactToLead(contact, importedOn, labelNames);
      if (!mapped) {
        result.skippedNoEmail++;
        continue;
      }

      try {
        // Idempotency: Apollo's contact id first, email as the backstop for
        // rows that arrived through a website form before we ever pulled them.
        const or: any[] = [{ email: mapped.email as string }];
        if (mapped.apollo_id) or.push({ apollo_id: mapped.apollo_id as string });
        const existing = await Lead.findOne({ where: { [Op.or]: or } });

        if (existing) {
          result.skippedExisting++;
          continue;
        }
        if (commit) await Lead.create(mapped as any);
        result.imported++;
      } catch (err: any) {
        result.failed++;
        // Keep the report small; a handful of lines is enough to triage.
        if (result.errors.length < 20) {
          result.errors.push(`${mapped.email}: ${err?.message ?? 'unknown error'}`);
        }
      }
    }

    const totalPages = data?.pagination?.total_pages ?? page;
    if (page >= totalPages) {
      result.nextPage = null;
      break;
    }
    page++;
    result.nextPage = page;
  }

  return result;
}

/** The Apollo lists (labels) available to import from, for the picker. */
export async function listApolloLists(): Promise<Array<{ id: string; name: string; count: number }>> {
  const data = await apolloAccountFetch(LABELS);
  const rows = Array.isArray(data) ? data : data?.labels ?? [];
  return rows.map((l: any) => ({
    id: String(l.id),
    name: String(l.name ?? 'Untitled list'),
    count: Number(l.cached_count ?? l.count ?? 0),
  }));
}

export { ApolloImportError };
