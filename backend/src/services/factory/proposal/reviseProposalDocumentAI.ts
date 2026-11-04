/**
 * reviseProposalDocumentAI — the agent's targeted revision pass (Proposal Studio P5). Given the current document
 * HTML, the check findings (what's wrong), and the grounding (the ONLY facts it may use), it rewrites the FAILING
 * sections while leaving the rest intact, under the same rails as the drafter: instrumented OpenAI, explicit timeout,
 * sanitizeProposalHtml on the output, and NO fabrication — a missing fact becomes a structured question (a gap),
 * never an asserted fact. Fail-soft: no key / upstream error → an `error`, never a throw.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { sanitizeProposalHtml } from './govProposalDocumentDraftAI';
import { groundingToPromptText, type Grounding } from './proposalGrounding';
import type { CheckFinding } from './proposalReviewTypes';

export interface ReviseResult {
  html: string;
  /** Structured questions the revision could not answer from the grounding (never asserted facts). */
  gaps: Array<{ question: string; suggestions: string[] }>;
  changeSummary: string;
  error?: string;
}

export async function reviseDocument(currentHtml: string, findings: CheckFinding[], grounding: Grounding): Promise<ReviseResult> {
  if (!process.env.OPENAI_API_KEY) return { html: '', gaps: [], changeSummary: '', error: 'AI revision is unavailable (no API key configured).' };
  const failing = (Array.isArray(findings) ? findings : []).filter((f) => f.severity === 'fatal' || f.severity === 'major');
  if (failing.length === 0) return { html: sanitizeProposalHtml(currentHtml), gaps: [], changeSummary: 'No failing findings to revise.' };

  const findingsBlock = failing.map((f) => `- [${f.check}${f.sectionKey ? `/${f.sectionKey}` : ''}] ${f.message}`).join('\n');
  const system =
    'You REVISE a government-proposal document to fix the listed review findings, changing ONLY what the findings call ' +
    'out and leaving the rest of the document intact. CRITICAL: use ONLY the facts in the grounding below; never invent ' +
    'a client, metric, date, dollar figure, certification or person. Where a fix WOULD need a specific fact not in the ' +
    'grounding, insert a visible [PLACEHOLDER: …] and ALSO return it as a question. Return STRICT JSON ' +
    '{"html":"<full revised document, allowed tags only>","gaps":[{"question":"...","suggestions":["..."]}],"changeSummary":"<one line>"}. ' +
    'Allowed tags: h2,h3,h4,p,ul,ol,li,strong,em,table,thead,tbody,tr,th,td,blockquote,br,figure,figcaption,img.';
  const user = [
    'GROUNDING (your only source of specific facts):', groundingToPromptText(grounding), '',
    'REVIEW FINDINGS TO FIX:', findingsBlock, '',
    'CURRENT DOCUMENT:', String(currentHtml ?? '').slice(0, 30000),
  ].join('\n');

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_document_revise' }, { timeout: 120000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 4000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: any = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const html = sanitizeProposalHtml(parsed?.html);
    if (!html) return { html: '', gaps: [], changeSummary: '', error: 'The AI returned no usable revision.' };
    const gaps = Array.isArray(parsed?.gaps) ? parsed.gaps.filter((g: any) => g && typeof g.question === 'string').map((g: any) => ({ question: String(g.question), suggestions: Array.isArray(g.suggestions) ? g.suggestions.map(String) : [] })) : [];
    return { html, gaps, changeSummary: typeof parsed?.changeSummary === 'string' ? parsed.changeSummary : `Revised ${failing.length} finding(s).` };
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'proposal-studio-revise', event: 'gov_proposal_document_revise', outcome: 'failure', error_class: (err as any)?.constructor?.name ?? 'Error', context: { message: (err as any)?.message } }));
    return { html: '', gaps: [], changeSummary: '', error: 'The AI revision could not be generated right now.' };
  }
}
