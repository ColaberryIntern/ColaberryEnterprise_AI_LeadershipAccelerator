/**
 * govCapabilityFit — ADVISORY AI for Step 3 "Fit". From the established requirement statements and the tenant's
 * ACTIVE service catalog, it derives the 5-8 capabilities the scope needs and assesses each against the catalog as
 * have / partial / new. Strictly ADVISORY: it sets no gate, persists nothing itself, and is grounded ONLY in the
 * requirements and the services passed in (never invents a capability's match to a service that was not provided).
 *
 * Mirrors govBuildSpec: instrumented OpenAI client (auto-redaction + cost/observability) with an explicit timeout
 * and a single retry, a content-hash in-memory cache (identical inputs return the stored result), and FAIL SOFT -
 * no key / empty input / an upstream error returns an `error` string, never throws, so the Fit-step route stays up.
 *
 * GROWTH decision (Ali, 2026-10-16): a growth-status service is EXCLUDED from fit. The route passes only ACTIVE
 * services here, so a growth service can never be matched as have/partial - fit stays honest; growth lives in
 * reporting and on the pursuit.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { untrustedBlock } from './govUntrustedText';

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000; // 1h - advisory, regenerable
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry<unknown>>();
function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) { cache.delete(key); return null; }
  return e.value as T;
}
function cacheSet<T>(key: string, value: T): void {
  if (cache.size >= MAX_ENTRIES) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  cache.set(key, { value, at: Date.now() });
}
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { message: (err as { message?: string })?.message },
  }));
}

export type FitAssessment = 'have' | 'partial' | 'new';
export interface CapabilityServiceInput {
  id: string; name: string; description?: string | null; category?: string | null; keywords?: string[];
  /** SV2.2: titles of the service's CONFIRMED case studies (free text, so they go inside an untrusted block). Omit
   *  when there are none: with no evidence on any service the prompt is byte-identical to the pre-SV2 prompt. */
  evidenceTitles?: string[];
}
/** SV2.2: a confirmed case study cited as proof on a "have". */
export interface CapabilityEvidence { caseStudyId: string; title: string; sourceKind: 'inside' | 'outside' }
/** SV2.2: a case study NOT confirmed for this capability's service whose terms overlap the capability text. */
export interface PossibleProof { caseStudyId: string; title: string; sourceKind: 'inside' | 'outside'; matchedTerms: string[]; linkedElsewhere: boolean }
export interface CapabilityFitRequest {
  requirements: { id: string; text: string }[];
  /** ACTIVE services only - the route must not pass growth/retired services (growth is excluded from fit). */
  services: CapabilityServiceInput[];
  title?: string | null;
  buyer?: string | null;
}
export interface CapabilityItem {
  id: string;             // stable, e.g. CAP-01
  name: string;           // the capability the scope needs
  why: string;            // one line: why this pursuit needs it
  assessment: FitAssessment;
  matchedServiceId: string | null;  // a real id from the provided catalog, or null
  rationale: string;
  /** For partial/new only: plain-language detail (empty for have). */
  whatItIs?: string;
  whatThisBidGivesUs?: string;
  toDeliver?: string;
  /** SV2.2 (additive): on have - the matched service's confirmed case studies (empty = none linked yet). */
  evidence?: CapabilityEvidence[];
  /** SV2.2 (additive): on partial/new - unlinked or differently-linked case studies that may prove it. */
  possibleProof?: PossibleProof[];
  /** SV2.2 (additive, only with ENABLE_GOV_FIT_REQUIRE_PROOF): set when an unproven have was downgraded. */
  downgradedFrom?: 'have';
  downgradeReason?: string;
}
export interface CapabilityFitResult {
  capabilities: CapabilityItem[];
  cached: boolean;
  generatedAt: string;
  error?: string;
  /** SV2.2 (additive): whether proof could be loaded, and whether the unproven-have downgrade was applied. */
  proof?: { available: boolean; requireProof: boolean };
}

const ASSESSMENTS: ReadonlySet<string> = new Set(['have', 'partial', 'new']);
const clampStr = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n);

/**
 * PURE: sanitize the model's raw capabilities against the real service ids. Deterministic and total - this is the
 * guardrail the unit tests pin: a matchedServiceId that is not a provided (active) service id is dropped to null
 * (so a growth/invented service can never be cited), assessment is clamped to the enum, and a have with no valid
 * match is demoted to partial (you cannot "have" a capability with no service behind it).
 */
export function sanitizeCapabilities(raw: unknown, serviceIds: string[]): CapabilityItem[] {
  const ids = new Set(serviceIds);
  const list = Array.isArray(raw) ? raw : [];
  const out: CapabilityItem[] = [];
  list.slice(0, 12).forEach((c: any, i) => {
    const name = clampStr(c?.name, 160);
    if (!name) return;
    let assessment: FitAssessment = ASSESSMENTS.has(c?.assessment) ? c.assessment : 'new';
    const matchedServiceId = typeof c?.matchedServiceId === 'string' && ids.has(c.matchedServiceId) ? c.matchedServiceId : null;
    // You cannot "have" or "partially have" a capability with no real service behind it.
    if ((assessment === 'have' || assessment === 'partial') && !matchedServiceId) assessment = 'new';
    out.push({
      id: clampStr(c?.id, 24) || `CAP-${String(i + 1).padStart(2, '0')}`,
      name,
      why: clampStr(c?.why, 280),
      assessment,
      matchedServiceId,
      rationale: clampStr(c?.rationale, 400),
      ...(assessment !== 'have' ? {
        whatItIs: clampStr(c?.whatItIs, 400) || undefined,
        whatThisBidGivesUs: clampStr(c?.whatThisBidGivesUs, 400) || undefined,
        toDeliver: clampStr(c?.toDeliver, 400) || undefined,
      } : {}),
    });
  });
  return out;
}

