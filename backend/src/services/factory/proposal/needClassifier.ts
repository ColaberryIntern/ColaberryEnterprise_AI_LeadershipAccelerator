/**
 * needClassifier - the AI long-tail for the requirement-grouping layer (CC-20261117-q8k3).
 *
 * The deterministic needGrouping places the common asks. An ask it can only put in 'general' comes here: the model
 * maps it to the nearest existing group + subject with a confidence, OR proposes a NEW category when nothing fits -
 * which an admin then reviews and activates (govRequirementCategories). Mirrors the repo's AI pattern: instrumented
 * client, DEFAULT_MODEL, json_object, guarded parse, pure sanitize, and FAIL-SOFT (no key / error / bad JSON ->
 * the deterministic 'general' default, never a throw). The sanitizer is pure and unit-tested without the model.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { GROUP_DEFS, SUBJECT_DEFS, type GroupKind } from './needGrouping';

export interface NeedClassification {
  groupSlug: string;
  subject: string;
  confidence: number;
  /** Set only when the model judged no existing group fits and proposed a new one (pending admin review). */
  newCategory: { slug: string; label: string; kind: GroupKind } | null;
}

export const GENERAL_CLASSIFICATION: NeedClassification = { groupSlug: 'general', subject: 'general', confidence: 0, newCategory: null };

const GROUP_SLUGS = new Set(GROUP_DEFS.map((g) => g.slug));
const SUBJECT_SLUGS = new Set(SUBJECT_DEFS.map((s) => s.slug));

function cleanSlug(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

/** PURE: coerce a model response into a safe classification. Unknown group/subject fall back to 'general'; a proposed
 *  new category is accepted only when it is well-formed and not a built-in slug. Confidence clamped to [0, 1]. */
export function sanitizeClassification(raw: unknown): NeedClassification {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nc = (r.newCategory && typeof r.newCategory === 'object' ? r.newCategory : null) as Record<string, unknown> | null;

  let newCategory: NeedClassification['newCategory'] = null;
  if (nc) {
    const slug = cleanSlug(nc.slug);
    const label = String(nc.label ?? '').trim().slice(0, 200);
    const kind: GroupKind = nc.kind === 'reference' || nc.kind === 'personnel' ? nc.kind : 'fact';
    if (slug && label && !GROUP_SLUGS.has(slug)) newCategory = { slug, label, kind };
  }

  const rawGroup = cleanSlug(r.groupSlug);
  const groupSlug = GROUP_SLUGS.has(rawGroup) ? rawGroup
    : newCategory && rawGroup === newCategory.slug ? rawGroup
    : newCategory ? newCategory.slug
    : 'general';

  const rawSubject = cleanSlug(r.subject);
  const subject = SUBJECT_SLUGS.has(rawSubject) ? rawSubject : 'general';

  const confNum = typeof r.confidence === 'number' ? r.confidence : Number(r.confidence);
  const confidence = Number.isFinite(confNum) ? Math.min(1, Math.max(0, confNum)) : 0;

  return { groupSlug, subject, confidence, newCategory };
}

const SYSTEM = [
  'You sort one unanswered government-proposal requirement into a group and a subject.',
  'GROUPS (pick the best-fitting slug):', GROUP_DEFS.map((g) => `${g.slug} (${g.label})`).join('; ') + '.',
  'SUBJECTS (what the requirement is about):', SUBJECT_DEFS.map((s) => s.slug).join(', ') + '.',
  'If no group fits, propose a new one as newCategory {slug (snake_case), label, kind (fact|reference|personnel)}.',
  'Return JSON: {"groupSlug": "<slug>", "subject": "<slug>", "confidence": 0..1, "newCategory": {...}|null}.',
  'Use an existing group when one reasonably fits; only propose a new category for a genuinely new kind of demand.',
].join(' ');

/** Classify one ungrouped ask. Fail-soft: no key / error / bad JSON -> GENERAL_CLASSIFICATION (never throws). */
export async function classifyNeedAsk(ask: string): Promise<NeedClassification> {
  const text = String(ask ?? '').trim();
  if (!text || !process.env.OPENAI_API_KEY) return GENERAL_CLASSIFICATION;
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_need_classify' }, { timeout: 120_000, maxRetries: 1 });
    const model = process.env.GOV_CLASSIFY_MODEL || DEFAULT_MODEL;
    const res = await client.chat.completions.create({
      model, temperature: 0, max_tokens: 300, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text.slice(0, 500) }],
    });
    let parsed: unknown = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    return sanitizeClassification(parsed);
  } catch (err) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'gov_need_classify_failed', context: { message: String((err as Error)?.message ?? err).slice(0, 200) } }));
    return GENERAL_CLASSIFICATION;
  }
}
