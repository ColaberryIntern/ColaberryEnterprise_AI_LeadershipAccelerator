/**
 * caseStudyManifestReader — the ONE place an optional repository manifest
 * (`case-study.*`) becomes typed, bounded, NON-authoritative facts. Spec §8,
 * §9 (tier 5 — below every human and platform source), §29 (`MalformedManifest`
 * is a classified sync failure, not a crash), §37 ("no arbitrary URL fetch from
 * manifests"). Field-by-field rationale, the deferred-YAML decision and the
 * Failure-First answers in full: `docs/case-study/case-study-schema.md`.
 *
 * PURE BY CONSTRUCTION — it parses contents SOMEBODY ELSE fetched, importing
 * only `zod` and the leaf type module `types/caseStudy`, which the test pins:
 * no fetch/axios/http/Octokit (a URL an author writes is DATA, so there is no
 * arbitrary-fetch vector), no model/Sequelize/database (it cannot touch
 * publication state and needs no Postgres to test), no repo analyzer (the
 * analyzer calls this, never the reverse, so the two cannot cycle).
 *
 * THREE INVARIANTS. (1) Authoritative ONLY for declared fields: no `.default()`
 * exists here, so an undeclared field is `undefined`, is absent from
 * `declaredFields`, and can never outrank real repository evidence.
 * (2) `publication.requested_surfaces` is a REQUEST — `authorizesPublication`
 * is the literal TYPE `false`, so no code path can produce `true`; only the
 * publish gate publishes. (3) An outcome lands `verificationClass: 'pending'`,
 * also a literal type, never copied from input: an author may STATE a business
 * number, never self-certify it.
 *
 * Expected conditions are discriminated results, never exceptions. Contents are
 * NEVER logged — not the body, not a fragment, not a parser message (Node's
 * `JSON.parse` error quotes the source, so it is discarded for a byte offset).
 */
import { z } from 'zod';
import { CASE_STUDY_SURFACE_KEYS, CASE_STUDY_VERIFICATION_METHODS } from '../../types/caseStudy';
import type {
  CaseStudyBuiltByType, CaseStudyRepoRole, CaseStudySurfaceKey, CaseStudyVerificationMethod,
} from '../../types/caseStudy';

/** Spec §8, in precedence order. The first one PRESENT is the manifest. */
export const CASE_STUDY_MANIFEST_FILENAMES = ['case-study.yml', 'case-study.yaml', 'case-study.json'] as const;
export type CaseStudyManifestFilename = (typeof CASE_STUDY_MANIFEST_FILENAMES)[number];
/** The only variant this build can parse — no approved YAML parser is a declared dependency. */
export const PARSEABLE_MANIFEST_FILENAME: CaseStudyManifestFilename = 'case-study.json';
export const MAX_MANIFEST_BYTES = 64 * 1024; // ~10x the realistic worst case for a declarative file
export const MAX_MANIFEST_DEPTH = 8; // bounds the recursive walk; the schema is 3 deep
export const MAX_MANIFEST_REPOS = 20; // spec §37, enforced again at attach time
export const MAX_MANIFEST_OUTCOMES = 50;
export const MAX_MANIFEST_LIST_ITEMS = 40; // classification.capabilities / .stack
const MAX_REPORTED = 25; // cap on returned issues and unknown-field paths

/**
 * Runtime mirrors of unions `types/caseStudy.ts` declares but — being a leaf
 * module importing nothing — publishes no array for. The paired assignments are
 * a COMPILE-TIME proof that list and union stay identical in BOTH directions
 * (`caseStudyRepoCollection.ts` uses the same pattern); the unions are
 * imported, never re-declared. `CASE_STUDY_SURFACE_KEYS` and
 * `CASE_STUDY_VERIFICATION_METHODS` already exist there and are used directly.
 */
const BUILT_BY_TYPES = ['learner', 'intern', 'client_team', 'colaberry_team', 'ai_flotation_team', 'joint_team'] as const;
const BUILT_BY_IN_UNION: readonly CaseStudyBuiltByType[] = BUILT_BY_TYPES;
const BUILT_BY_UNION_IN_LIST: readonly (typeof BUILT_BY_TYPES)[number][] = BUILT_BY_IN_UNION;
const REPO_ROLES = ['primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other'] as const;
const ROLES_IN_UNION: readonly CaseStudyRepoRole[] = REPO_ROLES;
const ROLES_UNION_IN_LIST: readonly (typeof REPO_ROLES)[number][] = ROLES_IN_UNION;
void BUILT_BY_UNION_IN_LIST; void ROLES_UNION_IN_LIST;

