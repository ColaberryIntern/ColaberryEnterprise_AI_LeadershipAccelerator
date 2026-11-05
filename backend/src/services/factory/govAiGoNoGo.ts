/**
 * govAiGoNoGo: the AI's bid or pass recommendation for one solicitation, run automatically after a ZIP upload. Mirrors
 * govCapabilityFit: instrumented client, explicit timeout, a single retry, strict JSON, and FAIL SOFT (no key or an
 * upstream error returns `error`, never throws). Its output is only a recommendation: govAiVerdict's rails decide what
 * it may do, and it sets no gate. Grounded only in the requirement statements, the fit result and our catalog.
 *
 * Solicitation text is untrusted: see govUntrustedText.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import type { CapabilityItem } from './govCapabilityFit';
import { untrustedBlock } from './govUntrustedText';

export interface GoNoGoRequest {
  requirements: { id: string; text: string }[];
  capabilities: CapabilityItem[];
  title?: string | null;
  buyer?: string | null;
}
export interface GoNoGoResult { verdict: 'pursue' | 'pass' | null; reason: string; quote: string | null; error?: string }

const MAX_REQUIREMENTS = 120;

/** PURE. Builds the prompt pair. Exported so the delimiter rail can be tested without a model call. */
export function buildGoNoGoPrompt(req: GoNoGoRequest, nonce: string): { system: string; user: string } {
  // The capability names were written by a model reading the ZIP, so they sit inside the delimiter with the requirements.
  const { rule, block } = untrustedBlock([
    'Capability assessment against our active services:',
    req.capabilities.map((c) => `- ${c.name}: ${c.assessment}`).join('\n') || '(none)',
    '',
    'Requirements:',
    req.requirements.slice(0, MAX_REQUIREMENTS).map((r) => `- ${r.id}: ${r.text}`).join('\n'),
  ].join('\n'), nonce);
  const system =
    'You advise a small technology and AI firm, a first-time government vendor, on whether to bid. Recommend "pursue" or "pass". ' +
    'Screen for walls a first-time vendor cannot clear: a mandatory security certification (TX-RAMP, StateRAMP, FedRAMP, SOC 2 report), ' +
    'a required number of past like-for-like implementations, a set-aside we do not hold, or a local-presence rule. ' +
    'Weigh the capability assessment provided. Work ONLY from what is provided; never invent a requirement, certification, number or date. ' +
    'Return strict JSON {"verdict":"pursue"|"pass","reason":string,"quote":string|null}. reason: 2 to 3 plain sentences. ' +
    'quote: the exact words from the solicitation text your reason relies on, at least 25 characters, copied verbatim; null if none. ' +
    rule;
  const user = [`Opportunity: ${req.title || '(untitled)'}${req.buyer ? ` - buyer: ${req.buyer}` : ''}`, block].join('\n');
  return { system, user };
}

export async function generateGoNoGo(req: GoNoGoRequest): Promise<GoNoGoResult> {
  const fail = (error: string): GoNoGoResult => ({ verdict: null, reason: '', quote: null, error });
  if (!process.env.OPENAI_API_KEY) return fail('AI go/no-go is unavailable (no API key configured).');
  if (!Array.isArray(req.requirements) || req.requirements.length === 0) return fail('No requirements to assess.');
  const { system, user } = buildGoNoGoPrompt(req, crypto.randomBytes(8).toString('hex'));
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_ai_go_no_go' }, { timeout: 90000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.2, max_tokens: 700, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: { verdict?: unknown; reason?: unknown; quote?: unknown } = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { return fail('The AI returned an unreadable go/no-go.'); }
    if (parsed.verdict !== 'pursue' && parsed.verdict !== 'pass') return fail('The AI returned no usable go/no-go.');
    return {
      verdict: parsed.verdict,
      reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 1000) : '',
      quote: typeof parsed.quote === 'string' && parsed.quote.trim() ? parsed.quote.trim().slice(0, 600) : null,
    };
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'gov_ai_go_no_go', outcome: 'failure',
      error_class: err?.constructor?.name ?? 'UpstreamUnavailable', context: { message: err?.message },
    }));
    return fail('The AI go/no-go could not be generated right now.');
  }
}
