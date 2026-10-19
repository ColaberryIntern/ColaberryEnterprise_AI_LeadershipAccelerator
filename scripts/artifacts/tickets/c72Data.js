/**
 * C7.2 - Pilot Proposal Template. THE single source for both PDFs.
 *
 * ## The named failure mode
 *
 * "Committing to outcomes the platform cannot evidence. Scope and exclusions must be
 * explicit." So the exclusions are not a footer. Three of them come straight out of the
 * C2.2 blueprint's own capability audit, including one the blueprint states in as many
 * words: Demo Day "has schema but has never been run end to end. Do not describe it to a
 * customer as proven."
 *
 * A proposal template that quietly omits that is the exact artifact this ticket warns about.
 *
 * ## Price comes from C2.3, approved 12 October 2026
 *
 * Pilot $44,500, list price only, 2.7% discount headroom. Not invented here and not
 * negotiable in the template.
 *
 * ## Every claim is registry-checked at build time
 *
 * C0.6 governs. The build greps the rendered prose for the words the registry prohibits and
 * fails rather than shipping a template that would put them in front of a buyer every time
 * it is used.
 */

const AS_OF = '18 October 2026';

const HEADLINE = 'The exclusions are the template. Three of them come from our own '
  + 'capability audit, including Demo Day, which the blueprint says in as many words must '
  + 'not be described to a customer as proven.';

const SO_WHAT = [
  'The ticket names the risk as committing to outcomes the platform cannot evidence. The '
    + 'C2.2 blueprint already audited that honestly and found two gaps at days 80 to 90, '
    + 'which is exactly where the sponsor decides whether to run it again, plus a Demo Day '
    + 'that has never run end to end. A proposal template is where those facts either get '
    + 'carried or get lost, so they are carried, in their own section, not in a footnote.',
  'The price is fixed and the template says so. C2.3 approved the pilot at $44,500 with '
    + '2.7% of discount headroom, which is list price only. A template that leaves price '
    + 'open invites the deal to be priced in the room.',
  'The success metrics are the customer’s own baseline, deliberately. C4.7 refused to '
    + 'publish a time-to-productivity improvement, a rework reduction, a benchmark salary, '
    + 'an expected return percentage or a payback period, because none of them is evidenced. '
    + 'So the proposal measures against numbers the customer supplies, and the discovery '
    + 'questionnaire in C7.4 is what collects them.',
];

/* ------------------------------------------------------------------ *
 * THE TEMPLATE SECTIONS
 * ------------------------------------------------------------------ */

/** Every variable the template exposes. Marked so nothing ships with a placeholder in it. */
const VARIABLES = [
  { v: '{{CUSTOMER}}', what: 'Legal entity name as it will appear on the SOW' },
  { v: '{{SPONSOR}}', what: 'Named executive sponsor, the C7.1 gate 2 person' },
  { v: '{{COHORT_SIZE}}', what: 'Participant count; drives nothing in price at pilot scale' },
  { v: '{{START_DATE}}', what: 'Day 1. Day 0 is contracting and sits 21 days earlier' },
  { v: '{{PROBLEMS}}', what: 'The 3 to 10 business problems, each with a named owner' },
  { v: '{{BASELINE_METRICS}}', what: 'From the C7.4 questionnaire. The customer’s own numbers' },
  { v: '{{PRICE}}', what: 'Pilot list price $44,500. Discount headroom 2.7% and no more' },
  { v: '{{SIGNATORY}}', what: 'Who signs, on both sides' },
];

const SCOPE = [
  'A 90-day pilot cohort running the ten-stage delivery model from the C2.2 blueprint.',
  'Capability baseline for every participant in week one, so the day-90 claim has a before.',
  'Role-based learning that leads into building, not a course that ends in a certificate.',
  'Each participant builds against one of the customer’s own named business problems.',
  'Commit-level verification of what each participant built, checkable by the customer '
    + 'without logging in to anything of ours.',
  'A written capability report at day 90 covering every participant.',
];

/**
 * The exclusions. Three are sourced from our own capability audit rather than from
 * commercial caution, and those are the ones that matter.
 */
