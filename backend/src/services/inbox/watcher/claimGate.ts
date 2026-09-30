/**
 * The gate between "what the watcher did" and "what the email says it did".
 *
 * A reply claiming a fix that was not verified is worse than no reply. A
 * student who is told their sign-in is fixed stops trying, stops writing, and
 * finds out on Monday morning that it was not. So a claim is not allowed to be
 * a sentence somebody wrote — it has to be an assertion with a named piece of
 * evidence behind it, and a claim of a FIX has to be backed by evidence
 * gathered AFTER the change, not by the read that diagnosed it.
 *
 * That last distinction is the whole point. Reading a broken row, writing a
 * fix, and then quoting the original read as proof is the natural shape of this
 * bug and it looks completely convincing in a log. `postChange` evidence must
 * carry a timestamp at or after the moment the change was applied, so evidence
 * gathered before the write cannot be presented as confirmation of it.
 *
 * The gate also checks the direction everyone forgets: that each claim's text
 * actually appears in the body being sent. A gate that validates a list of
 * claims which the email does not contain, while the email contains promises
 * that are not on the list, passes cleanly and protects nothing.
 */

export interface Evidence {
  id: string;
  /** What was read or written, naming the source. */
  what: string;
  /** The observed value or the result of the write. */
  result: string;
  at: string;
  /** True only for evidence gathered after the change, to confirm it landed. */
  postChange?: boolean;
}

export interface Claim {
  id: string;
  /** The exact sentence the reply body must contain. */
  text: string;
  kind: 'checked' | 'fixed';
  evidenceIds: string[];
}

export interface ClaimBundle {
  claims: Claim[];
  evidence: Evidence[];
  /** When the change was applied. Required if any claim is of kind 'fixed'. */
  actionAt?: string;
}

export type ClaimRejection =
  | 'no_claims'
  | 'unknown_evidence'
  | 'unbacked_claim'
  | 'unverified_fix'
  | 'stale_verification'
  | 'claim_absent_from_body'
  | 'unbacked_fix_language';

export interface ClaimVerdict {
  ok: boolean;
  rejection?: ClaimRejection;
  detail?: string;
}

/**
 * Phrasing that asserts a repair to the reader. If the body contains any of
 * these and no verified fix claim exists, the reply is refused: it is promising
 * something the evidence does not support, whoever wrote the sentence.
 */
export const ASSERTIVE_FIX_PATTERNS: RegExp[] = [
  /\bi (?:have )?fixed\b/i,
  /\bwe (?:have )?fixed\b/i,
  /\bis now (?:working|fixed|active|resolved)\b/i,
  /\bhas been (?:fixed|resolved|corrected|restored)\b/i,
  /\bshould work now\b/i,
  /\byou can now sign in\b/i,
  /\bit(?:'s| is) sorted\b/i,
];

export function verifyClaims(bundle: ClaimBundle, body: string): ClaimVerdict {
  const { claims, evidence } = bundle;

  if (!claims || claims.length === 0) {
    return {
      ok: false,
      rejection: 'no_claims',
      detail: 'A reply with no evidence-backed claims has nothing to say that was checked.',
    };
  }

  const byId = new Map(evidence.map((e) => [e.id, e]));
  const actionMs = bundle.actionAt ? Date.parse(bundle.actionAt) : NaN;

  for (const claim of claims) {
    if (claim.evidenceIds.length === 0) {
      return {
        ok: false,
        rejection: 'unbacked_claim',
        detail: `Claim "${claim.id}" cites no evidence: "${claim.text}"`,
      };
    }

    const cited: Evidence[] = [];
    for (const id of claim.evidenceIds) {
      const ev = byId.get(id);
      if (!ev) {
        return {
          ok: false,
          rejection: 'unknown_evidence',
          detail: `Claim "${claim.id}" cites evidence "${id}", which does not exist.`,
        };
      }
      cited.push(ev);
    }

    if (claim.kind === 'fixed') {
      const confirmations = cited.filter((e) => e.postChange === true);
      if (confirmations.length === 0) {
        return {
          ok: false,
          rejection: 'unverified_fix',
          detail:
            `Claim "${claim.id}" says something was fixed but cites only pre-change reads. ` +
            'A fix is claimable once it has been re-read after the write, never before.',
        };
      }
      if (!Number.isFinite(actionMs)) {
        return {
          ok: false,
          rejection: 'stale_verification',
          detail:
            `Claim "${claim.id}" is a fix claim but the bundle records no actionAt, so its ` +
            'confirmation cannot be shown to postdate the change.',
        };
      }
      for (const c of confirmations) {
        const at = Date.parse(c.at);
        if (!Number.isFinite(at) || at < actionMs) {
          return {
            ok: false,
            rejection: 'stale_verification',
            detail:
              `Claim "${claim.id}" cites confirmation "${c.id}" timestamped ${c.at}, which is ` +
              `before the change at ${bundle.actionAt}. That is the diagnosing read, not proof ` +
              'the change landed.',
          };
        }
      }
    }

    if (!body.includes(claim.text)) {
      return {
        ok: false,
        rejection: 'claim_absent_from_body',
        detail:
          `Claim "${claim.id}" was verified but its text does not appear in the reply body. ` +
          'The gate would be checking assertions the student never receives.',
      };
    }
  }

  const hasVerifiedFix = claims.some((c) => c.kind === 'fixed');
  if (!hasVerifiedFix) {
    for (const pattern of ASSERTIVE_FIX_PATTERNS) {
      if (pattern.test(body)) {
        return {
          ok: false,
          rejection: 'unbacked_fix_language',
          detail:
            `The body asserts a repair (matched ${pattern}) but no verified fix claim backs it. ` +
            'Either verify the fix or write only what was checked.',
        };
      }
    }
  }

  return { ok: true };
}
