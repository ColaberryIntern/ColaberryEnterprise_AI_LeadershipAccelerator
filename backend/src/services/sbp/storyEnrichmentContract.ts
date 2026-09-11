import { createHash } from 'crypto';
import { z } from 'zod';
import { UNDERSTANDING_DIMENSIONS } from '../delivery/projectUnderstanding';

/**
 * storyEnrichmentContract - what a story is allowed to say it learned. PURE.
 *
 * ## The file, and why it is a file
 *
 * When a story completes, the agent that built it writes
 * `.colaberry/enrichment/<STORY-ID>.json` in the student's repo. The platform
 * reads it on the next push, exactly as it reads `.colaberry/progress.json`.
 * A file in the repo rather than an API call because the agent already has
 * write access to the repo and none to the platform; because the push webhook
 * already exists and is already idempotent per delivery; and because a file
 * the student can open and read is a claim they can dispute.
 *
 * ## What it is not
 *
 * Not a second source of truth. Nothing in this file becomes truth by being
 * written; `enrichmentMerge` decides what survives, and the contract in
 * `projectUnderstanding.ts` decides what a repository is allowed to establish
 * at all. The schema here is deliberately narrow: a proposal is one dimension,
 * one value, one piece of evidence. There is no free-form "notes" field for a
 * paragraph of conclusions to hide in.
 *
 * ## Idempotency key
 *
 * The hash of the content that could change the truth. The same file pushed
 * twice, or the same delivery retried by GitHub, hashes the same and is
 * applied once. A file the agent edits and pushes again is a new event, as it
 * should be.
 */

export const ENRICHMENT_SCHEMA_VERSION = '1';
export const ENRICHMENT_DIR = '.colaberry/enrichment';
export const MAX_ENRICHMENT_BYTES = 64 * 1024;

export const enrichmentPathFor = (storyId: string): string => `${ENRICHMENT_DIR}/${storyId}.json`;

const STORY_ID = /^STORY-\d{3,4}$/;

const evidenceRefSchema = z.object({
  kind: z.enum(['file', 'commit', 'test', 'url']),
  /** A path, a sha, a test name, or a URL. What a person would open to check. */
  ref: z.string().trim().min(1).max(300),
  note: z.string().trim().max(300).optional(),
});

const factProposalSchema = z.object({
  dimension: z.enum(UNDERSTANDING_DIMENSIONS),
  value: z.string().trim().min(1).max(600),
  /** Where in the repo this can be checked. Required: unevidenced is unfiled. */
  evidence: z.string().trim().min(1).max(300),
  /** FACT unless the agent says it is only likely. Never anything stronger. */
  classification: z.enum(['FACT', 'ASSUMPTION']).default('FACT'),
});

const decisionSchema = z.object({
  statement: z.string().trim().min(1).max(600),
  rationale: z.string().trim().max(600).optional(),
  evidence: z.string().trim().min(1).max(300),
});

const limitationSchema = z.object({
  statement: z.string().trim().min(1).max(600),
  evidence: z.string().trim().min(1).max(300),
});

const measurementRefSchema = z.object({
  name: z.string().trim().min(1).max(120),
  value: z.union([z.number(), z.string().trim().max(120)]).optional(),
  unit: z.string().trim().max(40).optional(),
  evidence: z.string().trim().min(1).max(300),
});

export const storyTruthEnrichmentSchema = z.object({
  schemaVersion: z.literal(ENRICHMENT_SCHEMA_VERSION),
  projectId: z.string().uuid(),
  storyId: z.string().regex(STORY_ID, 'storyId must look like STORY-007'),
  /** The truth revision the agent read before it started. 0 when none was visible. */
  projectTruthBaseRevision: z.number().int().min(0),
  observedAt: z.string().datetime(),
  sourceCommitSha: z.string().regex(/^[0-9a-f]{7,40}$/).nullish(),
  factProposals: z.array(factProposalSchema).max(40).default([]),
  decisions: z.array(decisionSchema).max(20).default([]),
  limitations: z.array(limitationSchema).max(20).default([]),
  demonstrationEvidence: z.array(evidenceRefSchema).max(40).default([]),
  measurementEvents: z.array(measurementRefSchema).max(40).default([]),
});

export type StoryTruthEnrichment = z.infer<typeof storyTruthEnrichmentSchema>;
export type FactProposal = z.infer<typeof factProposalSchema>;

export type EnrichmentParseErrorClass = 'NotJson' | 'ContractViolation' | 'TooLarge';

export type EnrichmentParseResult =
  | { ok: true; event: StoryTruthEnrichment }
  | { ok: false; error_class: EnrichmentParseErrorClass; reason: string };

/**
 * Parse one enrichment file. Never throws: a malformed file is a fact about
 * the repo, reported with a class so the log can say which kind.
 */
export function parseEnrichment(raw: string): EnrichmentParseResult {
  if (Buffer.byteLength(raw, 'utf8') > MAX_ENRICHMENT_BYTES) {
    return { ok: false, error_class: 'TooLarge', reason: `enrichment file exceeds ${MAX_ENRICHMENT_BYTES} bytes` };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err: any) {
    return { ok: false, error_class: 'NotJson', reason: String(err?.message || 'invalid JSON').slice(0, 200) };
  }
  const parsed = storyTruthEnrichmentSchema.safeParse(json);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error_class: 'ContractViolation', reason };
  }
  return { ok: true, event: parsed.data };
}

/** Stable JSON: sorted keys, so two encodings of the same content hash alike. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The parts of an event that can change the truth, hashed. `observedAt` is
 * excluded on purpose: an agent that rewrites the same file with a new
 * timestamp has not learned anything new.
 */
export function enrichmentIdempotencyKey(event: StoryTruthEnrichment): string {
  const material = canonical({
    projectId: event.projectId,
    storyId: event.storyId,
    sourceCommitSha: event.sourceCommitSha ?? null,
    factProposals: event.factProposals,
    decisions: event.decisions,
    limitations: event.limitations,
    demonstrationEvidence: event.demonstrationEvidence,
    measurementEvents: event.measurementEvents,
  });
  return createHash('sha256').update(material).digest('hex');
}
