/**
 * One list of British spellings, shared by every artifact guard that checks for them.
 *
 * WHY THIS EXISTS. American spelling is a standing rule in this repo, and the guards that
 * enforced it were copied between ticket modules and had each drifted to a different,
 * short list: one caught three words, another six. Meanwhile 79 lines of British spelling
 * accumulated across 35 artifact modules, in prose that renders into PDFs a customer may
 * read. Ali caught it, twice.
 *
 * A guard that is pasted is a guard that diverges, so there is now one list and the
 * modules import it.
 *
 * NOTE FOR WHOEVER EDITS THIS FILE: it necessarily CONTAINS the British forms. Any
 * automated spelling sweep has to skip it, or it will rewrite the detector into nothing.
 */

/** Words whose British form must not appear in shipped prose, with the American form. */
const BRITISH_TO_AMERICAN = {
  programme: 'program',
  organisation: 'organization',
  licence: 'license',
  centre: 'center',
  labour: 'labor',
  artefact: 'artifact',
  enrolment: 'enrollment',
  behaviour: 'behavior',
  analyse: 'analyze',
  defence: 'defense',
  personalisation: 'personalization',
  labelled: 'labeled',
  sceptical: 'skeptical',
  recognise: 'recognize',
  realise: 'realize',
  synthesise: 'synthesize',
  cancelled: 'canceled',
  whilst: 'while',
  amongst: 'among',
};

/** Case-insensitive, word-bounded, matching plurals and common suffixes. */
const BRITISH = new RegExp(
  `\\b(${Object.keys(BRITISH_TO_AMERICAN).join('|')})(s|d|ing)?\\b`,
  'i',
);

/**
 * Returns the offending word, or null. Returning the word rather than a boolean means the
 * error message can name it, which is the difference between a guard somebody fixes and a
 * guard somebody disables.
 */
function findBritishSpelling(text) {
  const m = BRITISH.exec(String(text || ''));
  return m ? m[0] : null;
}

/** The American form for an offending word, for an error message that says what to use. */
function americanForm(word) {
  const base = String(word || '').toLowerCase().replace(/(s|d|ing)$/, '');
  return BRITISH_TO_AMERICAN[base] || BRITISH_TO_AMERICAN[String(word || '').toLowerCase()] || null;
}

module.exports = { BRITISH, BRITISH_TO_AMERICAN, findBritishSpelling, americanForm };