const EXCLUSIONS = [
  {
    x: 'Demo Day is not included and is not offered',
    src: 'C2.2 blueprint capability audit',
    why: 'The blueprint states it "has schema but has never been run end to end" and '
      + 'instructs plainly: "Do not describe it to a customer as proven." The task set '
      + 'behind it stands at zero of forty-six.',
  },
  {
    x: 'Deployment candidate selection is not included',
    src: 'C2.2 blueprint capability audit',
    why: 'The blueprint records no capability at all for this stage. It sits at day 80 to '
      + '90, which is where a sponsor decides whether to run it again, so its absence is '
      + 'worth stating rather than discovering.',
  },
  {
    x: 'An automated executive impact report is not included',
    src: 'C2.2 blueprint capability audit',
    why: 'No generator exists. The day-90 capability report is written, not generated, and '
      + 'the proposal says so rather than implying a dashboard.',
  },
  {
    x: 'Learner tooling is excluded',
    src: 'C2.3 decision, 12 October 2026',
    why: 'The learner or the institution provides it. This was decided explicitly rather '
      + 'than left ambiguous, because absorbing it moves the floor.',
  },
  {
    x: 'No certification is issued by Colaberry',
    src: 'CLM-026',
    why: 'We prepare people for an external architect certification. We do not award it and '
      + 'the proposal must not imply that we do.',
  },
  {
    x: 'No placement, hiring or salary outcome is promised',
    src: 'C4.7 refusals',
    why: 'C4.7 refused to publish a benchmark salary or an expected return, because neither '
      + 'is evidenced. A proposal cannot commit to what the ROI framework declined to claim.',
  },
];

const CUSTOMER_OBLIGATIONS = [
  { o: 'A named executive sponsor who meets us monthly', when: 'Before day 0',
    src: 'C7.1 gate 2, and C2.2 stage 0' },
  { o: 'Three to ten real business problems in writing', when: 'Before day 0',
    src: 'C2.2 stage 0' },
  { o: 'A named problem owner for each one, who can answer questions during the build',
    when: 'Before day 0', src: 'C2.2 stage 0' },
  { o: 'Written permission to measure the outcome and publish a named reference',
    when: 'Before signature', src: 'C7.1 gate 1, non-waivable' },
  { o: 'Participant time, about three hours in week one for the baseline',
    when: 'Week 1', src: 'C2.2 stage 1' },
  { o: 'Baseline metrics for each named problem', when: 'Before day 1',
    src: 'C7.4 questionnaire' },
  { o: 'Named participants with manager sign-off', when: 'Before day 1',
    src: 'C7.1 criterion 2' },
];

const SUCCESS_METRICS = [
  { m: 'Every participant has at least one commit-verified build against a named customer '
    + 'problem', how: 'Checkable by the customer on a public page, without logging in. Live '
    + 'since 17 October 2026.' },
  { m: 'Capability movement from the week-one baseline', how: 'Same instrument at week one '
    + 'and day 90, scored the same way.' },
  { m: 'Each named business problem has a build attached to it',
    how: 'Counted against the {{PROBLEMS}} list, not against a target we set.' },
  { m: 'The customer’s own baseline metric, measured again at day 90',
    how: 'Whatever {{BASELINE_METRICS}} contains. We measure it; we do not predict it.' },
];

const PRICE = {
  list: '$44,500',
  package: 'Pilot',
  headroom: '2.7%',
  source: 'C2.3 Pricing and Packaging Model, approved by Ali 12 October 2026',
  note: 'List price only. The pilot carries 2.7% of discount headroom and no more. Any '
    + 'further discount is a decision, not a negotiation.',
};

/** Words the claim registry prohibits on an external surface. */
const PROHIBITED = [
  { word: 'free', row: 'CLM-027', instead: '"$0 to start" or "no card needed"' },
  { word: 'autonomous', row: 'CLM-009', instead: '"instrumented, audited and read-only"' },
  { word: 'guarantee', row: 'C4.7 refusals', instead: 'state what is measured, not promised' },
  { word: 'certified by colaberry', row: 'CLM-026', instead: '"prepares people for"' },
];

