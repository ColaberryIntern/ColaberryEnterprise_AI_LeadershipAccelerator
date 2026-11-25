/**
 * Caller opt-out (VS4.2): "stop calling me" on a live call is kept, not just answered politely.
 *
 * Detection is deterministic (a phrase list over the caller's own words), so it does not depend on the
 * model noticing. It errs toward honoring: a false positive costs a call, a false negative breaks a promise.
 *
 * Recording, in this order:
 *   1. the call is marked (state_reason 'caller_opt_out'), which is what the console counts;
 *   2. for a real call to a known lead, the repo's own opt-out path runs for the VOICE channel only
 *      (unsubscribe event, consent revoked, pending actions canceled). That record outlives the call row;
 *   3. the call gets an 'opt_out_recorded' event. Until it has one, the post-call sweep runs step 2 again,
 *      so a failure is retried and never lost. At least once on purpose: a second event is harmless.
 * A test call is only marked (its opt-out lives in the test run, never on a real person's record).
 *
 * Not covered: Engine B gives us no transcript yet, so it cannot detect this. An inbound caller has no
 * lead, so only step 1 applies. The caller's words are never logged or stored here.
 */
import { QueryTypes } from 'sequelize';
import { tapVoiceLog } from '../ops/opsMetrics';

const CALL = '(?:call(?:ing|s|ed)?|phon(?:e|ing)|ring(?:ing)?|contact(?:ing|ed)?|bother(?:ing|ed)?|dial(?:ing)?)';
const NOT = "(?:do\\s*n[o'\u2019]?t|don\\s*t|do\\s+not|never|not)";
const PATTERNS: readonly RegExp[] = [
  /\b(?:do\s*n[o'\u2019]?t|don\s*t|do\s+not|no\s+longer)\s+(?:want|wanna|wish|like|consent|agree)\b(?!\s+to\s+(?:miss|end|lose|drop|interrupt|hang|cut|finish|delay|cancel|rush|forget|call)\b)[^.?!]{0,30}\b(?:calls?|calling|called|contact(?:ed|ing)?|hear\s+from\s+you)\b(?![^.?!]{0,12}\btomorrow\b)/i,
  /\b(?:can\s*n[o'\u2019]?t|can(?:'|\u2019)t|cannot|should\s*n(?:'|\u2019)?t|shouldn(?:'|\u2019)t|must\s*not|mustn(?:'|\u2019)t)\s+(?:be\s+)?call(?:ing)?\s+(?:me|us|here)\b(?!\s+(?:after|before|until|till|between|today|tonight|right\s+now|at\s+(?:noon|midnight|night|\d)|on\s+(?:mon|tues|wednes|thurs|fri|satur|sun)days?|this\s+(?:morning|afternoon|evening|week|weekend))\b)/i,
  /\brather\s+you\s+(?:did\s*n(?:'|\u2019)?t|didn(?:'|\u2019)t|not)\s+(?:call|contact|phone)\b/i,
  /\bstop\s+with\s+(?:the|these|all)\b[^.?!]{0,12}\bcalls?\b/i,
  /\bDNC\b/i,
  /\bno\s+quiero\s+(?:que\s+me\s+llamen|m[a\u00e1]s\s+llamadas)\b/i,
  /\b(?:qu[i\u00ed]te(?:n)?me|b[o\u00f3]rre(?:n)?me|s[a\u00e1]que(?:n)?me)\s+de\b/i,
  new RegExp(`\\b(?:stop|quit|cease|no\\s+more)\\s+(?:all\\s+|the\\s+|these\\s+|those\\s+|your\\s+|with\\s+the\\s+)?${CALL}\\b`, 'i'),
  new RegExp(`\\b${NOT}\\s+(?:you\\s+|ever\\s+|please\\s+){0,2}(?:call|phone|ring|contact|bother|dial)(?:\\s+(?:me|us|this|here|again|back|my|anymore|any\\s+more|ever)\\b|\\s*$|\\s*[.!,])`, 'i'),
  new RegExp(`\\b${NOT}\\s+want\\s+(?:you\\s+to\\s+(?:call|phone|ring|contact)|(?:any\\s+|more\\s+|these\\s+|your\\s+)*(?:calls?|phone\\s+calls?)|to\\s+be\\s+(?:called|contacted|bothered))\\b`, 'i'),
  /\b(?:take|remove|get)\s+(?:me|us|my\s+(?:name|number)|this\s+number)\s+(?:off|from)\b/i,
  /\b(?:take|remove|delete|lose|forget|erase)\s+(?:my|this)\s+(?:phone\s+)?number\b/i,
  /\bdo[\s-]*not[\s-]*call\b/i,
  /\bdon(?:'|\u2019)?t[\s-]+call[\s-]+list\b/i,
  /\bleave\s+(?:me|us)\s+alone\b/i,
  /\bopt(?:ing)?\s*-?\s*(?:me\s+)?out\b/i,
  /\bunsubscribe\b/i,
  /^\W*(?:(?:please|okay|ok|just)\W+)*stop(?:\s+(?:it|please|now))*\W*$/i,
  /\b(?:no|ya\s+no)\s+(?:me\s+|nos\s+)?(?:vuelva[ns]?\s+a\s+)?(?:llame[ns]?|llamar(?:me|nos)?|contacte[ns]?)\b/i,
  /\b(?:deje|deja|dejen)\s+de\s+(?:llamar|contactar|molestar)/i,
];

export function detectsOptOut(text: string): boolean {
  return PATTERNS.some((p) => p.test(text.slice(0, 4_000)));
}

export interface OptOutDeps {
  mark: (callId: string) => Promise<{ leadId: number | null; testMode: boolean } | null>;
  /** The repo's opt-out path for the voice channel. Throws on failure. */
  suppress: (leadId: number) => Promise<void>;
  markRecorded: (callId: string) => Promise<void>;
  log: (line: Record<string, unknown>) => void;
}

export type OptOutResult = 'recorded' | 'marked' | 'unknown_call' | 'pending';

/** Never throws: the call goes on. 'pending' = marked or not, the sweep will try again. */
export async function recordOptOut(callId: string, d: OptOutDeps): Promise<OptOutResult> {
  const line = (level: string, outcome: string, extra: Record<string, unknown> = {}) => d.log({ level, service: 'voice-studio', event: 'voice_caller_opt_out', outcome, call_id: callId, ...extra });
  try {
    const call = await d.mark(callId);
    if (!call) { line('warn', 'skipped', { error_class: 'UnknownCall' }); return 'unknown_call'; }
    if (call.testMode || call.leadId === null) { line('info', 'success', { scope: call.testMode ? 'test' : 'call_only' }); return 'marked'; }
    await d.suppress(call.leadId);
    await d.markRecorded(callId);
    line('info', 'success', { scope: 'lead' });
    return 'recorded';
  } catch (e) {
    line('error', 'failure', { error_class: (e as Error).name || 'DatabaseError' });
    return 'pending';
  }
}

async function db() { return (await import('../../../config/database')).sequelize; }

export function productionOptOutDeps(): OptOutDeps {
  return {
    mark: async (callId) => {
      const s = await db();
      const rows = await s.query<{ leadId: number | null; testMode: boolean }>(
        `UPDATE voice_calls SET state_reason = 'caller_opt_out', updated_at = NOW() WHERE id = :callId RETURNING lead_id AS "leadId", test_mode AS "testMode"`,
        { replacements: { callId }, type: QueryTypes.SELECT });
      if (rows[0]) {
        // When it was first heard. Kept on retries, so the alert can age it.
        await s.query(
          `INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at)
           SELECT tenant_id, id, 'opt_out_heard', 'studio', 'session_active', NOW() FROM voice_calls WHERE id = :callId
           ON CONFLICT (call_id, event_key) DO NOTHING`, { replacements: { callId } });
      }
      return rows[0] ?? null;
    },
    suppress: async (leadId) => {
      const { processOptOut } = await import('../../unsubscribeEnforcementService');
      await processOptOut(leadId, 'voice', 'Asked on a call not to be called', 'voice-call');
    },
    markRecorded: async (callId) => {
      const s = await db();
      await s.query(
        `INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at)
         SELECT tenant_id, id, 'opt_out_recorded', 'studio', 'session_active', NOW() FROM voice_calls WHERE id = :callId
         ON CONFLICT (call_id, event_key) DO NOTHING`, { replacements: { callId } });
    },
    log: (l) => (l.level === 'info' ? console.log : console.warn)(JSON.stringify(tapVoiceLog(l))),
  };
}

/** Finish opt-outs whose record never completed. Returns how many it tried. */
export async function reconcileOptOuts(limit = 20, deps: OptOutDeps = productionOptOutDeps()): Promise<number> {
  const s = await db();
  const rows = await s.query<{ id: string }>(
    `SELECT c.id FROM voice_calls c
      WHERE c.state_reason = 'caller_opt_out' AND c.test_mode = FALSE AND c.lead_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM voice_call_events e WHERE e.call_id = c.id AND e.event_key = 'opt_out_recorded')
      ORDER BY c.updated_at LIMIT :limit`, { replacements: { limit }, type: QueryTypes.SELECT });
  for (const r of rows) await recordOptOut(r.id, deps); // eslint-disable-line no-await-in-loop -- bounded, in order
  return rows.length;
}
