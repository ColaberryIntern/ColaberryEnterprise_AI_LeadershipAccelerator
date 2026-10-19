/**
 * American spelling is a standing rule in this repo. This is the gate that enforces it.
 *
 * WHY IT EXISTS. The rule was previously enforced by three guards that had each been
 * copy-pasted into a different artifact module and drifted to a different word list: one
 * caught three words, another six. Nothing checked the artifact tree as a whole, so 138
 * British spellings accumulated across 51 files, in prose that renders into PDFs a customer
 * may read and into comments posted to Basecamp tickets. It was caught by a human reading
 * the output, twice, which is the most expensive place to catch it.
 *
 * The three blocks below test three different things, and the middle one is the one that
 * would have caught the real bug:
 *
 *   1. the detector finds British spellings,
 *   2. it suggests the right WORD, not just the right stem,
 *   3. the artifact tree is clean.
 *
 * Block 2 exists because the first fix pass was driven by a detector that found "Colours"
 * correctly and suggested "Color". The sweep did what it was told and rewrote a heading to
 * the singular. A detector that is right about the problem and wrong about the answer is
 * worse than no detector, because something downstream acts on the answer.
 */
const {
  findBritishSpelling,
  americanForm,
} = require('../../../../../scripts/artifacts/britishSpellings');
const { scan, filesToScan } = require('../../../../../scripts/artifacts/checkAmericanSpelling');

describe('the British-spelling detector', () => {
  // "authorisation" and "judgement" are here specifically: both were missed by the original
  // hand-written list and both reached prose already posted to a ticket.
  const BRITISH = [
    'authorisation', 'judgement', 'programme', 'organisation', 'licence', 'centre', 'labour',
    'artefact', 'enrolment', 'behaviour', 'analyse', 'defence', 'labelled', 'sceptical',
    'whilst', 'amongst', 'prioritise', 'optimisation', 'colour', 'favour', 'fulfil',
    'catalogue', 'grey', 'greyscale', 'metre', 'offence', 'modelling', 'enquiry', 'speciality',
  ];

  it.each(BRITISH)('flags %s', (word) => {
    expect(findBritishSpelling(word)).toBeTruthy();
  });

  // Every one of these is correct American English, and most of them appear in this repo.
  // A guard that flags "enterprise" is a guard somebody switches off within the week.
  const AMERICAN = [
    'enterprise', 'expertise', 'comprise', 'compromise', 'advertise', 'supervise', 'improvise',
    'surprise', 'exercise', 'franchise', 'merchandise', 'revise', 'advise', 'devise', 'precise',
    'premise', 'promise', 'otherwise', 'likewise', 'clockwise', 'raise', 'praise', 'fundraising',
    'overpromise', 'cruise', 'paradise', 'treatise', 'program', 'organization', 'authorization',
    'judgment', 'license', 'center', 'labor', 'artifact', 'behavior', 'analyze', 'defense',
    'labeled', 'skeptical', 'color', 'calibration', 'parameter', 'diameter', 'glamour',
    'contour', 'devour', 'flour', 'hour', 'practice', 'dependent', 'oriented', 'inquiry',
  ];

  it.each(AMERICAN)('leaves %s alone', (word) => {
    expect(findBritishSpelling(word)).toBeNull();
  });
});

describe('the suggested American form keeps the inflection', () => {
  // The bug this block exists for: "colours" -> "color" dropped the plural, and the sweep
  // acting on that suggestion rewrote a "## Colours" heading to "## Color".
  const CASES = [
    ['colours', 'colors'], ['coloured', 'colored'], ['colouring', 'coloring'],
    ['organisations', 'organizations'], ['organising', 'organizing'],
    ['recognised', 'recognized'], ['recognises', 'recognizes'],
    ['summarises', 'summarizes'], ['generalised', 'generalized'],
    ['analysed', 'analyzed'], ['analysing', 'analyzing'],
    ['judgements', 'judgments'], ['behaviours', 'behaviors'],
    ['behaviourally', 'behaviorally'], ['centres', 'centers'], ['metres', 'meters'],
    ['licences', 'licenses'], ['defences', 'defenses'], ['artefacts', 'artifacts'],
    ['catalogues', 'catalogs'], ['programmes', 'programs'], ['enquiries', 'inquiries'],
    ['authorisations', 'authorizations'], ['parameterised', 'parameterized'],
  ];

  it.each(CASES)('%s -> %s', (british, american) => {
    expect(americanForm(british)).toBe(american);
  });
});

describe('the artifact tree', () => {
  it('scans a non-trivial number of files', () => {
    // Guards the guard: if the walk silently stops finding files, the check below passes
    // vacuously and reports a clean tree because it looked at nothing.
    expect(filesToScan().length).toBeGreaterThan(50);
  });

  it('contains no British spellings', () => {
    const findings = scan();
    const report = findings
      .map((f) => `${f.file}:${f.line}  ${f.word} -> ${f.american}\n    ${f.text}`)
      .join('\n');
    expect(report).toBe('');
  });
});
