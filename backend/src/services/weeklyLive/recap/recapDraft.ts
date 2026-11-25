import { chatJson } from '../../runtime/runtimeAi';
import { RecapSummary, RecapSummarySchema, deckText, defaultSummary } from './recapContent';
import { lintObject, LintViolation } from './recapLint';
import { SessionInfo } from './recapStore';

/**
 * Draft the recap overview from what the class actually showed (WL1.2): the session title, its
 * description and the text of its deck. Ali edits it before sending, so a weak draft costs a minute,
 * never a bad email. Bounded: one model call, 45 s timeout, no retry; on any failure the safe default
 * comes back with the error class so the panel can say what happened.
 */
export const DRAFT_TIMEOUT_MS = 45_000;
export const DRAFT_MODEL = process.env.WEEKLY_LIVE_RECAP_MODEL || 'gpt-4o';

const SYSTEM = `You write the recap email overview for a live online AI class run by Colaberry Training.
The readers are working professionals aged 35 to 60, most without a coding background. Plain words, no jargon.
Return JSON only, with this shape:
{"headline": "max 12 words, what the class was about",
 "intro": "1 to 2 sentences thanking them and saying what they now can do",
 "ideas": [{"icon": "one emoji", "title": "max 8 words", "text": "one sentence"}] (3 to 5 items, the key ideas taught),
 "steps": ["what was built, one short step each"] (3 to 6 items, empty if nothing was built),
 "quote": "one memorable line from the class, max 20 words",
 "homework": "one small task for this week, one sentence"}
Rules: never mention any price, cost or offer; never mention partnerships; no statistics; no em dashes; American spelling.`;

export interface DraftResult { summary: RecapSummary; source: 'ai' | 'default'; violations: LintViolation[]; errorClass?: string }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('draft timed out'), { name: 'TimeoutError' })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function draftSummary(session: SessionInfo, call: typeof chatJson = chatJson): Promise<DraftResult> {
  const user = [
    `Class title: ${session.title}`,
    session.description ? `Description: ${session.description}` : '',
    `Deck text: ${deckText(session.kit_config_json) || '(no deck text available)'}`,
  ].filter(Boolean).join('\n\n');
  try {
    const r = await withTimeout(call('weekly_live_recap_draft', SYSTEM, user, DRAFT_MODEL, 900), DRAFT_TIMEOUT_MS);
    const parsed = RecapSummarySchema.safeParse(r.parsed);
    if (!parsed.success) {
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.recap_draft', outcome: 'failure', error_class: 'ContractViolation', context: { session_id: session.id } }));
      return { summary: defaultSummary(session.title), source: 'default', violations: [], errorClass: 'ContractViolation' };
    }
    return { summary: parsed.data, source: 'ai', violations: lintObject(parsed.data) };
  } catch (e) {
    const errorClass = e instanceof Error && e.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable';
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.recap_draft', outcome: 'failure', error_class: errorClass, context: { session_id: session.id } }));
    return { summary: defaultSummary(session.title), source: 'default', violations: [], errorClass };
  }
}
