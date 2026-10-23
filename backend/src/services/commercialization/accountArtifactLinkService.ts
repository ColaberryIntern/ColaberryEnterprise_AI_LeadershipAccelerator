/**
 * C8.5 — every artifact for an account, one click from the account record.
 *
 * LINKS ONLY. Nothing here reads, copies, caches or proxies a document. A link is a URL
 * plus the account-specific metadata, and the artifact stays in the one canonical place
 * C0.3 put it. The named failure mode on this ticket is "copying artifacts into the app
 * and creating a second canonical location", so the service has no fetch of any kind.
 *
 * THE C0.3 NAMING RULE IS ENFORCED HERE, AT THE POINT A LINK IS CREATED. C0.3 (approved
 * 7 October) says filenames are UPPER_SNAKE_CASE with no dates, no version numbers and no
 * status words, and permits a suffix in exactly one case: a superseded version that must
 * coexist because a customer is still operating under it, in which case the SUPERSEDED
 * copy takes the suffix and the current one keeps the stable name.
 *
 * That rule is easy to break by accident - I broke it myself on 23 October by filing
 * `..._REV2_2026-10-23.pdf` as the CURRENT copy of a C8.4 artifact, which put the same
 * document in the folder twice with different content, the exact thing C0.3 exists to
 * prevent. A convention nobody checks is a convention that decays, so linking a URL whose
 * filename carries a date or a version marker is refused with the rule quoted back.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ARTIFACT_KINDS, SOURCE_TYPES } from '../../db/ensureAccountArtifactLinkSchema';

export type ArtifactKind = typeof ARTIFACT_KINDS[number];
export type SourceType = typeof SOURCE_TYPES[number];

export interface AccountArtifactLink {
  id: string;
  organizationId: string;
  artifactKind: ArtifactKind;
  title: string;
  canonicalUrl: string;
  sourceType: SourceType;
  sourceId: string | null;
  linkedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface LinkInput {
  organizationId: string;
  artifactKind: string;
  title: string;
  canonicalUrl: string;
  sourceType?: string;
  sourceId?: string | null;
  linkedBy?: string | null;
  notes?: string | null;
}

/** Thrown for anything a caller can fix. Carries a stable class for the route to map. */
export class ArtifactLinkRejected extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = 'ArtifactLinkRejected';
  }
}

/**
 * Fold a URL for the uniqueness check.
 *
 * Only the differences that cannot change WHICH document is meant: a trailing slash and
 * surrounding whitespace. Query strings and fragments are preserved, because a vault link
 * can legitimately carry one and stripping it could merge two distinct documents, which
 * is the worse error.
 */