/* ── schema ── every field optional (invariant 1); no `.default()` anywhere ── */
const text = (max: number) => z.string().trim().min(1).max(max);
const list = (itemMax: number) => z.array(text(itemMax)).max(MAX_MANIFEST_LIST_ITEMS);

/**
 * Recorded, never dereferenced: `https://` URL or `owner/repo` shorthand only,
 * so `http:`, `javascript:`, `file:` and anything carrying whitespace or quoting
 * characters cannot reach a link renderer. Resolving it is `parseRepoReference`'s job.
 */
const repoReference = z.string().trim().min(1).max(2048).refine(
  (v) => !/[\s<>"'`\\]/.test(v) && (/^https:\/\/[^/]+\/.+$/.test(v) || /^[\w.-]+\/[\w.-]+$/.test(v)),
  { message: 'expected an https:// URL or an owner/repo reference' },
);
const projectSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  title: text(200).optional(),
});
const classificationSchema = z.object({
  industry: text(120).optional(), capabilities: list(80).optional(),
  stack: list(80).optional(), method: text(80).optional(),
});
const builtBySchema = z.object({ type: z.enum(BUILT_BY_TYPES).optional(), program: text(160).optional() });
const publicationSchema = z.object({
  requested_surfaces: z.array(z.enum(CASE_STUDY_SURFACE_KEYS)).max(CASE_STUDY_SURFACE_KEYS.length).optional(),
});
const consentSchema = z.object({
  organization_named: z.boolean().optional(), builders_named: z.boolean().optional(),
  public_repo_link: z.boolean().optional(),
});
const repoSchema = z.object({ role: z.enum(REPO_ROLES).optional(), url: repoReference });
const outcomeSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  label: text(160), value_display: text(120),
  verification_method: z.enum(CASE_STUDY_VERIFICATION_METHODS).optional(),
  evidence_ref: text(200).optional(),
});
const manifestSchema = z.object({
  schema_version: z.literal(1).optional(),
  project: projectSchema.optional(),
  classification: classificationSchema.optional(),
  built_by: builtBySchema.optional(),
  publication: publicationSchema.optional(),
  consent: consentSchema.optional(),
  repos: z.array(repoSchema).max(MAX_MANIFEST_REPOS).optional(),
  outcomes: z.array(outcomeSchema).max(MAX_MANIFEST_OUTCOMES).optional(),
});

/** Key sets read OFF the schemas above, so unknown-field reporting cannot drift. */
const TOP_KEYS: readonly string[] = Object.keys(manifestSchema.shape);
const NESTED_KEYS: Readonly<Record<string, readonly string[]>> = {
  project: Object.keys(projectSchema.shape), classification: Object.keys(classificationSchema.shape),
  built_by: Object.keys(builtBySchema.shape), publication: Object.keys(publicationSchema.shape),
  consent: Object.keys(consentSchema.shape),
};
const ITEM_KEYS: Readonly<Record<string, readonly string[]>> = {
  repos: Object.keys(repoSchema.shape), outcomes: Object.keys(outcomeSchema.shape),
};

/* ── exported contracts ── */
export interface CaseStudyManifestRepo { readonly url: string; readonly role?: CaseStudyRepoRole }

export interface CaseStudyManifestOutcome {
  readonly key: string;
  readonly label: string;
  readonly valueDisplay: string;
  /** WHO the author says established it. Recorded; it proves nothing on its own. */
  readonly verificationMethod?: CaseStudyVerificationMethod;
  readonly evidenceRef?: string;
  /** ALWAYS `'pending'` (invariant 3) — even when `verification_method: 'client'`. */
  readonly verificationClass: 'pending';
}

export interface CaseStudyManifest {
  readonly schemaVersion?: 1;
  readonly project?: { readonly slug?: string; readonly title?: string };
  readonly classification?: { readonly industry?: string; readonly capabilities?: readonly string[]; readonly stack?: readonly string[]; readonly method?: string };
  readonly builtBy?: { readonly type?: CaseStudyBuiltByType; readonly program?: string };
  /** A request, never an authorisation. See `authorizesPublication`. */
  readonly publication?: { readonly requestedSurfaces?: readonly CaseStudySurfaceKey[] };
  readonly consent?: { readonly organizationNamed?: boolean; readonly buildersNamed?: boolean; readonly publicRepoLink?: boolean };
  readonly repos?: readonly CaseStudyManifestRepo[];
  readonly outcomes?: readonly CaseStudyManifestOutcome[];
}

