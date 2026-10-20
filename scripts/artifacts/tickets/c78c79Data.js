/**
 * C7.8 and C7.9 - the security one-pager and the procurement FAQ. ONE module, because the
 * FAQ expands the one-pager and the two must never disagree in front of a buyer.
 *
 * ## These are outbound documents, so the bar is different
 *
 * Everything here goes to an enterprise buyer, which means a sentence that is merely
 * optimistic is a misrepresentation. Two rules follow and both are enforced by the build:
 *
 *   1. EVERY LINE TRACES TO C7.7. The one-pager's acceptance criterion says so, and
 *      `assertEveryLineTracesToC77` checks each line's `from` against the real gap, strength
 *      and certification ids in c77Data. A line that cites a gap that does not exist fails
 *      the build, and so does a line citing nothing.
 *   2. NO UNHELD CERTIFICATION IS IMPLIED. We hold none. C7.7 found four live pages already
 *      claiming SOC 2 alignment, so this is not a hypothetical risk in this codebase.
 *
 * ## The subprocessor list is measured, not remembered
 *
 * C7.7's G10 is "No subprocessor list and no data processing agreement", so C7.9 closes one
 * of C7.7's own gaps. The list below was read from production on 19 October by checking
 * which credentials are actually configured - presence and length only, never a value.
 *
 * That measurement changed the answer. ANTHROPIC_API_KEY is ABSENT and MENTOR_LLM_PROVIDER
 * is unset, so Anthropic is NOT a subprocessor, even though the registry claim "We build on
 * Claude and Claude Code" is true and approved. One is about how we build; the other is
 * about who processes a customer's data. Writing this from memory would have got it wrong.
 */
const C77 = require('./c77Data');
const { findBritishSpelling, americanForm } = require('../britishSpellings');

const AS_OF = '2026-10-19';

/** Every id a line may cite. Built from C7.7 rather than restated. */
const VALID_REFS = new Set([
  ...C77.GAPS.map((g) => g.id),
  ...C77.CERTS.map(([name]) => `CERT:${name}`),
  ...C77.STRENGTHS.map((s, i) => `S${i + 1}`),
]);

/* ── C7.8: the one-pager ──────────────────────────────────────────────────── */

const HOLD_NOTHING = C77.CERTS.map(([name, state]) => ({
  name,
  state,
  from: [`CERT:${name}`],
}));

/**
 * What is genuinely true and good. Leading with strengths we do not have would be the
 * failure; leading with none at all would be inaccurate, and C7.7 found eight.
 */
const STRONG = [
  { line: 'Every administrative write is recorded in an append-only audit trail.',
    from: ['S1', 'G12'],
    caveat: 'It covers admin writes only and is not tamper-evident.' },
  { line: 'Tenancy isolation is built, fails closed, and is audited.',
    from: ['S2', 'G2'],
    caveat: 'It is currently running in a permissive migration mode, which is gap G2 below.' },
  { line: 'Card data never reaches our systems. Payments are handled by PaySimple.',
    from: ['CERT:PCI DSS'],
    caveat: null },
  { line: 'Secrets are held in environment variables on the host, not in the repository.',
    from: ['S3'],
    caveat: null },
];

/** The two criticals, stated in the buyer's terms rather than ours. */
const CRITICAL_DISCLOSURES = [
  {
    buyerQuestion: 'What is your recovery point objective?',
    answer: 'We do not have one today. There is no database backup, so the honest answer is '
      + 'that the loss of the instance is the loss of the data.',
    from: ['G1'],
  },
  {
    buyerQuestion: 'Can your staff see other customers\' data?',
    answer: 'Today, yes. The isolation layer exists and fails closed, but it is running in a '
      + 'permissive mode while the membership table is empty, which is the live state.',
    from: ['G2'],
  },
];

/** What a buyer should take from the page. */
const POSITION = 'We are a small team with a real audit trail and no certifications. For a '
  + 'pilot with non-regulated data that is usually acceptable, and it should be your '
  + 'decision with these facts in front of you rather than ours by omission.';

/* ── C7.9: the procurement FAQ ────────────────────────────────────────────── */

/**
 * The questions that arrive in every enterprise deal.
 *
 * `state` is one of HELD, PARTIAL, NOT YET, or NOT APPLICABLE. A NOT YET with a date is a
 * commitment; a NOT YET without one is an admission, and both are better than prose that
 * reads like neither.
 */
