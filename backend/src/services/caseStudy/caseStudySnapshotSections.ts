/**
 * caseStudySnapshotSections — the pure assemblers for each section of
 * `CaseStudySnapshotContent`. No I/O, no clock, no randomness, no logging.
 *
 * TWO RULES GOVERN EVERY FUNCTION HERE, and both exist to serve spec §30's
 * "same inputs ⇒ same hash":
 *
 * 1. NOTHING VOLATILE. No `Date.now()`, no `new Date()`, no run id, no
 *    `lastSyncedAt`. `sbp/buildProgressSnapshot.ts` states the same discipline
 *    for the same reason — its output decides whether we commit to a student's
 *    repo, ours decides whether we write a new snapshot version. A moving value
 *    would produce a new version on every sync forever.
 * 2. NOTHING INCIDENTALLY ORDERED. `canonicalize()` erases key order but
 *    deliberately preserves ARRAY order, because a timeline's order is
 *    meaningful. So any array whose order is an accident of how the caller
 *    happened to iterate — repositories, languages, capabilities, metrics — is
 *    sorted here, by a total order, before it can reach the hash.
 *
 * SOURCE PRECEDENCE (spec §9) runs one way: platform Project facts outrank a
 * repository manifest, which outranks anything extracted from the file tree.
 * `firstDefined()` is that rule, written once.
 */
import { sortUnique } from './repoFactExtractors';
import type { CaseStudyManifest } from './caseStudyManifestReader';
import type { SnapshotPlatformFacts, SnapshotRepoInput } from './caseStudySnapshotInput';
import type {
  CaseStudyArchitectureSection,
  CaseStudyIdentitySection,
  CaseStudyMeasurementSection,
  CaseStudyMetricEntry,
  CaseStudyRepositoryRef,
  CaseStudyTaxonomy,
  CaseStudyTimelineEntry,
} from '../../types/caseStudy';

/** Same cap the fact extractors use, so one facet list cannot outgrow another. */
const LIST_CAP = 60;

/* ─────────────────────────────────────────────────────────────── helpers ──── */

function firstDefined<T>(...candidates: (T | null | undefined)[]): T | undefined {
  for (const c of candidates) if (c !== undefined && c !== null && c !== '') return c;
  return undefined;
}

/** `owner/name`, lowercased — the total order every repo-derived array sorts by. */
export function repoKey(owner: string, name: string): string {
  return `${owner.toLowerCase()}/${name.toLowerCase()}`;
}

/** Primary repo first (it is the story's spine), then alphabetical. Deterministic either way. */
function orderedRepos(repos: readonly SnapshotRepoInput[]): readonly SnapshotRepoInput[] {
  return [...repos].sort((a, b) => {
    const primary = Number(b.role === 'primary') - Number(a.role === 'primary');
    if (primary !== 0) return primary;
    return repoKey(a.facts.repoOwner, a.facts.repoName)
      .localeCompare(repoKey(b.facts.repoOwner, b.facts.repoName));
  });
}

/** Manifests in precedence order: the primary repo's declaration is read first. */
function orderedManifests(repos: readonly SnapshotRepoInput[]): readonly CaseStudyManifest[] {
  const out: CaseStudyManifest[] = [];
  for (const repo of orderedRepos(repos)) if (repo.manifest) out.push(repo.manifest);
  return out;
}