/** `empty_manifest`: zero bytes declares zero fields, so it IS "no manifest". */
export type CaseStudyManifestAbsentReason = 'no_manifest_file' | 'unrecognized_filename' | 'empty_manifest';
export type CaseStudyManifestMalformedReason =
  'manifest_too_large' | 'invalid_json' | 'not_an_object' | 'too_deeply_nested' | 'schema_violation';

/** `message` goes to the authenticated caller; never to a log line. */
export interface CaseStudyManifestIssue { readonly path: string; readonly code: string; readonly message: string }

export type CaseStudyManifestReadResult =
  | { status: 'absent'; filename: string | null; reason: CaseStudyManifestAbsentReason }
  | { status: 'unsupported_format'; filename: CaseStudyManifestFilename; error_class: 'UnsupportedManifestFormat'; reason: 'unsupported_manifest_format'; format: 'yaml' }
  | { status: 'malformed'; filename: CaseStudyManifestFilename; error_class: 'MalformedManifest'; reason: CaseStudyManifestMalformedReason; detail: string; issues: readonly CaseStudyManifestIssue[] }
  | { status: 'parsed'; filename: CaseStudyManifestFilename; manifest: CaseStudyManifest; declaredFields: readonly string[]; unknownFields: readonly string[]; authorizesPublication: false };

export interface ReadManifestOptions {
  readonly correlationId?: string; readonly caseStudyId?: string; readonly repoOwner?: string; readonly repoName?: string;
}

/* ── reader ── */
/** Highest-precedence recognised manifest among the filenames a repo exposes. */
export function pickManifestFilename(available: readonly string[]): CaseStudyManifestFilename | null {
  for (const candidate of CASE_STUDY_MANIFEST_FILENAMES) {
    if (available.some((entry) => basename(entry) === candidate)) return candidate;
  }
  return null;
}

/**
 * Parse an ALREADY-FETCHED manifest. Never throws for repository content;
 * throws `TypeError` only for a programmer passing a non-string.
 */
export function readCaseStudyManifest(
  filename: string | null | undefined, contents: string | null | undefined, options: ReadManifestOptions = {},
): CaseStudyManifestReadResult {
  if (filename != null && typeof filename !== 'string') throw new TypeError('filename must be a string');
  if (contents != null && typeof contents !== 'string') throw new TypeError('contents must be a string');
  if (!filename || !filename.trim()) return absent(null, 'no_manifest_file', options);

  const found = CASE_STUDY_MANIFEST_FILENAMES.find((f) => f === basename(filename));
  if (!found) return absent(filename, 'unrecognized_filename', options);
  if (found !== PARSEABLE_MANIFEST_FILENAME) {
    const reason = 'unsupported_manifest_format'; // the grep-able name from spec §8
    log('case_study_manifest_read', 'partial', options, { filename: found, error_class: 'UnsupportedManifestFormat', reason });
    return { status: 'unsupported_format', filename: found, error_class: 'UnsupportedManifestFormat', reason, format: 'yaml' };
  }
  if (!contents || !contents.trim()) return absent(found, 'empty_manifest', options);

  const bytes = Buffer.byteLength(contents, 'utf8');
  if (bytes > MAX_MANIFEST_BYTES) {
    return bad(found, 'manifest_too_large', `manifest is ${bytes} bytes; the limit is ${MAX_MANIFEST_BYTES}`, [], options, bytes);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (err) {
    return bad(found, 'invalid_json', describeJsonError(err), [], options, bytes);
  }
  if (!isPlainObject(raw)) return bad(found, 'not_an_object', 'top level must be a JSON object', [], options, bytes);

  let cleaned: Record<string, unknown>;
  try {
    cleaned = stripNulls(raw, 1) as Record<string, unknown>;
  } catch (err) {
    if (err !== DEPTH_EXCEEDED) throw err;
    return bad(found, 'too_deeply_nested', `nesting exceeds ${MAX_MANIFEST_DEPTH} levels`, [], options, bytes);
  }

  const parsed = manifestSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_REPORTED).map((i) => ({ // Zod v4: `.issues`, never `.errors`
      path: i.path.map(String).join('.') || '(root)', code: String(i.code), message: i.message,
    }));
    return bad(found, 'schema_violation', `${parsed.error.issues.length} field(s) failed validation`, issues, options, bytes);
  }

  const declaredFields = collectDeclared(parsed.data as Record<string, unknown>);
  const unknownFields = collectUnknown(cleaned);
  log('case_study_manifest_read', 'success', options, {
    filename: found, byte_size: bytes, declared_field_count: declaredFields.length,
    unknown_field_count: unknownFields.length, repo_count: parsed.data.repos?.length ?? 0,
    outcome_count: parsed.data.outcomes?.length ?? 0, authorizes_publication: false,
    requested_surface_count: parsed.data.publication?.requested_surfaces?.length ?? 0,
  });
  return {
    status: 'parsed', filename: found, manifest: toManifest(parsed.data),
    declaredFields, unknownFields, authorizesPublication: false,
  };
}

