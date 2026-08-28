/**
 * caseStudyPublicSections - the leaf builders of the public projection.
 *
 * READ `caseStudyPublicProjection.ts` FIRST; it carries the doctrine and it is
 * the only import site callers need. This file is the leaf it composes, split
 * out for CLAUDE.md's size targets on the same precedent as
 * `caseStudySnapshotBuilder` + `caseStudySnapshotSections`. The dependency runs
 * one way: the projection imports this; nothing here imports the projection.
 * `caseStudyArtifactPresentation.ts` is a second leaf below this one, holding
 * the atmosphere/evidence rules; this imports that, never the reverse.
 *
 * EVERY FUNCTION HERE BUILDS AN OBJECT LITERAL FIELD BY NAMED FIELD. There is no
 * spread of an internal object anywhere in this file, no `Object.assign`, no
 * round-trip through `JSON.parse`. That is what makes the public payload an
 * explicit allow-list rather than a filtered snapshot: an internal field arrives
 * only when a human types its name into one of these literals.
 *
 * ONE RULE ABOUT UNVERIFIED FACTS. Nothing whose verification class is `pending`
 * is projected - not a metric, not a timeline entry, not a roadmap item, not the
 * situation. `pairOf()` is the single place that decides it, and it fails closed
 * on a missing or malformed verification as well.
 *
 * PURE. No model, no Express, no `fetch`, no clock. Anything unreadable is
 * DROPPED rather than rendered, so bad data degrades to a shorter page and never
 * to a leak or a 500.
 */

import {
  HERO_IMAGE_PRIORITY,
  artifactPresentation,
  describesDeliveredWork,
} from './caseStudyArtifactPresentation';
import { normalizeFacetList } from './caseStudyFilterService';
import {
  assertNever,
  isCaseStudyVerificationMethod,
  isPublicVerificationClass,
} from '../../types/caseStudyGuards';
import type {
  CaseStudyArtifactRef,
  CaseStudyContributor,
  CaseStudyMetricEntry,
  CaseStudyRepositoryRef,
  CaseStudyRoadmapItem,
  CaseStudySnapshotContent,
  CaseStudyTimelineEntry,
  CaseStudyTimelineSource,
  CaseStudyVerification,
  CaseStudyVerificationMethod,
} from '../../types/caseStudy';
import type {
  PublicCaseStudyArchitecture,
  PublicCaseStudyArtifact,
  PublicCaseStudyContributor,
  PublicCaseStudyMeasurement,
  PublicCaseStudyMetric,
  PublicCaseStudySituation,
  PublicCaseStudyRepository,
  PublicCaseStudyRoadmapItem,
  PublicCaseStudyTimelineEntry,
  PublicVerificationClass,
} from '../../types/caseStudyPublic';

/* ------------------------------------------------------------- helpers --- */

export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export const arr = <T>(v: readonly T[] | undefined | null): readonly T[] => (Array.isArray(v) ? v : []);
const lines = (v: readonly unknown[] | undefined | null): string[] =>
  arr(v).map(text).filter((s) => s.length > 0);

/**
 * The only URLs a public page may carry. A `javascript:` or `data:` URL in an
 * artifact row would be a stored XSS payload the moment a renderer put it in an
 * href, and an artifact row is admin-editable, so this is a real path and not a
 * theoretical one. Anything that is not absolute http(s) is dropped.
 */
export function safeHttpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