export function normalizeCanonicalUrl(url: string): string {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

/**
 * The filename at the end of a canonical URL, ignoring any query or fragment.
 *
 * Parsed as a URL rather than split on "/". The first version split the raw string, so
 * `https://app.basecamp.com` with no path yielded "app.basecamp.com" as the filename -
 * a host that then sailed through the naming check because a hostname has no date or
 * version marker in it. Its own test caught that.
 */
export function filenameFromUrl(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(String(url)).pathname;
  } catch {
    pathname = String(url ?? '').split(/[?#]/)[0];
  }
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
}

const DATE_IN_NAME = /\d{4}-\d{2}-\d{2}|\d{8}(?=[._-]|$)/;
const VERSION_IN_NAME = /(^|[._-])(rev|v|version|draft|final|copy|new|old|latest)[\s._-]*\d*([._-]|$)/i;

export interface NamingVerdict { ok: boolean; reason?: string }

/**
 * Check a canonical URL's filename against the C0.3 naming rule.
 *
 * Returns a verdict rather than throwing so a caller can surface it as a warning on
 * existing links without refusing to display them - the rule governs what we CREATE, and
 * refusing to render a link that already exists would hide evidence rather than fix it.
 */
export function checkC03Naming(url: string): NamingVerdict {
  const name = filenameFromUrl(url);
  if (!name) return { ok: false, reason: 'the URL has no filename at the end of it' };
  if (DATE_IN_NAME.test(name)) {
    return {
      ok: false,
      reason: `"${name}" carries a date. C0.3: filenames are UPPER_SNAKE_CASE with no `
        + 'dates, no version numbers and no status words. Re-file the current copy under '
        + 'the stable name; a suffix belongs only on a superseded copy that must coexist.',
    };
  }
  if (VERSION_IN_NAME.test(name)) {
    return {
      ok: false,
      reason: `"${name}" carries a version or status marker. C0.3: the SUPERSEDED copy `
        + 'takes the suffix and the current one keeps the stable name, and only when a '
        + 'customer is still operating under the old version.',
    };
  }
  return { ok: true };
}

/** Every artifact linked to an account, newest first, with its naming verdict. */
export async function listAccountArtifacts(
  organizationId: string,
): Promise<Array<AccountArtifactLink & { naming: NamingVerdict }>> {
  const rows = await sequelize.query<{
    id: string; organization_id: string; artifact_kind: ArtifactKind; title: string;
    canonical_url: string; source_type: SourceType; source_id: string | null;
    linked_by_identity_id: string | null; notes: string | null; created_at: Date;
  }>(
    `SELECT id, organization_id, artifact_kind, title, canonical_url, source_type,
            source_id, linked_by_identity_id, notes, created_at
     FROM account_artifact_links
     WHERE organization_id = :organizationId
     ORDER BY created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { organizationId } },
  );

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    artifactKind: r.artifact_kind,
    title: r.title,
    canonicalUrl: r.canonical_url,
    sourceType: r.source_type,
    sourceId: r.source_id,
    linkedBy: r.linked_by_identity_id,
    notes: r.notes,
    createdAt: new Date(r.created_at).toISOString(),
    naming: checkC03Naming(r.canonical_url),
  }));
}

/**
 * Link an artifact to an account.
 *
 * Idempotent: linking the same URL to the same account twice returns the existing row
 * rather than creating a second one. That is the ticket's success metric expressed as
 * code - "nobody re-sends a document an account already has" needs the duplicate to be
 * impossible, not merely discouraged.
 */
export async function linkArtifactToAccount(
  input: LinkInput,
): Promise<{ link: AccountArtifactLink; created: boolean }> {
  const url = normalizeCanonicalUrl(input.canonicalUrl);
  const title = String(input.title ?? '').trim();

  if (!url) throw new ArtifactLinkRejected('missing_url', 'A canonical URL is required.');
  if (!/^https?:\/\//i.test(url)) {
    throw new ArtifactLinkRejected('bad_url', 'The canonical URL must be http or https.');
  }
  if (!title) throw new ArtifactLinkRejected('missing_title', 'A title is required.');
  if (!(ARTIFACT_KINDS as readonly string[]).includes(input.artifactKind)) {
    throw new ArtifactLinkRejected(
      'bad_kind',
      `Unknown artifact kind "${input.artifactKind}". One of: ${ARTIFACT_KINDS.join(', ')}.`,
    );
  }
  const sourceType = input.sourceType || 'basecamp_vault';
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    throw new ArtifactLinkRejected(
      'bad_source_type',
      `Unknown source type "${sourceType}". One of: ${SOURCE_TYPES.join(', ')}.`,
    );
  }

  const naming = checkC03Naming(url);
  if (!naming.ok) throw new ArtifactLinkRejected('c03_naming', naming.reason as string);

  const existing = await sequelize.query<{ id: string }>(
    `SELECT id FROM account_artifact_links
     WHERE organization_id = :organizationId AND canonical_url = :url`,
    {
      type: QueryTypes.SELECT,
      replacements: { organizationId: input.organizationId, url },
    },
  );
  if (existing.length) {
    const all = await listAccountArtifacts(input.organizationId);
    const link = all.find((l) => l.id === existing[0].id) as AccountArtifactLink;
    return { link, created: false };
  }

  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO account_artifact_links
       (organization_id, artifact_kind, title, canonical_url, source_type, source_id,
        linked_by_identity_id, notes, created_at, updated_at)
     VALUES (:organizationId, :kind, :title, :url, :sourceType, :sourceId, :linkedBy,
             :notes, NOW(), NOW())
     RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        organizationId: input.organizationId,
        kind: input.artifactKind,
        title,
        url,
        sourceType,
        sourceId: input.sourceId ?? null,
        linkedBy: input.linkedBy ?? null,
        notes: input.notes ?? null,
      },
    },
  );

  const all = await listAccountArtifacts(input.organizationId);
  const link = all.find((l) => l.id === inserted[0].id) as AccountArtifactLink;
  return { link, created: true };
}

/**
 * Remove a link. The artifact itself is untouched, because we never had it - this deletes
 * a pointer, which is the whole reason the pointer was safe to create.
 */
export async function unlinkArtifactFromAccount(
  organizationId: string,
  linkId: string,
): Promise<{ removed: boolean }> {
  const rows = await sequelize.query(
    `DELETE FROM account_artifact_links
     WHERE id = :linkId AND organization_id = :organizationId
     RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { linkId, organizationId } },
  );
  return { removed: (rows as unknown[]).length > 0 };
}