/* ── helpers ── */
const DEPTH_EXCEEDED = Symbol('manifest_depth_exceeded');
/** Prototype-pollution vectors: `JSON.parse` makes `__proto__` an OWN key. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function basename(raw: string): string {
  return (raw.trim().replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function absent(filename: string | null, reason: CaseStudyManifestAbsentReason, options: ReadManifestOptions): CaseStudyManifestReadResult {
  log('case_study_manifest_read', 'success', options, { filename: filename ?? null, reason });
  return { status: 'absent', filename, reason };
}

function bad(
  filename: CaseStudyManifestFilename, reason: CaseStudyManifestMalformedReason, detail: string,
  issues: readonly CaseStudyManifestIssue[], options: ReadManifestOptions, bytes: number,
): CaseStudyManifestReadResult {
  log('case_study_manifest_read', 'failure', options, { // paths and codes only; Zod messages stay out of the log
    filename, error_class: 'MalformedManifest', reason, byte_size: bytes,
    issue_paths: issues.map((i) => `${i.path}:${i.code}`),
  });
  return { status: 'malformed', filename, error_class: 'MalformedManifest', reason, detail, issues };
}

function describeJsonError(err: unknown): string {
  const match = /position (\d+)/.exec(err instanceof Error ? err.message : '');
  return match ? `invalid JSON at byte ${match[1]}` : 'invalid JSON';
}

function stripNulls(value: unknown, depth: number): unknown {
  if (depth > MAX_MANIFEST_DEPTH) throw DEPTH_EXCEEDED;
  if (Array.isArray(value)) return value.map((entry) => stripNulls(entry, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === null || FORBIDDEN_KEYS.has(key)) continue; // a null declares nothing
    out[key] = stripNulls(child, depth + 1);
  }
  return out;
}

/** Wire (snake_case) paths the file actually declares. Authority is exactly this set. */
function collectDeclared(validated: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of TOP_KEYS) {
    const value = validated[key];
    if (value === undefined) continue;
    out.push(key);
    const nested = NESTED_KEYS[key];
    if (!nested || !isPlainObject(value)) continue;
    for (const child of nested) if (value[child] !== undefined) out.push(`${key}.${child}`);
  }
  return out;
}

/** Reported so a stripped key is visible rather than silent. Never authoritative. */
function collectUnknown(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (path: string) => {
    if (seen.has(path) || out.length >= MAX_REPORTED) return;
    seen.add(path); out.push(path);
  };
  for (const [key, value] of Object.entries(raw)) {
    if (!TOP_KEYS.includes(key)) { push(key); continue; }
    const nested = NESTED_KEYS[key];
    if (nested && isPlainObject(value)) {
      for (const child of Object.keys(value)) if (!nested.includes(child)) push(`${key}.${child}`);
    }
    const item = ITEM_KEYS[key];
    if (!item || !Array.isArray(value)) continue;
    for (const entry of value) {
      if (!isPlainObject(entry)) continue;
      for (const child of Object.keys(entry)) if (!item.includes(child)) push(`${key}[].${child}`);
    }
  }
  return out;
}

/** snake_case wire shape → camelCase domain shape. Absent stays absent (invariant 1). */
function toManifest(d: z.infer<typeof manifestSchema>): CaseStudyManifest {
  const c = d.consent;
  return {
    schemaVersion: d.schema_version, project: d.project, classification: d.classification,
    builtBy: d.built_by, repos: d.repos,
    publication: d.publication && { requestedSurfaces: d.publication.requested_surfaces },
    consent: c && { organizationNamed: c.organization_named, buildersNamed: c.builders_named, publicRepoLink: c.public_repo_link },
    outcomes: d.outcomes?.map((o) => ({ // verificationClass is invariant 3: not read from input
      key: o.key, label: o.label, valueDisplay: o.value_display,
      verificationMethod: o.verification_method, evidenceRef: o.evidence_ref,
      verificationClass: 'pending' as const,
    })),
  };
}

function log(event: string, outcome: 'success' | 'failure' | 'partial', o: ReadManifestOptions, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-manifest-reader', event, correlation_id: o.correlationId ?? null,
    case_study_id: o.caseStudyId ?? null, repo_owner: o.repoOwner ?? null,
    repo_name: o.repoName ?? null, outcome, ...ctx,
  }));
}
