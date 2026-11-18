/**
 * THE ARTIFACT TYPE CATALOG (phase A0 of the artifact-acceptance plan).
 *
 * Eleven types a story can be asked to hand over. The data lives in
 * `storyArtifactTypes.json` beside this file and this module is the only typed door onto it.
 *
 * ## WHY THIS IS A FILE IN GIT AND NOT ELEVEN ROWS IN `artifact_definitions`
 *
 * The plan said to seed the catalog into `artifact_definitions`, on the reasoning that the
 * table already holds `file_types`, `validation_rule` and `evaluation_criteria`, so no new
 * vocabulary table was needed. Measured against this tree before writing anything, that turned
 * out to be unsafe TODAY, for a reason the plan could not have known:
 *
 *   TWELVE call sites read `artifact_definitions` with NO `where` clause whatsoever, and EIGHT
 *   more pass a `where` that cannot be read from the source, so twenty reads in all could pick
 *   up a catalog row.
 *
 *   services/analyticsService.ts:320        student artifact submissions, per enrollment
 *   services/analyticsService.ts:383        getProgramArtifactTracker, every active student
 *   services/artifactCompilerService.ts:75  student progress against ALL definitions
 *   services/artifactCompilerService.ts:215 student completion against ALL definitions
 *   services/artifactGraphService.ts:91     "root" artifacts, those with no parent
 *   services/curriculumGraphService.ts:163  curriculum graph nodes
 *   services/curriculumGraphService.ts:208  section dependency resolution
 *   services/curriculumGraphService.ts:273  downstream skill usage
 *   services/curriculumManagerService.ts:67 the admin curriculum manager load
 *   services/deepReconciliationService.ts:274 reconciliation against the whole table
 *   services/healthReportService.ts:49      a bare count() on the health report
 *   services/projectProgressService.ts:179  project progress against ALL definitions
 *
 * Every one of those treats a row in that table as a CURRICULUM artifact a student owes. Eleven
 * catalog rows inserted today would therefore make every active student appear to be missing
 * eleven artifacts, would drop every completion percentage the platform reports, and would move
 * a number on the health report with no visible cause. A0's whole premise is that it changes no
 * behavior.
 *
 * That inventory is NOT maintained here. It is derived from the source tree on every test run by
 * `__tests__/artifactDefinitionReaderScope.test.ts`, and the comment above is a copy for a
 * reader. The first hand-written version of this list said eight, from a truncated grep, and was
 * wrong in the flattering direction. The test is the authority.
 *
 * So the catalog ships as reviewed data in git, which is also the better home for a vocabulary
 * that changes by pull request: eleven rows in production can be edited by anyone with a psql
 * prompt and leave no diff. `scripts/seedStoryArtifactTypes.ts` projects this file into
 * `artifact_definitions` for the day a consumer needs to resolve a type from the database, and
 * it REFUSES to write while those eight readers are unscoped. That refusal is not a comment or
 * a flag a future session can talk itself past: `CURRICULUM_READERS_SCOPED` below is checked
 * against the source tree by `__tests__/artifactDefinitionReaderScope.test.ts`, which fails by
 * name if the constant and the tree disagree in either direction.
 *
 * ## WHAT READS WHAT
 *
 * `requires_github_validation` existed on `ArtifactDefinition` as a column nothing read: it was
 * written by nobody and consulted by nobody, on all 146 production rows. Here it is the field
 * that decides whether a contract entry must name a path in the repo, which is the first time
 * it means anything. Same for `requires_screenshot`.
 */
import catalog from './storyArtifactTypes.json';

/**
 * Where the evidence for an artifact of this type comes from. Decision D1, 16 Nov 2026: the repo
 * is the default and every type declares its own home. A repo-only rule would have refused five
 * of the six kinds the interns actually produce, because `case_study`, `field_guide`,
 * `architecture_decision`, `prompt_library` and `claude_studio` carry a repo path zero times
 * across 700 existing rows while `build_artifact` carries one 233 times.
 */
export type ArtifactEvidenceSource = 'repo' | 'platform' | 'either';

export interface StoryArtifactType {
  /** Stable machine name. The value a contract entry's `type` must match. */
  type: string;
  /** Human label, for a ticket body or a page heading. */
  name: string;
  /** Lowercase extensions with no dot. `['*']` means any extension is accepted. */
  file_types: string[];
  evidence_source: ArtifactEvidenceSource;
  /** True exactly when evidence_source is 'repo'. Asserted, not trusted. */
  requires_github_validation: boolean;
  requires_screenshot: boolean;
  /** The sentence a human judges the artifact by. Deliberately not scored by a machine. */
  evaluation_criteria: string;
  /** What the platform already produces of this kind, as measured on 16 Nov 2026. */
  exists_today: string;
  /** Where an artifact of this kind is handed over. Prose, for a reader. */
  handed_over: string;
  sort_order: number;
}

/** The extension wildcard. A type carrying this accepts any extension. */
export const ANY_FILE_TYPE = '*';

/**
 * Whether the twenty `artifact_definitions` readers that could pick up a catalog row (twelve with
 * no `where` at all, eight whose `where` is opaque in the source) have been scoped to exclude
 * them. While false, the seeder refuses to write.
 *
 * DO NOT flip this by hand expecting it to take effect. The reader-scope test re-derives the
 * answer from the source tree on every run and fails if this constant disagrees with it, in
 * either direction, so the only way to make it true is to actually scope the readers.
 */
export const CURRICULUM_READERS_SCOPED = false;

