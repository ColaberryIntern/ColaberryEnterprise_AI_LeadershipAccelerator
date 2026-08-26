/**
 * caseStudySnapshotBuilder — assemble one normalized Case Study snapshot and
 * hash it. Spec §30's headline requirement, in one function:
 *
 *     same repo set + same SHAs + same Project/Evidence facts
 *       = same normalized snapshot hash
 *       = sync outcome unchanged
 *
 * ONE HASHER, NOT TWO. `hashCanonical` comes from `utils/canonicalHash.ts`, the
 * same recursive key-sorting sha256 that gives a BuildPlan its identity. It was
 * private inside `sbp/planHash.ts` until this task extracted it; writing a
 * second one here would have given the platform two implementations of one
 * invariant, and the day they disagreed a publish would be rejected as tampered
 * in one subsystem while a duplicate snapshot row appeared in the other.
 *
 * NOTHING VOLATILE MAY REACH THE HASH — the discipline
 * `sbp/buildProgressSnapshot.ts` states in those words, for the same reason.
 * Only `{ content, sourceCommitMap }` is hashed. `generatedAt`, provenance
 * `recordedAt` and the correlation id are returned OUTSIDE that envelope, and
 * the clock itself is an injectable input so a test can prove it: build at two
 * different instants, get two different `generatedAt` values and one hash.
 * `lastSyncedAt` is not merely excluded from the hash, it is never written into
 * the content at all (see `caseStudySnapshotSections.ts`).
 *
 * WHY THE COMMIT MAP IS IN THE ENVELOPE. Repo SHAs already reach the content
 * through `repositories[].lastSeenSha`, so hashing the map too is belt and
 * braces — but spec §30 names "same SHAs" as part of the identity, and the
 * `source_commit_map` column is where that lives. Hashing both means a future
 * change to how repositories project into content cannot silently drop SHAs out
 * of the identity.
 *
 * FAILURE-FIRST. (1) Bad input throws `CaseStudySnapshotError('ValidationError')`
 * before any assembly, so there is no partial draft. (2) No retry: the function
 * is pure and CPU-only — retrying it changes nothing. (3) Recovery: the caller
 * surfaces `error_class` to the admin, who corrects the input. (4) Handled:
 * malformed identifiers, absent repos, absent manifests, absent optional
 * sections, unparseable and unlandable override paths. NOT handled: content so
 * large that `JSON.stringify` throws — bounded upstream by the analyzer's
 * excerpt caps and the manifest reader's 64KB limit.
 *
 * PRIVATE REPOSITORY IDENTITY NEVER REACHES A LOG LINE. `repoLogIdentity()` from
 * `caseStudyRepoReader.ts` is reused rather than reimplemented; it names public
 * repositories and hands back an opaque, stable handle for private ones AND for
 * `unknown` visibility, which is the fail-closed case.
 */
import { z } from 'zod';
import { hashCanonical } from '../../utils/canonicalHash';
import { ensureTraceId } from '../../utils/requestContext';
import { repoLogIdentity } from './caseStudyRepoReader';
import {
  buildArchitecture, buildIdentity, buildMetrics, buildRepositories,
  buildSourceCommitMap, buildTaxonomy, buildTimeline,
} from './caseStudySnapshotSections';
import { applyOverrides } from './caseStudySnapshotOverrides';
import type {
  CaseStudySnapshotDraft, CaseStudySnapshotInput, SnapshotRepoInput,
} from './caseStudySnapshotInput';
import type { CaseStudySnapshotContent } from '../../types/caseStudy';
import type {
  CaseStudyProvenance, CaseStudyProvenanceEntry, CaseStudyProvenancePath,
} from '../../types/caseStudyProvenance';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudySnapshotErrorClass = 'ValidationError';

export class CaseStudySnapshotError extends Error {
  public readonly error_class: CaseStudySnapshotErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(error_class: CaseStudySnapshotErrorClass, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CaseStudySnapshotError';
    this.error_class = error_class;
    this.http_status = 400;
    this.details = details;
  }
}

export function isCaseStudySnapshotError(err: unknown): err is CaseStudySnapshotError {
  return err instanceof CaseStudySnapshotError;
}

/* ─────────────────────────────────────────────────────────── validation ──── */

/** Spec §37's ceiling on cited repositories, enforced again here. */
export const MAX_SNAPSHOT_REPOS = 20;
export const MAX_SNAPSHOT_OVERRIDES = 500;