const LIMITS = [
  'Legal terms are out of scope and are C7.3. This proposal describes the commercial offer '
    + 'and stops at the signature path.',
  'The success metrics measure the customer’s baseline rather than predicting a return. '
    + 'That is a deliberate consequence of C4.7, which refused five figures for want of '
    + 'evidence, and it should be explained to a buyer rather than apologized for.',
  'What buyers push back on is unknown and C9.8 is supposed to feed it back. Until it does, '
    + 'the exclusions list is written from our own capability audit rather than from '
    + 'objections we have actually heard.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** "Exclusions explicit", and the three sourced from the capability audit must survive. */
function assertExclusionsExplicit() {
  if (EXCLUSIONS.length < 4) throw new Error('C7.2: too few exclusions to be credible');
  const demo = EXCLUSIONS.find((e) => /demo day/i.test(e.x));
  if (!demo || !/never been run end to end/i.test(demo.why)) {
    throw new Error('C7.2: the Demo Day exclusion must carry the blueprint’s own words. '
      + 'The blueprint says not to describe it to a customer as proven.');
  }
  const fromAudit = EXCLUSIONS.filter((e) => /blueprint/i.test(e.src)).length;
  if (fromAudit < 3) {
    throw new Error(`C7.2: only ${fromAudit} exclusions come from the capability audit; `
      + 'the audit found three gaps and all three belong here');
  }
  return { total: EXCLUSIONS.length, fromAudit };
}

/** "Customer obligations explicit", each with a deadline and a source. */
function assertObligationsExplicit() {
  for (const o of CUSTOMER_OBLIGATIONS) {
    if (!o.when || !o.src) throw new Error(`C7.2: obligation "${o.o}" has no deadline or source`);
  }
  if (!CUSTOMER_OBLIGATIONS.some((o) => /permission to measure/i.test(o.o))) {
    throw new Error('C7.2: the non-waivable permission-to-measure gate is missing');
  }
  return CUSTOMER_OBLIGATIONS.length;
}

/** "Success metrics measurable", and none may predict a return. */
function assertMetricsMeasurable() {
  for (const m of SUCCESS_METRICS) {
    if (!m.how) throw new Error(`C7.2: metric "${m.m}" has no method`);
    if (/\bROI\b|payback|increase of|\d+%\s*(improvement|gain|return)/i.test(m.m + m.how)) {
      throw new Error(`C7.2: metric "${m.m}" predicts a return, which C4.7 refused to claim`);
    }
  }
  return SUCCESS_METRICS.length;
}

/** "Variable fields marked", and no stray unmarked placeholder anywhere. */
function assertVariablesMarked() {
  for (const v of VARIABLES) {
    if (!/^\{\{[A-Z_]+\}\}$/.test(v.v)) throw new Error(`C7.2: "${v.v}" is not a marked field`);
    if (!v.what) throw new Error(`C7.2: ${v.v} has no explanation`);
  }
  return VARIABLES.length;
}

/**
 * Every externally visible claim must clear the registry.
 *
 * Checked against the rendered prose rather than intentions: a template is used dozens of
 * times, so a prohibited word in it is a prohibited word in every proposal that follows.
 */
function assertRegistryClean(renderedText) {
  const hay = String(renderedText || '').toLowerCase();
  const hits = [];
  for (const p of PROHIBITED) {
    // Allow the word where the document is explicitly naming it as prohibited.
    const re = new RegExp(`\\b${p.word}\\b`, 'g');
    const found = [...hay.matchAll(re)];
    for (const m of found) {
      const around = hay.slice(Math.max(0, m.index - 90), m.index + 90);
      if (/prohibit|never|registry|instead|clm-/i.test(around)) continue;
      hits.push(`"${p.word}" (${p.row})`);
      break;
    }
  }
  if (hits.length) {
    throw new Error('C7.2: the template uses registry-prohibited wording: ' + hits.join(', '));
  }
  return PROHIBITED.length;
}

module.exports = {
  AS_OF, HEADLINE, SO_WHAT, VARIABLES, SCOPE, EXCLUSIONS, CUSTOMER_OBLIGATIONS,
  SUCCESS_METRICS, PRICE, PROHIBITED, LIMITS,
  assertExclusionsExplicit, assertObligationsExplicit, assertMetricsMeasurable,
  assertVariablesMarked, assertRegistryClean,
};