export const truncate = (value: string, max: number): string =>
  (value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`);

/* ------------------------------------------------------- verification --- */

export interface PublicVerificationPair {
  readonly verificationClass: PublicVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
}

const RANK: Readonly<Record<PublicVerificationClass, number>> = Object.freeze({
  verified: 3, anonymized: 2, illustrative: 1,
});

/** `null` for a missing, malformed or still-`pending` verification. Fail closed. */
export function pairOf(v: CaseStudyVerification | undefined): PublicVerificationPair | null {
  if (!v) return null;
  if (!isPublicVerificationClass(v.class)) return null;
  if (!isCaseStudyVerificationMethod(v.method)) return null;
  return { verificationClass: v.class, verificationMethod: v.method };
}

const publishableMetrics = (metrics: readonly CaseStudyMetricEntry[]): CaseStudyMetricEntry[] =>
  arr(metrics).filter((m) => m && m.publishable === true);

/**
 * The record's own badge, derived rather than stored.
 *
 * It is the STRONGEST class the record can actually evidence, taken from every
 * fact that carries a verification: publishable metrics first, then the
 * production status, the engagement window and the situation. A record that can
 * evidence nothing falls back to `illustrative`, which spec §14 hides from the
 * default index - so "we forgot to verify it" fails closed to "not shown"
 * rather than open to "looks verified".
 */
export function resolveRecordVerification(
  content: CaseStudySnapshotContent,
): PublicVerificationPair {
  const candidates: (PublicVerificationPair | null)[] = [];
  const hero = publishableMetrics(content?.heroMetrics ?? []);
  for (const m of hero.filter((m) => m.isHeadline === true)) candidates.push(pairOf(m.verification));
  for (const m of hero.filter((m) => m.isHeadline !== true)) candidates.push(pairOf(m.verification));
  for (const m of publishableMetrics(content?.measurement?.metrics ?? [])) {
    candidates.push(pairOf(m.verification));
  }
  candidates.push(pairOf(content?.identity?.productionStatus?.verification));
  candidates.push(pairOf(content?.identity?.engagementWindow?.verification));
  candidates.push(pairOf(content?.situation?.verification));

  let best: PublicVerificationPair | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (!best || RANK[c.verificationClass] > RANK[best.verificationClass]) best = c;
  }
  return best ?? { verificationClass: 'illustrative', verificationMethod: 'internal' };
}

/* ------------------------------------------------------------ metrics --- */

export function projectMetric(metric: CaseStudyMetricEntry): PublicCaseStudyMetric | null {
  if (!metric || metric.publishable !== true) return null;
  const pair = pairOf(metric.verification);
  if (!pair) return null;
  const label = text(metric.label);
  const valueDisplay = text(metric.valueDisplay);
  if (!label || !valueDisplay) return null;
  const ctx = metric.measurement;
  return {
    label,
    valueDisplay,
    unit: text(metric.unit) || null,
    verificationClass: pair.verificationClass,
    verificationMethod: pair.verificationMethod,
    baseline: text(ctx?.baseline) || null,
    sample: text(ctx?.sample) || null,
    methodology: text(ctx?.methodology) || null,
    limitations: lines(ctx?.limitations),
  };
}

export const projectMetrics = (metrics: readonly CaseStudyMetricEntry[]): PublicCaseStudyMetric[] =>
  arr(metrics).map(projectMetric).filter((m): m is PublicCaseStudyMetric => m !== null);

/* ----------------------------------------------------------- sections --- */

/** Internal references (`sourceRef`, a commit sha) never cross; only the kind. */
function timelineKind(source: CaseStudyTimelineSource): PublicCaseStudyTimelineEntry['sourceKind'] {
  switch (source) {
    case 'commit': case 'pull_request': case 'release': return 'repository';
    case 'project_stage': return 'delivery';
    case 'artifact': return 'artifact';
    case 'milestone': case 'manual': return 'milestone';
    default: return assertNever(source, 'CaseStudyTimelineSource');
  }
}

export function projectTimeline(
  entries: readonly CaseStudyTimelineEntry[],
): PublicCaseStudyTimelineEntry[] {
  const out: PublicCaseStudyTimelineEntry[] = [];
  for (const e of arr(entries)) {
    if (!e || !pairOf(e.verification)) continue;
    const date = text(e.date);
    const label = text(e.label);
    if (!date || !label) continue;
    out.push({
      date,
      endDate: text(e.endDate) || null,
      label,
      detail: text(e.detail) || null,
      sourceKind: timelineKind(e.source),
    });
  }
  return out;
}

/** How much mermaid source a public page will carry. Longer is a paste accident. */
export const MAX_DIAGRAM_SOURCE_CHARS = 8000;

/**
 * The human-authored chart's source, sanitised, or null.
 *
 * `<` IS REFUSED OUTRIGHT. The renderer hands mermaid's output to `innerHTML`,
 * so the chart source is a markup channel whether or not anyone intended one.
 * Mermaid's own `securityLevel: 'strict'` default escapes labels, but this
 * module cannot see the renderer's configuration and must not depend on it — a
 * later change to a shared component would silently reopen the hole. Flowchart
 * syntax needs no angle bracket, so refusing the character costs a `<br/>` in a
 * node label and closes the channel at the boundary instead of trusting a
 * setting three modules away.
 *
 * Length is capped for the same reason the facet lists are: a public payload
 * with an unbounded string in it is a denial-of-service surface, not a diagram.
 */
export function projectDiagramSource(value: unknown): string | null {
  const source = text(value);
  if (!source) return null;
  if (source.length > MAX_DIAGRAM_SOURCE_CHARS) return null;
  if (source.includes('<')) return null;
  return source;
}

export function projectArchitecture(
  content: CaseStudySnapshotContent,
): PublicCaseStudyArchitecture | null {
  const a = content?.architecture;
  if (!a) return null;
  const narrative = lines(a.narrative);
  const stack = normalizeFacetList(a.stack);
  const capabilities = normalizeFacetList(a.capabilities);
  const integrations = normalizeFacetList(a.integrations);
  // Same normalisation as the three lists above, so "PostgreSQL" and "postgres"
  // cannot both appear and a reader is not asked to work out whether they are
  // two systems. The field is assembled from repository evidence and counted by
  // the snapshot's own emptiness check, but until now had no public shape to
  // arrive in.
  const dataStores = normalizeFacetList(a.dataStores);
  // `id` becomes `key`: on every other shape here `id` means a database
  // identifier, and a public payload carrying a field called `id` invites the
  // wrong thing to be put in it. This one is a graph label ("api", "worker").
  const nodes = arr(a.diagram?.nodes)
    .filter((n) => n && text(n.id) && text(n.label))
    .map((n) => ({ key: text(n.id), label: text(n.label), kind: text(n.kind) }));
  const edges = arr(a.diagram?.edges)
    .filter((e) => e && text(e.from) && text(e.to))
    .map((e) => ({ from: text(e.from), to: text(e.to), label: text(e.label) || null }));
  const diagram = nodes.length > 0 ? { nodes, edges } : null;
  const diagramSource = projectDiagramSource(a.diagramSource);
  // `dataStores` joins the emptiness test, which makes this agree with the
  // snapshot builder: `caseStudySnapshotSections.ts:168` already counts data
  // stores when deciding whether an architecture section exists at all. Before
  // this, a repository that evidenced a database and nothing else produced a
  // snapshot section here and a `null` projection there — the section existed
  // and could never be read. The frontend's own two guards
  // (`architectureHasContent`, `CaseStudyArchitecture`'s `empty`) are updated in
  // the same change, because a projection that survives and then hides on the
  // client is the same defect one layer up.
  if (!narrative.length && !stack.length && !capabilities.length && !integrations.length
    && !dataStores.length && !diagram && !diagramSource) {
    return null;
  }
  return { narrative, stack, capabilities, integrations, dataStores, diagram, diagramSource };
}

/**
 * The situation band.
 *
 * THE NARRATIVE IS STILL WHAT DECIDES WHETHER THE BAND EXISTS. `constraints` and
 * `goals` are projected alongside it but deliberately do NOT rescue a record with
 * no narrative: a band headed "The situation" whose entire content is a bullet
 * list of goals is not a situation, and the pre-existing rule — hide rather than
 * render thin — is the one this page is built on. Widening the guard to
 * `!body.length && !constraints.length && !goals.length` would have been the
 * easy change and the wrong one.
 *
 * THE VERIFICATION GATE ALSO STAYS AHEAD OF EVERYTHING. `pairOf(s.verification)`
 * fails closed, so an unreadable verification pair drops the whole band
 * including the two new lists. They are not a side door around it.
 */
export function projectSituation(content: CaseStudySnapshotContent): PublicCaseStudySituation | null {
  const s = content?.situation;
  if (!s || !pairOf(s.verification)) return null;
  const body = lines(s.narrative);
  if (!body.length) return null;
  return {
    heading: 'The situation',
    body,
    constraints: lines(s.constraints),
    goals: lines(s.goals),
  };
}

export function projectMeasurement(content: CaseStudySnapshotContent): PublicCaseStudyMeasurement | null {
  const m = content?.measurement;
  if (!m) return null;
  const narrative = lines(m.narrative);
  const metrics = projectMetrics(m.metrics ?? []);
  if (!narrative.length && !metrics.length) return null;
  return { narrative, metrics };
}

export function projectRoadmap(items: readonly CaseStudyRoadmapItem[]): PublicCaseStudyRoadmapItem[] {
  const out: PublicCaseStudyRoadmapItem[] = [];
  for (const i of arr(items)) {
    if (!i || !pairOf(i.verification)) continue;
    const label = text(i.label);
    if (!label) continue;
    out.push({ label, status: i.status, detail: text(i.detail) || null });
  }
  return out;
}

/* -------------------------------------------------------- consented people --- */

export interface ContributorProjection {
  readonly contributors: readonly PublicCaseStudyContributor[];
  readonly anonymousContributorCount: number;
}

/**
 * A named contributor survives only when the record's builder mode is `named`,
 * BOTH consent flags are true and a consent timestamp exists. Anything short of
 * that is DOWNGRADED to the role, not dropped, so honest crediting never costs
 * somebody their privacy and never silently deletes their contribution. A
 * contributor with no role left to show becomes one increment of the count.
 */
export function projectContributors(content: CaseStudySnapshotContent): ContributorProjection {
  const identity = content?.identity;
  const consented = identity?.builderIdentityMode === 'named'
    && identity?.builderNamingConsent === true;
  const out: PublicCaseStudyContributor[] = [];
  let anonymous = 0;
  for (const c of arr<CaseStudyContributor>(content?.contributors)) {
    if (!c) { anonymous += 1; continue; }
    // Narrow structural cast, not `any`: the `anonymous` variant has no `role`
    // by design, and reading it as possibly-absent is the whole question here.
    const role = text((c as { role?: string }).role);
    const named = c.displayMode === 'named'
      && consented
      && text(c.consentRecordedAt).length > 0
      && text(c.displayName).length > 0;
    if (named && c.displayMode === 'named') {
      out.push({ displayMode: 'named', displayName: text(c.displayName), role, kind: c.kind });
      continue;
    }
    if (c.displayMode !== 'anonymous' && role) {
      out.push({ displayMode: 'role_only', role, kind: c.kind });
      continue;
    }
    anonymous += 1;
  }
  return { contributors: out, anonymousContributorCount: anonymous };
}

/* ------------------------------------------------------------ artifacts --- */

export function projectArtifacts(
  artifacts: readonly CaseStudyArtifactRef[],
): PublicCaseStudyArtifact[] {
  const out: PublicCaseStudyArtifact[] = [];
  for (const a of arr(artifacts)) {
    if (!a || a.status !== 'approved') continue;
    const title = text(a.title);
    if (!title) continue;
    const description = text(a.description) || null;
    const presentation = artifactPresentation(a.artifactType);
    // FAIL CLOSED ON A PHOTOGRAPH THAT CLAIMS TO BE EVIDENCE. The title and the
    // description are scanned together because a reader reads them together;
    // either one carrying a delivered-work claim drops the whole row, rather
    // than publishing the picture under a caption we had to edit. Only
    // atmosphere is scanned: a screenshot titled "the shipped dashboard" is
    // describing itself accurately and must not be suppressed.
    if (presentation === 'atmosphere'
      && (describesDeliveredWork(title) || describesDeliveredWork(description))) {
      continue;
    }
    if (a.visibility === 'public') {
      const url = safeHttpUrl(a.publicUrl);
      if (!url) continue;
      out.push({
        access: 'open',
        artifactType: a.artifactType,
        presentation,
        title,
        description,
        url,
        previewUrl: safeHttpUrl(a.previewUrl),
      });
      continue;
    }
    if (a.visibility === 'request_only') {
      out.push({ access: 'request', artifactType: a.artifactType, presentation, title, description });
    }
    // `private` falls through: no shape, no dead control, no row.
  }
  return out;
}

/* --------------------------------------------------------- repositories --- */

export interface RepositoryProjection {
  readonly repositories: readonly PublicCaseStudyRepository[];
  readonly privateRepositoryCount: number;
}

/**
 * Three independent gates (spec §16): the repository is `public`, it carries
 * `allowPublicRepoLink`, and its URL is a real http(s) URL. Every source
 * repository that does not clear all three is WITHHELD and counted - counting
 * only `visibility === 'private'` would let a repository whose visibility we
 * could not read vanish from the provenance count entirely, and `unknown` is
 * exactly the case where guessing "probably public" is wrong.
 *
 * `lastCommitDate` is always null: the snapshot's repository ref carries
 * `lastSyncedAt` (when WE read it), which is not when the repository was last
 * committed to. Publishing a sync timestamp as a commit date would be a false
 * claim, and this system's entire argument is that its numbers are not.
 */
export function projectRepositories(
  repositories: readonly CaseStudyRepositoryRef[],
): RepositoryProjection {
  const out: PublicCaseStudyRepository[] = [];
  let withheld = 0;
  for (const r of arr(repositories)) {
    const url = r ? safeHttpUrl(r.repoUrl) : null;
    if (!r || r.visibility !== 'public' || r.allowPublicRepoLink !== true || !url) {
      withheld += 1;
      continue;
    }
    out.push({
      label: text(r.repoName) || text(r.role) || 'Repository',
      role: r.role,
      url,
      lastCommitDate: null,
    });
  }
  return { repositories: out, privateRepositoryCount: withheld };
}

/* ------------------------------------------------------------- identity --- */

/** Consent-resolved: a real name, an anonymised descriptor, or nothing. */
export function resolveOrganizationLabel(content: CaseStudySnapshotContent): string | null {
  const identity = content?.identity;
  const name = text(identity?.organizationDisplayName);
  if (!name) return null;
  if (identity?.organizationIdentityMode === 'named') {
    return identity?.organizationNamingConsent === true ? name : null;
  }
  if (identity?.organizationIdentityMode === 'anonymized') return name;
  return null;
}

/** The first approved, public, http(s) image among the artifacts. Never a guess. */
export function resolveHeroImage(content: CaseStudySnapshotContent): string | null {
  const approved = projectArtifacts(content?.artifacts ?? []);
  for (const kind of HERO_IMAGE_PRIORITY) {
    for (const a of approved) {
      if (a.access !== 'open' || a.artifactType !== kind) continue;
      const url = safeHttpUrl(a.previewUrl ?? a.url);
      if (url) return url;
    }
  }
  return null;
}
