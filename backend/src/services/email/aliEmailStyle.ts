// Ali's email writing style, as code.
//
// Source of truth: Basecamp "Ali Personal" to-do 9982045924 —
// https://3.basecamp.com/3945211/buckets/7463955/todos/9982045924
// ("Email writing style kit (6 files)": email-style-guide.md, the two GOOD
// templates, the anti-pattern template, checklist.md, style-linter.js).
// Ali: "Share this ticket URL with any project that drafts emails on Ali's
// behalf." /inbox-zero drafts and sends email as Ali, so it is one of those.
//
// This is a GUARD, not a reminder. Ali restated that on 2026-09-01 after ~15
// emails in one session each ended with a bare "Ali" line above the branded
// signature: the rule was already written, in bold, and was missed every
// single time. So the three non-negotiables are enforced twice — the draft is
// normalized when it is PROPOSED, and the send is refused at EXECUTE time if
// a hard violation somehow survives.
//
// The three non-negotiables:
//   1. No em-dashes or en-dashes anywhere (subject, html, text).
//   2. Branded signature on every send.
//   3. No double sign-off — the signature names him; the body must not end
//      with "Best, Ali" or any variant.
//
// The kit's style-linter.js is a CommonJS file for scripts/lib; a .js file
// there never reaches dist (backend builds only .ts), so this is the typed
// port the compiled backend can actually import. Rules kept identical; where
// they differ, the kit wins and this file is the thing that is wrong.

/** Plain-text signature (reference_email_signature). The Gmail executor sends text/plain. */
export const ALI_SIGNATURE_TEXT = [
  'Ali Muwwakkil',
  'Managing Director / AI Systems Architect',
  'Colaberry Inc.',
  '',
  '200 Chisholm Place, Suite 200, Plano, TX 75075',
  'ali@colaberry.com  |  enterprise.colaberry.ai',
  'Design Your AI Organization: https://advisor.colaberry.ai/advisory',
].join('\n');

export const STYLE_KIT_URL = 'https://3.basecamp.com/3945211/buckets/7463955/todos/9982045924';

/** Markers that mean a branded signature is already present in a body. */
const SIGNATURE_MARKERS = [
  /Managing Director\s*\/\s*AI Systems Architect/i,
  /200 Chisholm Place/i,
  /enterprise\.colaberry\.ai/i,
];

export function hasBrandedSignature(body: string): boolean {
  return SIGNATURE_MARKERS.some((rx) => rx.test(body));
}

// NOT global: a /g/ regex used with .test() carries lastIndex between calls,
// so the second call on the same content can return false. The no-emdash rule
// tests body and subject in one expression, and lint runs repeatedly.
const DASHES = /[—–]/;
// The replacement swallows the spaces AROUND the dash too: "Refund — approved"
// becomes "Refund - approved", never "Refund  -  approved". The kit's rule is
// "a hyphen with spaces", singular.
const DASHES_WITH_SPACE = /[ 	]*[—–][ 	]*/g;

/** An informal closer at the very end of the body ("Best,\nAli"). */
const TRAILING_SIGNOFF = /\n+\s*(best|thanks|thank you|cheers|regards|sincerely|warmly|best regards)\s*[,.!]?\s*\n+\s*(ali|ali muwwakkil)\s*[.!]?\s*$/i;
/** A bare name on the last line, with no closer above it. */
const TRAILING_BARE_NAME = /\n+\s*(ali|ali muwwakkil)\s*[.!]?\s*$/i;

export interface StyleViolation {
  rule: string;
  detail: string;
}

export interface StyleLintResult {
  ok: boolean;
  hardFails: StyleViolation[];
  softFails: StyleViolation[];
}

const HARD_RULES: Array<{ rule: string; detail: string; test: (body: string, subject: string) => boolean }> = [
  {
    rule: 'no-emdash',
    detail: 'Em-dash (U+2014) or en-dash (U+2013) found. Use a slash, a comma, or a hyphen with spaces.',
    test: (body, subject) => DASHES.test(body) || DASHES.test(subject),
  },
  {
    rule: 'no-double-signoff',
    detail: 'Informal closer (Best/Thanks/Regards/Sincerely + Ali) found while the branded signature is also present. Pick one.',
    test: (body) => hasBrandedSignature(body) && /\b(best|thanks|cheers|regards|sincerely),?\s*\n+\s*ali\b/i.test(body),
  },
  {
    rule: 'no-duplicate-full-name',
    detail: 'Full name appears more than once. Only the signature should name him.',
    test: (body) => (body.match(/Ali Muwwakkil/g) || []).length > 1,
  },
  {
    rule: 'has-branded-signature',
    detail: 'No branded signature in the body. Every send carries it.',
    test: (body) => !hasBrandedSignature(body),
  },
];