/**
 * The `artifact_role` the seeder stamps on a projected catalog row, and the discriminator the
 * eight readers will have to exclude. Not used by anything that reads today, on purpose.
 */
export const CATALOG_ARTIFACT_ROLE = 'catalog_type';

const TYPES: StoryArtifactType[] = (catalog.types as StoryArtifactType[])
  .slice()
  .sort((a, b) => a.sort_order - b.sort_order);

const BY_TYPE = new Map<string, StoryArtifactType>(TYPES.map((t) => [t.type, t]));

/** Catalog version, so a consumer can record which vocabulary it validated against. */
export const ARTIFACT_CATALOG_VERSION: number = catalog.version;

/** Every type, in sort order. A copy, so a caller cannot mutate the catalog. */
export function artifactTypes(): StoryArtifactType[] {
  return TYPES.map((t) => ({ ...t, file_types: [...t.file_types] }));
}

/** The type, or undefined. Undefined is a real answer here: an unknown type is a refusal. */
export function artifactType(type: string): StoryArtifactType | undefined {
  const found = BY_TYPE.get(type);
  return found ? { ...found, file_types: [...found.file_types] } : undefined;
}

export function isKnownArtifactType(type: string): boolean {
  return BY_TYPE.has(type);
}

/** Type names, for an error message that tells the author what they could have written. */
export function artifactTypeNames(): string[] {
  return TYPES.map((t) => t.type);
}

/** True when this type accepts any extension. */
export function acceptsAnyFileType(t: StoryArtifactType): boolean {
  return t.file_types.includes(ANY_FILE_TYPE);
}

/**
 * Whether an evidence source is permitted for a type. 'either' admits both; a type that names
 * one admits only that one.
 */
export function allowsEvidenceSource(t: StoryArtifactType, source: ArtifactEvidenceSource): boolean {
  if (t.evidence_source === 'either') return source === 'repo' || source === 'platform';
  return source === t.evidence_source;
}

/* ---------------------------------------------------------------------------
 * WHAT PRODUCTION ACTUALLY PRODUCES, AND HOW IT MAPS ONTO THE CATALOG
 * ---------------------------------------------------------------------------
 *
 * The catalog says what a story's contract MAY DECLARE. It said nothing about what the platform
 * already holds, and `storyArtifactTypes.test.ts` only ever checked one direction: that every
 * declared type is well formed. It could not notice a kind that exists in production and has no
 * type at all, which is the same one-way check this workstream keeps finding elsewhere, here in
 * its own test.
 *
 * Measured against production on 2026-11-18, `runtime_portfolio_artifacts` holds eight distinct
 * kinds and TWO of them had no catalog type:
 *
 *   claude_studio    71 rows, 18 learners. Now a catalog type in its own right: a student's own
 *                    Claude Artifact with a reflection and an AI disclosure is a different thing
 *                    from a file in a repository.
 *   architecture_doc 1 row, "AI Systems Architecture Job Aid". NOT given its own type, and the
 *                    reason is in the alias below.
 *
 * `MEASURED_PRODUCTION_KINDS` is measured, not derived: nothing here can query the database, so
 * it carries the date it was taken and a test holds the mapping complete against it. A kind that
 * appears in production later will not fail this on its own, which is the honest limit of a list
 * a human maintains. What the test DOES catch is an alias pointing at a type that does not exist,
 * an alias with no reason, and a measured kind that maps to nothing.
 */

export interface ProductionKindAlias {
  /** The `kind` value as `runtime_portfolio_artifacts` stores it. */
  kind: string;
  /** The catalog type it is read as. Must be a real type; a test enforces that. */
  maps_to: string;
  /** Why it is an alias rather than a type. Required, and a test enforces that too. */
  reason: string;
}

/**
 * Production kinds that are READ AS an existing catalog type rather than given one of their own.
 *
 * The bar for a new type is that a builder could tell it apart from every existing one. Where no
 * honest criterion separates two things, two types just make the builder guess, and a catalog
 * with two names for one thing is worse than a catalog that is missing a name.
 */
export const PRODUCTION_KIND_ALIASES: ProductionKindAlias[] = [
  {
    kind: 'architecture_doc',
    maps_to: 'field_guide',
    reason:
      'One row, "AI Systems Architecture Job Aid", and it satisfies field_guide\'s own criterion '
      + 'as written: someone doing the task for the first time can follow it without the author '
      + 'present. Its stored content has the same shape as the other sections-and-skills '
      + 'documents, and no criterion distinguishes an architecture job aid from a field guide '
      + 'without inventing one. Measured 2026-11-18.',
  },
];

/** Every distinct kind in `runtime_portfolio_artifacts`, with the date it was counted. */
export const MEASURED_PRODUCTION_KINDS = {
  measured_on: '2026-11-18',
  table: 'runtime_portfolio_artifacts',
  kinds: [
    'architecture_decision',
    'architecture_doc',
    'build_artifact',
    'case_study',
    'claude_studio',
    'field_guide',
    'presentation',
    'prompt_library',
  ] as string[],
};

/**
 * The catalog type a production kind is read as, or undefined when nothing claims it.
 *
 * Undefined is a real answer and the caller must render it as unclassified rather than guessing:
 * an artifact filed under a type nobody chose is worse than one visibly unfiled.
 */
export function catalogTypeForProductionKind(kind: string): string | undefined {
  if (isKnownArtifactType(kind)) return kind;
  const alias = PRODUCTION_KIND_ALIASES.find((a) => a.kind === kind);
  return alias ? alias.maps_to : undefined;
}
