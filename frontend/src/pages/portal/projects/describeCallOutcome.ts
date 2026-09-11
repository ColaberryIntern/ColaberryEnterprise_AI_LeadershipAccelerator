import type { DiscoveryCallOutcome } from '../../../services/sbpApi';

// What the student is told after asking for a call. Pure, so the words can be
// tested without React.
//
// The rule: never say a call is coming unless the server said `placed: true`.
// A refusal is reported as one, in plain words, with what happens to the
// number they gave. Nothing here invents a reason the server did not give.

export type CallNoticeInput = DiscoveryCallOutcome | { placed: false; reason: 'unreachable' };

export interface CallNotice {
  tone: 'ok' | 'warn';
  text: string;
}

export function describeCallOutcome(outcome: CallNoticeInput, phone: string): CallNotice {
  if (outcome.placed) {
    const n = outcome.angles.length;
    return {
      tone: 'ok',
      text: `An AI assistant will call ${phone} shortly about ${n === 1 ? 'the one open question' : `${n} open questions`}. What you say is added to your project's record, and you can correct any of it afterwards.`,
    };
  }
  switch (outcome.reason) {
    case 'nothing_to_ask':
      return { tone: 'ok', text: 'Everything the plan needed was already answered, so there was nothing to call about. Your number is on record and will not be called.' };
    case 'cooling_down':
      return { tone: 'warn', text: 'We reached out to you a few minutes ago, so we will not call again right now. Your build continues.' };
    case 'consent_not_recorded':
      return { tone: 'warn', text: 'We could not save your consent, so no call was placed and your number was not kept. Your build continues without it.' };
    case 'consent_text_stale':
      return { tone: 'warn', text: 'The consent wording changed while you were on the page, so nothing was recorded. Reload and tick it again if you still want the call.' };
    case 'unreachable':
      return { tone: 'warn', text: 'We could not reach the server to set the call up. Your build continues without it.' };
    default:
      // no_agent_configured, dial_skipped, dial_failed, no_intake_yet, no_phone,
      // no_consent: the honest shape of each is the same to the student.
      return { tone: 'warn', text: 'We could not place the call. Your build continues without it, and nothing else happens with your number.' };
  }
}