const FAQ = [
  { q: 'Do you have SOC 2?', state: 'NOT YET',
    a: 'No report, no audit in progress, no auditor engaged. We will not describe ourselves '
      + 'as SOC 2 aligned, and if you have seen that phrase on one of our pages it is wrong '
      + 'and is being removed.',
    from: ['CERT:SOC 2 Type I or II'] },
  { q: 'Do you support SSO?', state: 'NOT YET',
    a: 'No SAML, no OIDC and no SCIM. Accounts are created and removed by us on request.',
    from: ['G3'] },
  { q: 'Is multi-factor authentication available?', state: 'NOT YET',
    a: 'Not for any identity class, including our own staff.', from: ['G4'] },
  { q: 'How is our data isolated from other customers?', state: 'PARTIAL',
    a: 'A tenancy layer exists and fails closed, but it is in a permissive mode today and '
      + 'most administrative routes do not yet consult it.', from: ['G2'] },
  { q: 'What happens if you lose the server?', state: 'NOT YET',
    a: 'There is no backup and no restore procedure. This is the single largest gap and the '
      + 'cheapest to close.', from: ['G1'] },
  { q: 'Who else processes our data?', state: 'HELD',
    a: 'The list below is complete as of the date on this document and was read from the '
      + 'running system rather than from documentation.', from: ['G10'] },
  { q: 'Which AI models see our content?', state: 'PARTIAL',
    a: 'OpenAI, for the features that use a model. Content is sent without redaction today, '
      + 'which is a gap we are naming rather than one you should have to discover.',
    from: ['G8'] },
  { q: 'Can we get a data processing agreement?', state: 'NOT YET',
    a: 'We do not have a standard DPA. We will sign yours.', from: ['G10'] },
  { q: 'How long do you keep our data, and can you delete it?', state: 'PARTIAL',
    a: 'A retention policy exists and is switched off. Deletion is possible on request and '
      + 'is a manual operation.', from: ['G9'] },
  { q: 'Do you scan dependencies for vulnerabilities?', state: 'NOT YET',
    a: 'No automated scanning, and the backend has no lockfile, so builds are not '
      + 'reproducible.', from: ['G6'] },
  { q: 'Who do we contact about a vulnerability?', state: 'NOT YET',
    a: 'There is no published route and no incident response plan. Until there is, email '
      + 'the engagement lead directly.', from: ['G16'] },
];

/**
 * Read from production on 19 October by checking which credentials are configured.
 *
 * `live` is the measured fact. `purpose` says what the processor sees, because a buyer's
 * question is never "do you use a vendor", it is "what of ours do they get".
 */
const SUBPROCESSORS = [
  { name: 'OpenAI', live: true, short: 'Model inference. Receives submitted content.',
    purpose: 'Model inference for AI features. Receives the content submitted to those '
      + 'features.' },
  { name: 'Mailchimp Transactional (Mandrill)', live: true,
    short: 'Email delivery. Addresses and message content.',
    purpose: 'Transactional email delivery. Receives recipient addresses and message '
      + 'content.' },
  { name: 'PaySimple', live: true, short: 'Payments. Card data never reaches us.',
    purpose: 'Payment processing. Receives card data directly; it does not pass through our '
      + 'systems.' },
  { name: 'Cloudflare', live: true, short: 'CDN and TLS. Request metadata.',
    purpose: 'CDN and TLS termination for the public site. Sees request metadata.' },
  { name: 'Zoom', live: true, short: 'Class delivery and recordings.',
    purpose: 'Class delivery and recordings, where a cohort uses it. Receives session '
      + 'content.' },
  { name: 'Synthflow', live: true, short: 'Our outbound voice. No customer data.',
    purpose: 'Outbound voice. Used for our own prospecting, not for customer data.' },
  { name: 'Apollo', live: true, short: 'Our prospecting data. No customer data.',
    purpose: 'B2B contact data for our own prospecting. Receives no customer data.' },
  { name: 'Anthropic', live: false,
    short: 'NOT a subprocessor. Dormant, no key configured.',
    purpose: 'NOT a subprocessor. The client exists in the codebase and is dormant: no API '
      + 'key is configured in production and the provider switch is unset. We build with '
      + 'Claude Code; that is a statement about our engineering and not about your data.' },
];

/** A buyer can run this against us directly. That is the point of C7.9. */
const BUYER_CHECKLIST = [
  'Ask for the subprocessor list and check it names what each one receives.',
  'Ask what the recovery point objective is, and what was the date of the last restore test.',
  'Ask whether staff can access your tenant, and what records that access.',
  'Ask which model provider sees your content and whether it is redacted first.',
  'Ask for the retention period and the deletion procedure, and whether either is automated.',
  'Ask who to contact about a vulnerability and what the response commitment is.',
  'Ask for any certification claim in writing, with the report date and the auditor.',
];

/* ── assertions ───────────────────────────────────────────────────────────── */

/** Every outbound line must cite a real C7.7 finding. */
function assertEveryLineTracesToC77() {
  const lines = [
    ...HOLD_NOTHING, ...STRONG, ...CRITICAL_DISCLOSURES, ...FAQ,
  ];
  let checked = 0;
  for (const l of lines) {
    const refs = l.from || [];
    if (!refs.length) {
      throw new Error(`C7.8/C7.9: a line cites nothing: "${(l.line || l.q || l.name)}"`);
    }
    for (const ref of refs) {
      if (!VALID_REFS.has(ref)) {
        throw new Error(`C7.8/C7.9: "${(l.line || l.q || l.name)}" cites ${ref}, which is not `
          + 'a finding in C7.7. Every line must trace to the assessment.');
      }
      checked += 1;
    }
  }
  return { lines: lines.length, refs: checked, available: VALID_REFS.size };
}