const SOFT_RULES: Array<{ rule: string; detail: string; test: (body: string, subject: string) => boolean }> = [
  {
    rule: 'no-fluff-opener',
    detail: '"Hope you\'re doing well" / "I just wanted to reach out". Cut it and lead with the point.',
    test: (body) => /hope (you'?re|you are|this) (doing well|finds you)/i.test(body) || /\bi\s+just\s+wanted\s+to\s+(reach\s+out|share|send)/i.test(body),
  },
  {
    rule: 'no-vague-urgency',
    detail: 'Vague urgency (ASAP / at your earliest convenience) with no specific date.',
    test: (body) => /\b(asap|at your earliest convenience|as soon as possible)\b/i.test(body),
  },
  {
    rule: 'no-marketing-exclamation',
    detail: 'Exclamation in the subject, or stacked exclamations in the body. Not Ali\'s voice.',
    test: (body, subject) => /!{2,}/.test(body) || /!/.test(subject),
  },
  {
    rule: 'no-hedging-stack',
    detail: 'Stacked hedging ("I think maybe", "just wanted to"). One hedge is fine; a stack reads weak.',
    test: (body) => {
      const lower = body.toLowerCase();
      const hedges = ['i think', 'i guess', 'maybe', 'perhaps', 'possibly', 'kind of', 'sort of', 'just wanted to', 'just thought'];
      return hedges.reduce((n, h) => n + (lower.split(h).length - 1), 0) >= 4;
    },
  },
  {
    rule: 'subject-not-vague',
    detail: 'Subject opens with a vague noun (Update / Quick / Touch base / Following up). Lead with the specific action.',
    test: (_body, subject) => /^(update|quick|touch\s+base|following\s+up|hi|hello|hey)\b/i.test(subject.trim()),
  },
];

/** Lint a draft the way the kit's style-linter.js does. Never throws. */
export function lintAliEmail(input: { subject?: string; html?: string; text?: string }): StyleLintResult {
  const subject = input.subject ?? '';
  const body = `${input.html ?? ''}\n${input.text ?? ''}`;
  const hardFails = HARD_RULES.filter((r) => r.test(body, subject)).map(({ rule, detail }) => ({ rule, detail }));
  const softFails = SOFT_RULES.filter((r) => r.test(body, subject)).map(({ rule, detail }) => ({ rule, detail }));
  return { ok: hardFails.length === 0, hardFails, softFails };
}

/**
 * Makes a plain-text draft compliant with the three non-negotiables, without
 * touching the writing: dashes become " - ", a trailing sign-off (closer or a
 * bare "Ali") is removed because the signature names him, and the signature is
 * appended exactly once. Idempotent — running it twice changes nothing.
 */
export function normalizeAliEmailText(body: string): string {
  let out = String(body ?? '').replace(DASHES_WITH_SPACE, ' - ');
  if (hasBrandedSignature(out)) {
    // Already signed: only strip a sign-off that sits ABOVE the signature.
    const idx = out.search(/Ali Muwwakkil/);
    const head = idx > 0 ? out.slice(0, idx) : out;
    const tail = idx > 0 ? out.slice(idx) : '';
    const cleanedHead = head.replace(/\n+\s*(best|thanks|thank you|cheers|regards|sincerely|warmly|best regards)\s*[,.!]?\s*\n+\s*ali\s*[.!]?\s*\n*$/i, '\n\n');
    return `${cleanedHead}${tail}`.replace(/\n{4,}/g, '\n\n\n').trimEnd();
  }
  out = out.replace(TRAILING_SIGNOFF, '').replace(TRAILING_BARE_NAME, '').trimEnd();
  return `${out}\n\n${ALI_SIGNATURE_TEXT}`;
}

/** Subject-line hygiene: the no-dash rule applies there too. */
export function normalizeAliSubject(subject: string): string {
  return String(subject ?? '').replace(DASHES_WITH_SPACE, ' - ');
}
