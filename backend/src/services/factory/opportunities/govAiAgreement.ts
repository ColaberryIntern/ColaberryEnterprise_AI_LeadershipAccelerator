/**
 * govAiAgreement: how often the AI's call matched Ali's, so it's visible whether the AI is getting better. PURE.
 *
 * Nothing new is stored: the decisions already exist. A bid Ali approved, sent as an RFI response, or gave to an intern counts as
 * pursue. A bid he marked no-bid, or hid himself, counts as pass. A bid with no decision yet, or one the AI could not call, isn't
 * counted. These decided bids are also the examples a later step can show the AI so it calls new bids the way Ali would.
 */
import type { BoardFacts } from './govDiscoveryBoard';

export interface AiAgreement { decided: number; agreed: number }

type AgreementFacts = Pick<BoardFacts, 'vettings' | 'qualifications' | 'assigned' | 'humanPassed'>;

/** Ali's call on one bid, or null while he hasn't made one. */
export function humanCall(uuid: string, f: AgreementFacts): 'pursue' | 'pass' | null {
  const decision = f.qualifications.get(uuid)?.decision ?? null;
  if (decision === 'approved_bid_pursuit' || decision === 'rfi_response' || f.assigned.has(uuid)) return 'pursue';
  if (decision === 'no_bid' || f.humanPassed?.has(uuid)) return 'pass';
  return null;
}

export function aiAgreement(f: AgreementFacts): AiAgreement {
  let decided = 0;
  let agreed = 0;
  for (const [uuid, v] of f.vettings) {
    if (v.status !== 'completed' || (v.verdict !== 'pursue' && v.verdict !== 'pass')) continue;
    const human = humanCall(uuid, f);
    if (!human) continue;
    decided += 1;
    if (human === v.verdict) agreed += 1;
  }
  return { decided, agreed };
}
