import { Request, Response } from 'express';
import { z } from 'zod';
import { chatCompletion } from '../intelligence/assistant/openaiHelper';

/**
 * POST /api/sales-hub/cory
 * RAG endpoint for the Founding Cohort sales knowledge base (frontend/public/sales-hub).
 * The client retrieves the top-matching Q&A from the KB and sends them as `context`;
 * this composes a natural, grounded answer with the LLM instead of echoing a canned entry.
 * Returns 503 when the LLM is unavailable so the client falls back to local retrieval.
 */

const ContextItem = z.object({
  q: z.string().max(600),
  a: z.string().max(2500),
  detail: z.string().max(2500).optional().default(''),
});

const BodySchema = z.object({
  question: z.string().min(1).max(600),
  context: z.array(ContextItem).max(8).default([]),
});

// Confirmed canonical facts — safe to ground on even when retrieval misses.
const PINNED_FACTS =
  'AI Systems Architect Accelerator, powered by Anthropic + Claude Code. Enrollment is rolling - no fixed start date or capped cohort. ' +
  'The membership IS the full 12-week, project-based program: all four Architect Intensives, Anthropic Architect certification prep, a full-time internship experience, and guided GitHub portfolio projects. No separate course fees. ' +
  'Not ready to commit? A free Explorer account (training.colaberry.com) gives no-payment preview access - upgrade to full paid access anytime. ' +
  'Pricing for full access: $149/mo billed annually (founding rate, locks for as long as the membership stays active) or $199/mo monthly (cancel anytime). No scholarships or financial aid currently available. ' +
  'Schedule: 4 live hours per week (Monday Architecture Day 2h + Thursday Build Day 2h). Open House events still run periodically as a free, no-commitment intro. Architect Expo caps off each cohort. ' +
  'Outcome: a deployed AI system, a GitHub portfolio, and the Anthropic Architect certification. Enroll at training.colaberry.com. ' +
  'STUDENT-PAID third-party costs that Colaberry does NOT cover (always disclose): an Anthropic subscription for Claude Code (about $20/mo) and LLM API usage on the student\'s own key (most projects under $10/mo), paid directly to the providers. ' +
  'Refund/cancellation: monthly cancels anytime with access through the paid month, no partial-month refund; annual has a 14-day money-back window from the student\'s own cohort start date (enrollment is rolling, so this varies per student), then non-refundable but membership and founding rate stay locked for the full year. ' +
  'The $50 Open House seat deposit is no longer offered (retired 2026-08-04) - reserving a seat now means paying the plan price directly, and grants no curriculum access before the cohort start date. For a $50 deposit paid before it was retired, the old terms still apply: refundable or creditable to another cohort if the prospect doesn\'t attend; an unclaimed reservation past its start date lapses to an account credit automatically, not a charge.';

const SYSTEM =
  'You are Cory, Colaberry\'s warm, sharp admissions assistant for the AI Systems Architect Accelerator. ' +
  'Your user is a Colaberry sales rep talking live to a prospect, so be confident, concise, and human, and write a natural answer in your own words rather than restating a knowledge-base entry verbatim. ' +
  'Ground every factual claim in the PINNED FACTS and the CONTEXT provided. Never invent prices, dates, policies, or numbers. ' +
  'If the answer is not in the facts or context, say you do not have that detail and suggest confirming with Ali. ' +
  'If the question touches total cost or fees, you MUST mention the student-paid Anthropic (about $20/mo) and API (usually under $10/mo) costs that Colaberry does not cover. ' +
  'If it touches refunds, reserving a seat, or the (now-retired) $50 deposit, ground your answer in the refund/cancellation and deposit facts in PINNED FACTS. ' +
  'If the prospect is hesitant or not ready to pay, offer the free Explorer preview account (no payment) as the low-commitment next step, not pressure to decide now. If asked about scholarships, be direct: none are currently available. ' +
  'No emoji. No em-dashes. Keep it to a few sentences unless more is clearly needed.';

export async function handleSalesHubCory(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const { question, context } = parsed.data;

  const ctxText = context.length
    ? context
        .map((c, i) => `[${i + 1}] Q: ${c.q}\nA: ${c.a}${c.detail ? `\nMore: ${c.detail}` : ''}`)
        .join('\n\n')
    : '(no specific matches found in the knowledge base)';

  const user =
    `PINNED FACTS:\n${PINNED_FACTS}\n\n` +
    `CONTEXT (most relevant Q&A from the sales knowledge base):\n${ctxText}\n\n` +
    `The rep asks: ${question}\n\nWrite Cory's answer.`;

  try {
    const reply = await chatCompletion(SYSTEM, user, { maxTokens: 400, temperature: 0.4 });
    if (!reply) {
      res.status(503).json({ error: 'assistant_unavailable' });
      return;
    }
    res.json({ reply: reply.trim() });
  } catch (err) {
    console.error('[SalesHubCory] error:', (err as Error).message);
    res.status(503).json({ error: 'assistant_unavailable' });
  }
}