/** We hold nothing. Nothing may read as though we do. */
function assertNoUnheldCertificationImplied() {
  const prose = [
    ...STRONG.map((s) => `${s.line} ${s.caveat || ''}`),
    ...CRITICAL_DISCLOSURES.map((d) => d.answer),
    ...FAQ.map((f) => f.a),
    POSITION,
  ].join(' ');
  // First-person constructions only: naming a standard in order to deny holding it is the
  // entire job of this document, so a bare mention must not fail.
  const bad = /\b(we|our|colaberry)\b[^.]{0,40}\b(are|is|am)\s+(soc\s*2|iso\s*27001|hipaa|pci|fedramp)[^.]{0,20}\b(compliant|certified|aligned|ready)\b/i;
  if (bad.test(prose)) {
    throw new Error('C7.8/C7.9: the copy implies a certification we do not hold');
  }
  if (!/no report, no audit in progress/i.test(prose)) {
    throw new Error('C7.8/C7.9: the SOC 2 answer must stay explicit about holding nothing');
  }
  return true;
}

/** Gaps marked, not glossed: every CRITICAL finding must appear by name. */
function assertEveryCriticalGapIsDisclosed() {
  const criticals = C77.GAPS.filter((g) => (g.sev.k || g.sev) === 'CRITICAL');
  const cited = new Set([
    ...CRITICAL_DISCLOSURES.flatMap((d) => d.from),
    ...FAQ.flatMap((f) => f.from),
  ]);
  for (const g of criticals) {
    if (!cited.has(g.id)) {
      throw new Error(`C7.8/C7.9: critical gap ${g.id} ("${g.gap}") is not disclosed. `
        + 'Gaps are marked, not glossed.');
    }
  }
  return criticals.length;
}

/**
 * The subprocessor list must match what production actually has configured.
 *
 * Hard-coding the measured state here and asserting its shape is weaker than re-reading
 * production, which a build script cannot do. So this asserts the thing that would actually
 * go wrong: a processor listed with no stated purpose, and the Anthropic row quietly
 * flipping to live without someone re-measuring.
 */
function assertSubprocessorsAreDisclosedHonestly() {
  for (const s of SUBPROCESSORS) {
    if (!s.purpose || s.purpose.length < 30) {
      throw new Error(`C7.9: "${s.name}" is listed with no real statement of what it receives`);
    }
  }
  const anthropic = SUBPROCESSORS.find((s) => s.name === 'Anthropic');
  if (!anthropic || anthropic.live !== false) {
    throw new Error('C7.9: Anthropic was measured as NOT configured in production on '
      + `${AS_OF}. If that changed, re-measure and rewrite the row rather than flipping it.`);
  }
  if (!/dormant/i.test(anthropic.purpose)) {
    throw new Error('C7.9: the Anthropic row must explain why it is not a subprocessor, '
      + 'because "we build on Claude" is a published claim and a reader will ask.');
  }
  return { total: SUBPROCESSORS.length, live: SUBPROCESSORS.filter((s) => s.live).length };
}

/** Outbound copy: American spelling, no em dash, and never the prohibited word. */
function assertCopyIsClean() {
  const prose = [
    ...STRONG.map((s) => `${s.line} ${s.caveat || ''}`),
    ...CRITICAL_DISCLOSURES.map((d) => `${d.buyerQuestion} ${d.answer}`),
    ...FAQ.map((f) => `${f.q} ${f.a}`),
    ...SUBPROCESSORS.map((s) => s.purpose),
    ...BUYER_CHECKLIST,
    POSITION,
  ].join(' ');
  const british = findBritishSpelling(prose);
  if (british) {
    throw new Error(`C7.8/C7.9: British spelling "${british}"; use "${americanForm(british)}"`);
  }
  if (/—/.test(prose)) throw new Error('C7.8/C7.9: the copy contains an em dash');
  if (/\bfree\b/i.test(prose)) throw new Error('C7.8/C7.9: the copy advertises "free"');
  return true;
}

/** A checklist a buyer cannot act on is a brochure. */
function assertChecklistIsActionable() {
  for (const item of BUYER_CHECKLIST) {
    if (!/^Ask /.test(item)) {
      throw new Error(`C7.9: "${item}" is not phrased as something a buyer can do`);
    }
  }
  if (BUYER_CHECKLIST.length < 5) throw new Error('C7.9: the checklist is too thin to use');
  return BUYER_CHECKLIST.length;
}

module.exports = {
  AS_OF,
  C77,
  VALID_REFS,
  HOLD_NOTHING,
  STRONG,
  CRITICAL_DISCLOSURES,
  POSITION,
  FAQ,
  SUBPROCESSORS,
  BUYER_CHECKLIST,
  assertEveryLineTracesToC77,
  assertNoUnheldCertificationImplied,
  assertEveryCriticalGapIsDisclosed,
  assertSubprocessorsAreDisclosedHonestly,
  assertCopyIsClean,
  assertChecklistIsActionable,
};
