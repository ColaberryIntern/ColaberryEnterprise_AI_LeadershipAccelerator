import { AdminUser, Enrollment } from '../../models';

/**
 * WHO UPLOADED THIS.
 *
 * `media_assets.uploaded_by` is a bare uuid with no foreign key, and the uuid does NOT
 * all come from one table. Measured against production on 2026-11-25, the 55 rows in the
 * library were deposited by four different kinds of actor:
 *
 *   7b9de398...  resolves in admin_users   (a super_admin)        2 assets
 *   4d3f1df8...  resolves in enrollments   (Sohail Syed)          8 assets
 *   00000000-0000-4000-8000-c0ffee000084   resolves NOWHERE      36 assets
 *   NULL                                   never recorded         9 assets
 *
 * So a single join to admin_users would have labelled 2 of 55 and silently left the rest
 * blank - and blank reads as "nobody knows" when the truth was "we looked in one place".
 * This module looks in every place, in a fixed order, and says plainly which place
 * answered. An id that resolves nowhere is reported as unknown WITH its short id, never
 * as an empty string, because the operator needs to be able to tell "no record" apart
 * from "a record I cannot name".
 */

export type UploaderSource = 'admin' | 'member' | 'system' | 'unknown' | 'none';

export interface UploaderLabel {
  /** The raw uuid, or null when the column was never populated. */
  id: string | null;
  /** Always a non-empty human string. Never blank, so the UI never renders a void. */
  label: string;
  /** Which lookup answered. The UI uses this to style, and an auditor uses it to trust. */
  source: UploaderSource;
}

/**
 * Actors that are code, not people, named exactly.
 *
 * This id does not appear anywhere in the repository - it is minted at runtime - so it
 * cannot be imported from the module that produces it. It is written here because a
 * measured constant is more honest than a guessed pattern, and because leaving 36 of 55
 * tiles saying "Unknown" would hide the single most useful fact about them: that nobody
 * uploaded them, a batch job did.
 */
export const SYSTEM_ACTORS: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-4000-8000-c0ffee000084': 'Comms Hub thumbnail studio',
});

/**
 * Synthetic actors in this codebase are minted in a reserved namespace (seed scripts and
 * the voice gateway's mock run both use it). An id in that namespace that is not named
 * above is still certainly a machine, so it is reported as one rather than as a mystery.
 */
const SYNTHETIC_PREFIX = '00000000-0000-4000-8000-';

export const NOT_RECORDED: UploaderLabel = Object.freeze({
  id: null,
  label: 'Not recorded',
  source: 'none',
});

/** First eight characters, which is how Postgres and git both let a human cite a uuid. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** A machine actor, or null if this id is not one. Pure, so it is testable without a database. */
export function systemActorLabel(id: string): UploaderLabel | null {
  const named = SYSTEM_ACTORS[id];
  if (named) return { id, label: named, source: 'system' };
  if (id.startsWith(SYNTHETIC_PREFIX)) {
    return { id, label: `Automated process (${shortId(id)})`, source: 'system' };
  }
  return null;
}

/** What we say when an id is real but names nobody we can find. Pure. */
export function unknownLabel(id: string): UploaderLabel {
  return { id, label: `Unknown (${shortId(id)})`, source: 'unknown' };
}

/**
 * An admin row may carry a display_name, or only an email, or neither. Measured on
 * production: 50 admin rows, 36 with a display_name, so the email fallback is load
 * bearing rather than theoretical.
 */
export function adminLabel(row: { id: string; display_name?: string | null; email?: string | null }): UploaderLabel {
  const name = (row.display_name || '').trim();
  const email = (row.email || '').trim();
  return { id: row.id, label: name || email || `Admin (${shortId(row.id)})`, source: 'admin' };
}

export function memberLabel(row: { id: string; full_name?: string | null }): UploaderLabel {
  const name = (row.full_name || '').trim();
  return { id: row.id, label: name || `Member (${shortId(row.id)})`, source: 'member' };
}

/**
 * Resolve many uploader ids at once.
 *
 * Batched deliberately: the library lists up to 100 rows a page, and a per-row lookup
 * would be 100 round trips to render one screen. Two queries answer the whole page.
 *
 * Never throws. A lookup failure degrades to `unknown`, because a database hiccup in the
 * "who uploaded this" column must not take the whole grid down - exactly the reasoning
 * `safeSignedUrl` already applies to signing in mediaLibraryService.
 */
export async function resolveUploaders(
  rawIds: Array<string | null | undefined>,
): Promise<Map<string, UploaderLabel>> {
  const out = new Map<string, UploaderLabel>();

  // Dedupe and drop the nulls. A null is not an id to look up; it is the absence of one,
  // and the caller handles it with NOT_RECORDED.
  const ids = Array.from(
    new Set(rawIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '')),
  );
  if (ids.length === 0) return out;

  // Machines first, so we never ask the database about an id that cannot be in it.
  const toLookUp: string[] = [];
  for (const id of ids) {
    const system = systemActorLabel(id);
    if (system) out.set(id, system);
    else toLookUp.push(id);
  }
  if (toLookUp.length === 0) return out;

  // An admin is the more authoritative identity, so it is asked first and wins a tie.
  try {
    const admins = (await AdminUser.findAll({
      where: { id: toLookUp },
      attributes: ['id', 'display_name', 'email'],
    })) as unknown as Array<{ id: string; display_name?: string | null; email?: string | null }>;
    for (const a of admins) out.set(a.id, adminLabel(a));
  } catch {
    // Fall through: these ids simply stay unresolved and are reported as unknown below.
  }

  const stillMissing = toLookUp.filter((id) => !out.has(id));
  if (stillMissing.length > 0) {
    try {
      const members = (await Enrollment.findAll({
        where: { id: stillMissing },
        attributes: ['id', 'full_name'],
      })) as unknown as Array<{ id: string; full_name?: string | null }>;
      for (const m of members) out.set(m.id, memberLabel(m));
    } catch {
      // Same degradation as above.
    }
  }

  // Anything still unnamed is reported honestly rather than left absent.
  for (const id of ids) if (!out.has(id)) out.set(id, unknownLabel(id));

  return out;
}
