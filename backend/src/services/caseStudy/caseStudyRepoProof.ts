/**
 * Case Study OS — step 3 of the Studio: what the repository proves, and what it
 * cannot.
 *
 * REUSES `analyzeRepository` UNCHANGED. `STORY_STUDIO_CURRENT_STATE.md` §7
 * establishes it takes `{ owner, repo }`, imports no Sequelize model, carries no
 * CaseStudy identity, writes nothing and is "idempotent by construction" — so
 * it serves a Studio analyze step exactly as it is. This file adds no reading
 * capability whatsoever; it is a presentation layer over the analyzer's output
 * plus the honesty half the analyzer does not carry.
 *
 * THE HONESTY HALF IS THE POINT OF THE FILE.
 *
 * An analyze step that lists twenty findings and no limits reads as a completed
 * investigation, and the operator's next move is to write a story as though the
 * repository had established the whole thing. So `cannotProve` is REQUIRED by
 * the type and non-empty by construction: `REPO_STRUCTURAL_LIMITS` is appended
 * on every path, including the failure paths, because a repository that could
 * not be read proves even less than one that could.
 *
 * The four limits are constants rather than derived, because they are
 * properties of what a git repository IS rather than of what any particular one
 * contains. A repository with a `TESTIMONIALS.md` in it still cannot prove that
 * a client said those words.
 */

import type { CaseStudyRepoProof } from '../../types/caseStudyStory';
import { REPO_STRUCTURAL_LIMITS } from '../../types/caseStudyStory';
import { analyzeRepository } from './caseStudyRepoAnalyzer';
import type { AnalyzeRepositoryInput } from './caseStudyRepoAnalyzer';

/** Bounded so a pathological repository cannot produce an unreadable panel. */
const MAX_LISTED = 20;

const take = (values: readonly string[]): readonly string[] =>
  Array.from(new Set(values.filter((v) => typeof v === 'string' && v.trim().length > 0)))
    .slice(0, MAX_LISTED);

/**
 * Statements the repository's own contents support.
 *
 * Every entry names the evidence that produced it, because "uses TypeScript" is
 * a claim and "the manifest declares TypeScript" is a citation, and only the
 * second one survives somebody asking how we know.
 */
function provenFacts(facts: {
  readonly derived: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly fileCount: number;
  readonly filesRead: readonly string[];
}): readonly string[] {
  const out: string[] = [];
  const d = facts.derived;
  const m = facts.metadata;

  const languages = Array.isArray(d.languages) ? (d.languages as string[]) : [];
  if (languages.length > 0) {
    out.push(`Source in ${take(languages).join(', ')} — from GitHub's own language byte counts.`);
  }
  const frameworks = Array.isArray(d.frameworks) ? (d.frameworks as string[]) : [];
  if (frameworks.length > 0) {
    out.push(`Builds on ${take(frameworks).join(', ')} — declared in the dependency manifest.`);
  }
  const databases = Array.isArray(d.databases) ? (d.databases as string[]) : [];
  if (databases.length > 0) {
    out.push(`Talks to ${take(databases).join(', ')} — from manifest dependencies.`);
  }
  const testFrameworks = Array.isArray(d.testFrameworks) ? (d.testFrameworks as string[]) : [];
  if (testFrameworks.length > 0) {
    out.push(`Carries an automated test setup (${take(testFrameworks).join(', ')}) — declared, not measured. This says tests exist, never that they pass or what they cover.`);
  }
  const ciProviders = Array.isArray(d.ciProviders) ? (d.ciProviders as string[]) : [];
  if (ciProviders.length > 0) {
    out.push(`Has CI configured (${take(ciProviders).join(', ')}) — a config file is present.`);
  }
  if (typeof facts.fileCount === 'number' && facts.fileCount > 0) {
    out.push(`${facts.fileCount} files in the tree at the commit that was read.`);
  }
  if (typeof m.visibility === 'string') {
    out.push(`Repository visibility is ${m.visibility} — read from the GitHub API, not assumed.`);
  }
  if (typeof m.license === 'string' && m.license.length > 0) {
    out.push(`Licensed ${m.license}.`);
  }
  return take(out);
}