// Zod v4: read `error.issues`, never `.errors`. Only the scalar surface is
// checked — the fact objects come from the analyzer, which already validated
// every upstream payload, and re-declaring those shapes here would be a second
// contract to keep in step with the first.
const inputSchema = z.object({
  caseStudyId: z.string().trim().min(1).max(64),
  platform: z.object({
    slug: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(300),
  }),
  repos: z.array(z.unknown()).max(MAX_SNAPSHOT_REPOS).optional(),
  overrides: z.array(z.object({
    path: z.string().trim().min(1).max(200),
    actor: z.string().trim().min(1).max(255),
    recordedAt: z.string().trim().min(1).max(40),
  }).loose()).max(MAX_SNAPSHOT_OVERRIDES).optional(),
  generatedBy: z.enum(['repo_sync', 'platform_sync', 'human_edit']).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

/* ────────────────────────────────────────────────────────────── logging ──── */

interface SnapshotLogContext {
  case_study_id: string;
  content_hash?: string;
  repo_count?: number;
  repo_refs?: string[];
  override_count?: number;
  applied_overrides?: number;
  ignored_overrides?: number;
  section_count?: number;
  generated_by?: string;
  error_class?: string;
}

/** Structured, per `services/artifacts/artifactRepoSync.ts:92-102`. Fixed shape — no spread. */
function log(event: string, outcome: 'success' | 'failure', correlationId: string, ctx: SnapshotLogContext): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-snapshot',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/** Public repos are named; private and `unknown` get the opaque, stable handle. */
function logRefs(repos: readonly SnapshotRepoInput[]): string[] {
  return repos
    .map((r) => repoLogIdentity(r.facts.repoOwner, r.facts.repoName, r.facts.metadata.visibility))
    .map((id) => id.repo_ref ?? `${id.owner}/${id.repo}`)
    .sort();
}

/* ─────────────────────────────────────────────────────────── provenance ──── */

/**
 * Section-level provenance for the GENERATED content, per spec §9's tiers.
 * Deliberately conservative: an entry is written only where the origin can be
 * named honestly. A section attributed to a `project_field` that does not exist
 * would make the admin's provenance panel a decoration.
 */
function generatedProvenance(
  content: CaseStudySnapshotContent,
  repos: readonly SnapshotRepoInput[],
  projectId: string | undefined,
  recordedAt: string,
): Record<CaseStudyProvenancePath, CaseStudyProvenanceEntry> {
  const out: Record<CaseStudyProvenancePath, CaseStudyProvenanceEntry> = {};
  const evidenceRepo = repos.find((r) => r.facts.metadata.latestCommitSha);

  if (evidenceRepo) {
    const origin = {
      kind: 'repo_extraction' as const,
      repoOwner: evidenceRepo.facts.repoOwner,
      repoName: evidenceRepo.facts.repoName,
      commitSha: evidenceRepo.facts.metadata.latestCommitSha as string,
    };
    for (const path of ['repositories', 'architecture', 'taxonomy'] as const) {
      if (content[path] !== undefined) out[path] = { tier: 'repo_extraction', origin, recordedAt };
    }
  }

  const manifestRepo = repos.find((r) => r.manifest);
  if (manifestRepo && content.taxonomy) {
    out.taxonomy = {
      tier: 'repo_manifest',
      origin: {
        kind: 'manifest',
        repoOwner: manifestRepo.facts.repoOwner,
        repoName: manifestRepo.facts.repoName,
        manifestPath: 'case-study.json',
        commitSha: manifestRepo.facts.metadata.latestCommitSha ?? undefined,
      },
      recordedAt,
    };
  }

  if (projectId) {
    for (const path of [
      'identity', 'situation', 'buildTimeline', 'measurement', 'heroMetrics',
      'roadmap', 'contributors', 'artifacts',
    ] as const) {
      if (content[path] !== undefined) {
        out[path] = {
          tier: 'project_facts',
          origin: { kind: 'project_field', projectId, fieldName: path },
          recordedAt,
        };
      }
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────── build ──── */

/**
 * Build the snapshot. PURE apart from one clock read (for `generatedAt` and
 * provenance timestamps, neither of which is hashed) and one log line.
 */
export function buildCaseStudySnapshot(input: CaseStudySnapshotInput): CaseStudySnapshotDraft {
  const correlationId = ensureTraceId(input.correlationId);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    log('snapshot_build', 'failure', correlationId, {
      case_study_id: String(input?.caseStudyId ?? ''), error_class: 'ValidationError',
    });
    throw new CaseStudySnapshotError(
      'ValidationError',
      `Invalid snapshot input: ${issue.path.join('.') || '(root)'} ${issue.message}`,
      { path: issue.path.join('.'), code: issue.code },
    );
  }

  const { platform } = input;
  const repos = input.repos ?? [];
  const generatedAt = (input.now ? input.now() : new Date()).toISOString();
  const generatedBy = input.generatedBy ?? (repos.length > 0 ? 'repo_sync' : 'platform_sync');

  const { heroMetrics, measurement } = buildMetrics(platform, repos);
  const generated: CaseStudySnapshotContent = {
    identity: buildIdentity(platform),
    heroMetrics,
    situation: platform.situation,
    buildTimeline: buildTimeline(platform, repos),
    architecture: buildArchitecture(platform, repos),
    measurement,
    roadmap: platform.roadmap?.length ? platform.roadmap : undefined,
    contributors: platform.contributors?.length ? platform.contributors : undefined,
    artifacts: platform.artifacts?.length
      ? [...platform.artifacts].sort((a, b) => a.id.localeCompare(b.id))
      : undefined,
    repositories: buildRepositories(repos),
    taxonomy: buildTaxonomy(platform, repos),
  };

  // Generate FIRST, override SECOND. That order is the whole guarantee: a
  // regenerated value can never land on top of a human's correction.
  const merged = applyOverrides(generated, input.overrides ?? []);
  const provenance: CaseStudyProvenance = {
    ...generatedProvenance(merged.content, repos, platform.projectId, generatedAt),
    ...merged.entries,
  };

  const sourceCommitMap = buildSourceCommitMap(repos);
  const contentHash = hashCanonical({ content: merged.content, sourceCommitMap });

  log('snapshot_build', 'success', correlationId, {
    case_study_id: input.caseStudyId,
    content_hash: contentHash,
    repo_count: repos.length,
    repo_refs: logRefs(repos),
    override_count: input.overrides?.length ?? 0,
    applied_overrides: merged.applied.length,
    ignored_overrides: merged.ignored.length,
    section_count: Object.values(merged.content).filter((v) => v !== undefined).length,
    generated_by: generatedBy,
  });

  return {
    content: merged.content,
    provenance,
    sourceCommitMap,
    contentHash,
    generatedAt,
    generatedBy,
    appliedOverrides: merged.applied,
    ignoredOverrides: merged.ignored,
  };
}
