/**
 * The admissions domain's visitor signals, anonymised, for the domain's own builder.
 *
 * ## Why this exists
 *
 * `admissions.CAP.page_event_admissions_enrichment` has to show that a visitor
 * summary matches the page events underneath it, with no invented page titles.
 * Nothing served that. The interest tags live in `admissions_memory.interests`
 * and no admin route returned that column for any role, and the visitor routes
 * in `insightRoutes.ts` are `requireAdmin`, map to the `campaigns` section, and
 * return whole model rows — IP address, user agent, device fingerprint, and a
 * `lead` include carrying a real name, email and phone.
 *
 * So the alternative to this reader was granting a builder the `campaigns`
 * section and the admin visitor surface, which is a far wider grant than the
 * question needs, and would still not have returned the interest tags.
 *
 * ## What it deliberately does not return
 *
 * Every field here is named explicitly; nothing is spread from a model row.
 * Excluded, and why:
 *
 *   visitors.ip_address, user_agent, fingerprint  device/network identifiers
 *   visitors.lead_id, page_events.lead_id          join to a NAMED person
 *   admissions_memory.lead_id                      same
 *   admissions_memory.questions_asked              verbatim visitor utterances
 *   admissions_memory.conversation_summaries       same
 *   admissions_memory.personality_notes            same
 *   page_events.page_url                           full URL; the tracker puts
 *                                                  `?email=` in it
 *   page_events.event_data                         unbounded free-form payload
 *
 * `page_path` and `page_title` are returned in place of `page_url` — they carry
 * the page's identity without its query string.
 *
 * The visitor id is replaced by a keyed HMAC (`pseudonymousId`), so rows can be
 * grouped per visitor without the visitor id itself leaving the server. It is
 * keyed and not a plain hash because a bare SHA-256 of a UUID is reversible by
 * anyone who can enumerate UUIDs.
 */
import { Op } from 'sequelize';
import { env } from '../../config/env';
import { pseudonymousId } from '../../utils/hmac';

/**
 * The models are imported INSIDE the reader, not at the top of this file.
 *
 * `models/index.ts` calls `Model.init(...)` at module scope against the real
 * Sequelize instance. Importing it here would pull that into every module that
 * transitively imports this one — including `agentDomainRoutes.ts`, and so into
 * `agentDomainRoutes.test.ts`, `agentDomainOwnerScope.test.ts` and
 * `agentDomainMineDetail.test.ts`, which mock `config/database` as a bare
 * `{ sequelize: { query } }`. That stub has no `.define`, so all three suites
 * died with `Cannot read properties of undefined (reading 'define')` before a
 * single test ran. Observed, then fixed this way rather than by loosening those
 * three mocks, which exist to keep the ownership tests honest.
 *
 * Deferring the import keeps the cost where it belongs: a caller that never
 * reads admissions signals never loads the model layer. Jest's module registry
 * resolves a dynamic import through the same mocks, so this stays testable.
 *
 * Please do not "tidy" this back to a top-level import.
 */
async function models() {
  return import('../../models');
}

/** Domain separation for the anonymous ids minted by this surface only. */
const PSEUDONYM_CONTEXT = 'agent-domain:admissions-signals';

export interface AdmissionsSignalEvent {
  readonly event_type: string;
  readonly page_path: string;
  readonly page_title: string | null;
  readonly timestamp: string | null;
}

export interface AdmissionsSignalVisitor {
  readonly anon_id: string;
  readonly interests: readonly string[];
  readonly visitor_type: string;
  readonly page_events: readonly AdmissionsSignalEvent[];
  readonly page_event_count: number;
}

export interface AdmissionsSignalsPage {
  readonly visitors: readonly AdmissionsSignalVisitor[];
  readonly returned: number;
  readonly matching: number;
}

export interface AdmissionsSignalsOptions {
  /** How many visitors to return. The capability samples 20. */
  readonly limit: number;
  /** Cap on events returned per visitor, newest first. */
  readonly eventsPerVisitor: number;
}

/** JSONB columns arrive as whatever was written; only keep the string tags. */
function toStringTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return null;
}

/**
 * Visitors that admissions has a memory row for, newest first, with their
 * recent page events attached.
 *
 * Two queries, not a join with `include`: an include would make the row cap
 * apply to the joined product rather than to visitors, which is how a "20
 * visitors" sample silently becomes "however many visitors fit in 20 event
 * rows".
 */
export async function readAdmissionsSignals(
  opts: AdmissionsSignalsOptions,
): Promise<AdmissionsSignalsPage> {
  const { AdmissionsMemory, PageEvent } = await models();

  const matching = await AdmissionsMemory.count();

  const memories = await AdmissionsMemory.findAll({
    attributes: ['visitor_id', 'interests', 'visitor_type'],
    order: [['last_updated', 'DESC']],
    limit: opts.limit,
    raw: true,
  });

  if (memories.length === 0) {
    return { visitors: [], returned: 0, matching };
  }

  const visitorIds = memories
    .map((m) => String((m as unknown as { visitor_id: string }).visitor_id))
    .filter((id) => id && id !== 'null');

  const events = visitorIds.length
    ? await PageEvent.findAll({
      attributes: ['visitor_id', 'event_type', 'page_path', 'page_title', 'timestamp'],
      where: { visitor_id: { [Op.in]: visitorIds } },
      order: [['timestamp', 'DESC']],
      raw: true,
    })
    : [];

  const byVisitor = new Map<string, AdmissionsSignalEvent[]>();
  const totals = new Map<string, number>();
  for (const row of events as unknown as Array<Record<string, unknown>>) {
    const vid = String(row.visitor_id);
    totals.set(vid, (totals.get(vid) ?? 0) + 1);
    const bucket = byVisitor.get(vid) ?? [];
    if (bucket.length < opts.eventsPerVisitor) {
      bucket.push({
        event_type: String(row.event_type ?? ''),
        page_path: String(row.page_path ?? ''),
        // Kept null rather than coerced to '': the capability's own criterion is
        // "zero fabricated page titles", and '' would be a fabricated one.
        page_title: typeof row.page_title === 'string' ? row.page_title : null,
        timestamp: toIso(row.timestamp),
      });
    }
    byVisitor.set(vid, bucket);
  }

  const visitors: AdmissionsSignalVisitor[] = memories.map((m) => {
    const row = m as unknown as Record<string, unknown>;
    const vid = String(row.visitor_id);
    return {
      anon_id: pseudonymousId(PSEUDONYM_CONTEXT, vid, env.pseudonymSecret),
      interests: toStringTags(row.interests),
      visitor_type: String(row.visitor_type ?? ''),
      page_events: byVisitor.get(vid) ?? [],
      page_event_count: totals.get(vid) ?? 0,
    };
  });

  return { visitors, returned: visitors.length, matching };
}
