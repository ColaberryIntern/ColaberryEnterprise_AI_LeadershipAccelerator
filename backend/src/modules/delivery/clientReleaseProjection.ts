import type { ReleaseCheckResult } from './releaseChecks';

/**
 * clientReleaseProjection — turn a `delivery_releases` row into the shape a client is owed.
 *
 * ## Why a mapper exists at all
 *
 * `CLIENT_FIELD_ALLOWLIST.release` names `name`, `released_at` and `evidence_summary`.
 * **None of those are columns on `delivery_releases`** — the table has `version`,
 * `approved_at`, `check_results` and `waived_categories`. The allowlist was written before
 * the table existed, against an imagined model.
 *
 * That mismatch is invisible rather than loud: `toClientShape` skips undefined values, so
 * projecting the row directly would have produced `{ id, status }` and silently dropped the
 * rest — a release with no name and no date, and nothing failing anywhere. The identical
 * bug already happened once on `project` (`summary`, `started_at`, `target_date`).
 *
 * The fix is deliberately a mapper rather than a rename of the allowlist. The allowlist
 * describes the **client's** contract, and `version` / `approved_at` / `check_results` are
 * our vocabulary, not theirs. Renaming the allowlist to match our columns would leak the
 * internal language into the client surface permanently, to save one function.
 *
 * ## Waived is a third outcome, not a quiet pass
 *
 * A government or commercial release can ship with a mandatory check **waived**, and the
 * record keeps the written reason. Folding that into `pass` would let a client accept a
 * clean-looking release that never had, say, an accessibility run — and the record they
 * signed would agree with them. So `waived` is its own outcome and it carries the reason
 * to the client, because the reason is the only thing that makes a waiver acceptable.
 */

/** One line of evidence as a client reads it. */
export interface ClientEvidenceLine {
  /** The check, in the client's column. Named `dimension` to match the allowlist. */
  dimension: string;
  outcome: 'pass' | 'fail' | 'not_run' | 'waived';
  checked_at: string | null;
  /** Present only on a waiver: why the check was not required. */
  reason?: string;
}

export interface ClientReleaseShape {
  id: string;
  name: string;
  status: string;
  released_at: string | null;
  evidence_summary: ClientEvidenceLine[];
}

interface WaiverRow {
  check?: string;
  reason?: string;
}

/** Waivers were plain strings before they carried reasons. Both shapes still read. */
function waiverEntries(raw: unknown): Array<{ check: string; reason: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      if (typeof w === 'string') return { check: w, reason: null };
      const row = w as WaiverRow;
      return row?.check ? { check: row.check, reason: row.reason ?? null } : null;
    })
    .filter((w): w is { check: string; reason: string | null } => w !== null);
}

/**
 * Build the client-facing view of one release.
 *
 * A waiver takes precedence over a recorded result for the same check. If a check was both
 * measured and waived, what governed the release is the waiver, and that is what the client
 * must be shown — the alternative shows a `pass` for something nobody required.
 */
export function toClientRelease(row: {
  id: string;
  version: string;
  status: string;
  approved_at?: Date | string | null;
  check_results?: unknown;
  waived_categories?: unknown;
}): ClientReleaseShape {
  const waivers = waiverEntries(row.waived_categories);
  const waivedChecks = new Set(waivers.map((w) => w.check));

  const results: ReleaseCheckResult[] = Array.isArray(row.check_results)
    ? (row.check_results as ReleaseCheckResult[])
    : [];

  const approvedAt =
    row.approved_at instanceof Date
      ? row.approved_at.toISOString()
      : (row.approved_at as string | null | undefined) ?? null;

  const measured: ClientEvidenceLine[] = results
    .filter((r) => r && typeof r.check === 'string' && !waivedChecks.has(r.check))
    .map((r) => ({
      dimension: r.check,
      outcome: (r.outcome as ClientEvidenceLine['outcome']) ?? 'not_run',
      checked_at: approvedAt,
    }));

  const waived: ClientEvidenceLine[] = waivers.map((w) => ({
    dimension: w.check,
    outcome: 'waived' as const,
    checked_at: approvedAt,
    // Null rather than an invented sentence. A waiver written before reasons were required
    // has none, and saying "no reason recorded" is more use than implying there was one.
    ...(w.reason ? { reason: w.reason } : {}),
  }));

  return {
    id: row.id,
    // Our column is `version`; the client's word for it is the release's name.
    name: row.version,
    status: row.status,
    released_at: approvedAt,
    evidence_summary: [...measured, ...waived],
  };
}