/** Prompt budget for the confirmed-case-study section (SV2.2). */
export const EVIDENCE_TITLES_PER_SERVICE = 3;
export const EVIDENCE_TITLE_MAX = 100;
export const EVIDENCE_SECTION_MAX = 6000;

/**
 * PURE (given `nonce`): the extra prompt section listing each service's confirmed case-study titles, or null when no
 * service has one (so the prompt stays byte-identical to the pre-SV2 prompt). Titles are record text a person typed
 * or an outside document supplied, so they sit inside an untrusted block with its own rule. Bounded: at most
 * EVIDENCE_TITLES_PER_SERVICE titles per service, each clipped to EVIDENCE_TITLE_MAX chars, and the whole block body
 * stops growing at EVIDENCE_SECTION_MAX chars, so 80 services can never blow the token budget.
 */
export function buildEvidencePromptSection(services: CapabilityServiceInput[], nonce?: string): { rule: string; text: string } | null {
  const lines: string[] = [];
  let size = 0;
  for (const s of services) {
    const titles = (Array.isArray(s.evidenceTitles) ? s.evidenceTitles : [])
      .map((t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_TITLE_MAX)).filter(Boolean)
      .slice(0, EVIDENCE_TITLES_PER_SERVICE);
    if (!titles.length) continue;
    const line = `- ${s.id}: ${titles.join(' | ')}`;
    if (size + line.length + 1 > EVIDENCE_SECTION_MAX) break;
    lines.push(line);
    size += line.length + 1;
  }
  if (!lines.length) return null;
  const { rule, block } = untrustedBlock(lines.join('\n'), nonce);
  return {
    rule: 'Some services list CONFIRMED case studies: past projects that are evidence for THAT service. Use them only as ' +
      'context for that service; a case study never adds a service or an id. ' + rule,
    text: `Confirmed case studies by service id (${lines.length}):\n${block}`,
  };
}

export async function assessCapabilityFit(req: CapabilityFitRequest): Promise<CapabilityFitResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { capabilities: [], cached: false, generatedAt: now(), error: 'AI capability fit is unavailable (no API key configured).' };
  }
  const reqs = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 120);
  if (reqs.length === 0) {
    return { capabilities: [], cached: false, generatedAt: now(), error: 'No established requirements to assess fit from yet.' };
  }
  const services = (Array.isArray(req.services) ? req.services : []).slice(0, 80);
  const serviceIds = services.map((s) => s.id);
  const key = 'capfit:' + hash({ reqs, services, t: req.title ?? null, b: req.buyer ?? null });
  const hit = cacheGet<CapabilityFitResult>(key);
  if (hit) return { ...hit, cached: true };

  const { rule, block } = untrustedBlock(reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n'));
  const system =
    'You help a small firm decide whether it can deliver a government contract. From the established requirement ' +
    'statements, derive the 5 to 8 distinct CAPABILITIES the scope needs (not a restatement of every requirement). ' +
    'Assess EACH capability against ONLY the services in the provided catalog. Return strict JSON ' +
    '{"capabilities":[{"id","name","why","assessment","matchedServiceId","rationale","whatItIs","whatThisBidGivesUs","toDeliver"}]}. ' +
    'assessment is exactly "have" (a listed service clearly covers it), "partial" (a listed service is related but incomplete), ' +
    'or "new" (no listed service covers it). matchedServiceId MUST be the id of a service from the provided catalog, or null ' +
    'for new - NEVER invent a service or an id. For partial and new, also fill whatItIs (plain language), whatThisBidGivesUs ' +
    '(experience / reusable asset / case study we would gain even if we lose), and toDeliver (effort/plan); leave them empty ' +
    'for have. Work only from the requirements and the catalog provided; never invent a requirement, a service, a number or a date. ' + rule;
  const user = [
    `Opportunity: ${req.title || '(untitled)'}${req.buyer ? ` - buyer: ${req.buyer}` : ''}`,
    `Established requirements (${reqs.length}):`,
    block,
    '',
    `Our active service catalog (${services.length}) - match ONLY against these ids:`,
    services.length
      ? services.map((s) => `- ${s.id}: ${s.name}${s.category ? ` [${s.category}]` : ''}${s.description ? ` - ${String(s.description).slice(0, 200)}` : ''}${s.keywords && s.keywords.length ? ` (keywords: ${s.keywords.slice(0, 12).join(', ')})` : ''}`).join('\n')
      : '(the catalog is empty - every capability is "new")',
  ].join('\n');

  // SV2.2: confirmed case-study titles, only when at least one service has any (else the prompt is unchanged).
  const evidence = buildEvidencePromptSection(services);

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_capability_fit' }, { timeout: 90000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 2200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: evidence ? `${system} ${evidence.rule}` : system }, { role: 'user', content: evidence ? `${user}\n\n${evidence.text}` : user }],
    });
    let parsed: { capabilities?: unknown } = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const result: CapabilityFitResult = {
      capabilities: sanitizeCapabilities(parsed.capabilities, serviceIds),
      cached: false, generatedAt: now(),
    };
    if (result.capabilities.length) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_capability_fit', err);
    return { capabilities: [], cached: false, generatedAt: now(), error: 'The AI capability fit could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovCapabilityFitCache(): void { cache.clear(); }