function fromManifests<T>(
  repos: readonly SnapshotRepoInput[], pick: (m: CaseStudyManifest) => T | undefined,
): T | undefined {
  for (const manifest of orderedManifests(repos)) {
    const value = pick(manifest);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** An ISO instant reduced to its calendar day, or null if it is not a date at all. */
function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

/* ────────────────────────────────────────────────────────────── identity ──── */

export function buildIdentity(platform: SnapshotPlatformFacts): CaseStudyIdentitySection {
  return {
    slug: platform.slug,
    title: platform.title,
    standfirst: platform.standfirst,
    summary: platform.summary,
    organizationDisplayName: platform.organizationDisplayName,
    organizationIdentityMode: platform.organizationIdentityMode,
    organizationNamingConsent: platform.organizationNamingConsent,
    builderIdentityMode: platform.builderIdentityMode,
    builderNamingConsent: platform.builderNamingConsent,
    builtByType: platform.builtByType,
    programLabel: platform.programLabel,
    engagementWindow: platform.engagementWindow,
    productionStatus: platform.productionStatus,
  };
}

/* ────────────────────────────────────────────────────────── repositories ──── */

/**
 * The cited repositories, as held internally.
 *
 * `lastSyncedAt` is ON the type and is deliberately NOT set. It is the single
 * most volatile field in the domain — it moves on every sync by definition — and
 * a snapshot carrying it would hash differently every run and version forever.
 * It lives on the `case_study_repositories` row, which is mutable state about
 * the connection, not immutable content about the story.
 */
export function buildRepositories(
  repos: readonly SnapshotRepoInput[],
): readonly CaseStudyRepositoryRef[] | undefined {
  if (repos.length === 0) return undefined;
  return [...repos]
    .sort((a, b) => repoKey(a.facts.repoOwner, a.facts.repoName)
      .localeCompare(repoKey(b.facts.repoOwner, b.facts.repoName)))
    .map((repo) => ({
      repoOwner: repo.facts.repoOwner,
      repoName: repo.facts.repoName,
      repoUrl: repo.facts.repoUrl,
      role: repo.role,
      visibility: repo.facts.metadata.visibility,
      accessStatus: repo.facts.accessStatus,
      allowPublicRepoLink: repo.allowPublicRepoLink,
      defaultBranch: repo.facts.metadata.defaultBranch || undefined,
      lastSeenSha: repo.facts.metadata.latestCommitSha || undefined,
    }));
}

/** `owner/name` ⇒ sha, for the `source_commit_map` column. Repos with no head sha are omitted. */
export function buildSourceCommitMap(
  repos: readonly SnapshotRepoInput[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const repo of repos) {
    const sha = repo.facts.metadata.latestCommitSha;
    if (sha) map[repoKey(repo.facts.repoOwner, repo.facts.repoName)] = sha;
  }
  return map;
}

/* ────────────────────────────────────────────────────────── architecture ──── */

export function buildArchitecture(
  platform: SnapshotPlatformFacts, repos: readonly SnapshotRepoInput[],
): CaseStudyArchitectureSection | undefined {
  const stack = sortUnique([
    ...repos.flatMap((r) => [...r.facts.derived.languages, ...r.facts.derived.frameworks]),
    ...(fromManifests(repos, (m) => m.classification?.stack) ?? []),
  ], LIST_CAP);
  const capabilities = sortUnique([
    ...(fromManifests(repos, (m) => m.classification?.capabilities) ?? []),
    ...repos.flatMap((r) => r.facts.derived.agentClues),
  ], LIST_CAP);
  const integrations = sortUnique(
    repos.flatMap((r) => [...r.facts.derived.aiSdks, ...r.facts.derived.aiProviders]), LIST_CAP,
  );
  const dataStores = sortUnique(repos.flatMap((r) => r.facts.derived.databases), LIST_CAP);
  const narrative = platform.architectureNarrative;

  const empty = stack.length === 0 && capabilities.length === 0 && integrations.length === 0
    && dataStores.length === 0 && !narrative?.length && !platform.architectureDiagram;
  // Spec §23: a section with nothing behind it is HIDDEN, not rendered empty.
  if (empty) return undefined;

  return {
    narrative: narrative?.length ? narrative : undefined,
    stack,
    capabilities,
    integrations: integrations.length ? integrations : undefined,
    dataStores: dataStores.length ? dataStores : undefined,
    diagram: platform.architectureDiagram,
  };
}

/* ─────────────────────────────────────────────────────────────── metrics ──── */

/**
 * Manifest `outcomes` become metric CANDIDATES, never published figures: the
 * manifest reader pins `verificationClass: 'pending'` whatever the author wrote,
 * and `publishable: false` here keeps that true one layer further on. A platform
 * metric with the same key wins outright — `approved_metric_evidence` outranks
 * `repo_manifest` in spec §9's precedence.
 */
export function buildMetrics(
  platform: SnapshotPlatformFacts, repos: readonly SnapshotRepoInput[],
): { heroMetrics: readonly CaseStudyMetricEntry[]; measurement?: CaseStudyMeasurementSection } {
  const byKey = new Map<string, CaseStudyMetricEntry>();

  for (const manifest of orderedManifests(repos)) {
    for (const outcome of manifest.outcomes ?? []) {
      if (byKey.has(outcome.key)) continue;
      byKey.set(outcome.key, {
        key: outcome.key,
        label: outcome.label,
        valueDisplay: outcome.valueDisplay,
        metricType: 'business_outcome',
        verification: { class: 'pending', method: outcome.verificationMethod ?? 'self' },
        isHeadline: false,
        publishable: false,
      });
    }
  }
  for (const metric of platform.metrics ?? []) byKey.set(metric.key, metric);

  const all = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const heroMetrics = all.filter((m) => m.isHeadline);
  const narrative = platform.measurementNarrative;

  if (all.length === 0 && !narrative?.length) return { heroMetrics };
  return {
    heroMetrics,
    measurement: { narrative: narrative?.length ? narrative : undefined, metrics: all },
  };
}

/* ────────────────────────────────────────────────────────────── timeline ──── */

/**
 * Platform timeline entries plus one milestone per repository: the day it was
 * created. That date is fixed forever, which is what makes it safe to hash —
 * `pushedAt` would move on every push and is therefore never used here.
 */
export function buildTimeline(
  platform: SnapshotPlatformFacts, repos: readonly SnapshotRepoInput[],
): readonly CaseStudyTimelineEntry[] | undefined {
  const entries: CaseStudyTimelineEntry[] = [...(platform.timeline ?? [])];

  for (const repo of orderedRepos(repos)) {
    const date = isoDay(repo.facts.metadata.createdAt);
    if (!date) continue;
    entries.push({
      date,
      label: 'Repository created',
      source: 'milestone',
      sourceRef: repoKey(repo.facts.repoOwner, repo.facts.repoName),
      verification: { class: 'verified', method: 'repo' },
    });
  }
  if (entries.length === 0) return undefined;

  const seen = new Set<string>();
  return entries
    .filter((e) => {
      const key = `${e.date}|${e.label}|${e.sourceRef ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)));
}

/* ────────────────────────────────────────────────────────────── taxonomy ──── */

export function buildTaxonomy(
  platform: SnapshotPlatformFacts, repos: readonly SnapshotRepoInput[],
): CaseStudyTaxonomy {
  const architecture = buildArchitecture(platform, repos);
  return {
    industry: firstDefined(platform.industry, fromManifests(repos, (m) => m.classification?.industry)),
    primaryCapability: firstDefined(
      platform.primaryCapability,
      fromManifests(repos, (m) => m.classification?.capabilities?.[0]),
    ),
    capabilities: architecture?.capabilities ?? [],
    stack: architecture?.stack ?? [],
    programKey: firstDefined(platform.programKey, fromManifests(repos, (m) => m.builtBy?.program)),
    builtByType: firstDefined(platform.builtByType, fromManifests(repos, (m) => m.builtBy?.type)),
    deliverables: sortUnique(platform.deliverables ?? [], LIST_CAP),
    projectStatus: firstDefined(platform.projectStatus, platform.productionStatus?.status),
  };
}