/**
 * Findings that are specific to THIS repository and still not proof. They join
 * the four structural limits rather than replacing them.
 */
function contingentLimits(derived: Record<string, unknown>): readonly string[] {
  const out: string[] = [];
  if (!derived.testFrameworks || (Array.isArray(derived.testFrameworks) && derived.testFrameworks.length === 0)) {
    out.push('Quality. No test framework was detected, so nothing here speaks to correctness.');
  }
  if (typeof derived.deploymentUrl !== 'string' || derived.deploymentUrl.length === 0) {
    out.push('A running deployment. No deployment URL was found in the repository.');
  }
  return out;
}

export interface RepoProofInput extends AnalyzeRepositoryInput {}

/**
 * Analyse one repository and return both halves.
 *
 * FAILURE IS A RESULT, NOT AN EXCEPTION. When the analyzer refuses — repo not
 * found, unauthorized, rate limited, timeout — the proof comes back with an
 * empty `proves`, the analyzer's real `accessStatus`, and a `cannotProve` that
 * leads with the fact that nothing could be read. The alternative, throwing,
 * would leave the Studio showing an error where a reviewer needs a statement.
 */
export async function proveRepository(input: RepoProofInput): Promise<CaseStudyRepoProof> {
  const outcome = await analyzeRepository(input);

  if (outcome.status === 'failed') {
    return {
      owner: input.owner,
      repo: input.repo,
      proves: [],
      cannotProve: [
        `Anything at all. The repository could not be read (${outcome.error.error_class}).`,
        ...REPO_STRUCTURAL_LIMITS,
      ],
      technologies: [],
      architectureSignals: [],
      firstCommitAt: null,
      lastCommitAt: null,
      candidateArtifacts: [],
      accessStatus: outcome.error.error_class,
    };
  }

  const facts = outcome.facts as unknown as {
    derived: Record<string, unknown>;
    metadata: Record<string, unknown>;
    documents: readonly { path: string }[];
    filesRead: readonly string[];
    fileCount: number;
    accessStatus: string;
  };
  const derived = facts.derived ?? {};
  const metadata = facts.metadata ?? {};

  const technologies = take([
    ...(Array.isArray(derived.languages) ? derived.languages as string[] : []),
    ...(Array.isArray(derived.frameworks) ? derived.frameworks as string[] : []),
    ...(Array.isArray(derived.databases) ? derived.databases as string[] : []),
    ...(Array.isArray(derived.aiSdks) ? derived.aiSdks as string[] : []),
    ...(Array.isArray(derived.aiProviders) ? derived.aiProviders as string[] : []),
  ]);

  const architectureSignals = take([
    ...(Array.isArray(derived.agentClues) ? derived.agentClues as string[] : []),
    ...(Array.isArray(derived.ciProviders) ? derived.ciProviders as string[] : []),
    ...(Array.isArray(derived.testFrameworks) ? derived.testFrameworks as string[] : []),
  ]);

  const iso = (value: unknown): string | null =>
    (typeof value === 'string' && value.length > 0 ? value : null);

  return {
    owner: input.owner,
    repo: input.repo,
    proves: provenFacts({
      derived, metadata, fileCount: facts.fileCount, filesRead: facts.filesRead ?? [],
    }),
    // Contingent first, then the four that are always true. Never empty.
    cannotProve: [...contingentLimits(derived), ...REPO_STRUCTURAL_LIMITS],
    technologies,
    architectureSignals,
    // `createdAt`, never `pushedAt` — a date that moves on every push cannot be
    // hashed, which is why the sync's timeline builder makes the same choice.
    firstCommitAt: iso(metadata.createdAt),
    lastCommitAt: iso(metadata.pushedAt),
    candidateArtifacts: take((facts.documents ?? []).map((d) => d.path)),
    accessStatus: facts.accessStatus ?? 'ok',
  };
}
