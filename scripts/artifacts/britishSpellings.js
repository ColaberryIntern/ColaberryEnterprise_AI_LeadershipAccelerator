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
 * WHY THERE IS A SUFFIX NET AS WELL AS A LIST. The first version of this file was a
 * hand-written list of nineteen words, and it missed "authorisation" and "judgement" --
 * both of which were already sitting in prose posted to a ticket. A list only catches the
 * words whoever wrote it happened to think of. The -ise/-isation family is large, regular,
 * and the one that got through, so it is matched by rule rather than by memory, with an
 * explicit allowlist for the many English words that legitimately end that way
 * ("enterprise", "expertise", "comprise"). Families with messier exceptions (-re, -ce,
 * doubled -ll) stay on the explicit list, because a rule for those would flag more
 * correct words than wrong ones.
 *
 * NOTE FOR WHOEVER EDITS THIS FILE: it necessarily CONTAINS the British forms. Any
 * automated spelling sweep has to skip it, or it will rewrite the detector into nothing.
 */

/** Words whose British form must not appear in shipped prose, with the American form. */
const BRITISH_TO_AMERICAN = {
  // -ise / -isation. The family that got past the first list.
  authorise: 'authorize',
  authorisation: 'authorization',
  organise: 'organize',
  organisation: 'organization',
  organisational: 'organizational',
  prioritise: 'prioritize',
  prioritisation: 'prioritization',
  optimise: 'optimize',
  optimisation: 'optimization',
  utilise: 'utilize',
  utilisation: 'utilization',
  summarise: 'summarize',
  categorise: 'categorize',
  categorisation: 'categorization',
  standardise: 'standardize',
  standardisation: 'standardization',
  minimise: 'minimize',
  maximise: 'maximize',
  emphasise: 'emphasize',
  specialise: 'specialize',
  specialisation: 'specialization',
  normalise: 'normalize',
  normalisation: 'normalization',
  customise: 'customize',
  customisation: 'customization',
  recognise: 'recognize',
  realise: 'realize',
  synthesise: 'synthesize',
  personalise: 'personalize',
  personalisation: 'personalization',
  visualise: 'visualize',
  visualisation: 'visualization',
  finalise: 'finalize',
  formalise: 'formalize',
  generalise: 'generalize',
  centralise: 'centralize',
  commercialise: 'commercialize',
  commercialisation: 'commercialization',
  monetise: 'monetize',
  monetisation: 'monetization',
  incentivise: 'incentivize',
  operationalise: 'operationalize',
  rationalise: 'rationalize',
  modernise: 'modernize',
  mobilise: 'mobilize',
  stabilise: 'stabilize',
  digitise: 'digitize',
  digitisation: 'digitization',
  initialise: 'initialize',
  initialisation: 'initialization',
  serialise: 'serialize',
  tokenise: 'tokenize',
  anonymise: 'anonymize',
  randomise: 'randomize',
  characterise: 'characterize',
  familiarise: 'familiarize',
  scrutinise: 'scrutinize',
  publicise: 'publicize',
  penalise: 'penalize',
  harmonise: 'harmonize',
  synchronise: 'synchronize',
  criticise: 'criticize',
  apologise: 'apologize',
  analyse: 'analyze',
  analyser: 'analyzer',
  paralyse: 'paralyze',

  // -our
  colour: 'color',
  favour: 'favor',
  favourite: 'favorite',
  favourable: 'favorable',
  honour: 'honor',
  honourable: 'honorable',
  labour: 'labor',
  behaviour: 'behavior',
  behavioural: 'behavioral',
  neighbour: 'neighbor',
  rumour: 'rumor',
  humour: 'humor',
  vapour: 'vapor',
  odour: 'odor',
  armour: 'armor',
  harbour: 'harbor',
  saviour: 'savior',
  endeavour: 'endeavor',
  flavour: 'flavor',
  splendour: 'splendor',
  rigour: 'rigor',
  vigour: 'vigor',
  candour: 'candor',
  demeanour: 'demeanor',

  // -re
  centre: 'center',
  centred: 'centered',
  centring: 'centering',
  metre: 'meter',
  kilometre: 'kilometer',
  theatre: 'theater',
  litre: 'liter',
  fibre: 'fiber',
  calibre: 'caliber',
  sombre: 'somber',
  lustre: 'luster',
  spectre: 'specter',
  manoeuvre: 'maneuver',

  // -ce where American English uses -se
  defence: 'defense',
  offence: 'offense',
  pretence: 'pretense',
  licence: 'license',
  practise: 'practice',

  // doubled -ll, and the -l words American English doubles instead
  labelled: 'labeled',
  labelling: 'labeling',
  modelling: 'modeling',
  modelled: 'modeled',
  travelling: 'traveling',
  travelled: 'traveled',
  traveller: 'traveler',
  cancelled: 'canceled',
  cancelling: 'canceling',
  fuelled: 'fueled',
  signalled: 'signaled',
  totalled: 'totaled',
  counsellor: 'counselor',
  marvellous: 'marvelous',
  jeweller: 'jeweler',
  jewellery: 'jewelry',
  fulfil: 'fulfill',
  fulfilment: 'fulfillment',
  instalment: 'installment',
  enrolment: 'enrollment',
  skilful: 'skillful',
  wilful: 'willful',
  distil: 'distill',
  instil: 'instill',

  // -ogue
  catalogue: 'catalog',
  analogue: 'analog',

  // the rest
  judgement: 'judgment',
  acknowledgement: 'acknowledgment',
  programme: 'program',
  artefact: 'artifact',
  grey: 'gray',
  // Compounds, which the inflection stripping above cannot reach: "greyscale" does not
  // reduce to "grey". Found by grepping for the stems after the first sweep reported clean,
  // which is the check worth repeating whenever a word is added to this list.
  greyscale: 'grayscale',
  centrepiece: 'centerpiece',
  centimetre: 'centimeter',
  millimetre: 'millimeter',
  colourway: 'colorway',
  labourer: 'laborer',
  whilst: 'while',
  amongst: 'among',
  learnt: 'learned',
  spelt: 'spelled',
  burnt: 'burned',
  aluminium: 'aluminum',
  storey: 'story',
  tyre: 'tire',
  kerb: 'curb',
  cheque: 'check',
  plough: 'plow',
  draught: 'draft',
  moustache: 'mustache',
  sceptic: 'skeptic',
  sceptical: 'skeptical',
  scepticism: 'skepticism',
  mould: 'mold',
  smoulder: 'smolder',
  cosy: 'cozy',
  aeroplane: 'airplane',
  ageing: 'aging',
  enquire: 'inquire',
  enquiry: 'inquiry',
  speciality: 'specialty',
  orientated: 'oriented',
  dependant: 'dependent',
};

/**
 * Words ending in -ise/-ised/-ising/-isation that are correct American English.
 *
 * The suffix net below would otherwise flag every one of these. The list is the price of
 * catching the words nobody remembered to add, and it is finite, whereas the set of
 * British -ise verbs is open-ended.
 */
const ISE_ALLOWLIST = new Set([
  'advertise', 'advise', 'anise', 'apprise', 'arise', 'bruise', 'chastise', 'circumcise',
  'comprise', 'compromise', 'concise', 'cruise', 'demise', 'despise', 'devise', 'disguise',
  'enterprise', 'excise', 'exercise', 'expertise', 'franchise', 'guise', 'improvise', 'incise',
  'merchandise', 'noise', 'paradise', 'poise', 'porpoise', 'praise', 'precise', 'premise',
  'promise', 'raise', 'reprise', 'revise', 'rise', 'supervise', 'surmise', 'surprise',
  'televise', 'tortoise', 'treatise', 'turquoise', 'valise', 'wise',
]);

/**
 * The allowlist entries with any trailing -e removed, for matching prefixed compounds.
 *
 * "overpromise" is not an allowlist entry and never will be, but its stem ends with
 * "promis", which is. Comparing stems is what lets one entry cover a family.
 */
const ISE_STEMS = new Set([...ISE_ALLOWLIST].map((w) => w.replace(/e$/, '')));

/**
 * Inflections stripped before a dictionary lookup.
 *
 * Order matters, and it is NOT simply longest-first. Most British entries here already end
 * in -e, so their plural is the entry plus "s": "centres" is "centre" + "s". Trying "es"
 * first splits it as "centr" + "es" and suggests "centeres". So "s" is tried before "es".
 */
const INFLECTIONS = ['ations', 'ational', 'ation', 'ing', 'ies', 's', 'es', 'ed', 'ly', 'd'];

/**
 * Inflections after which a silent -e may be restored before the lookup: "centred" -> "centre".
 *
 * Deliberately excludes the -ation family. Restoring the -e there turns "calibration" into
 * "calibre" and reports correct American English as British, which is exactly the kind of
 * false positive that gets a spelling guard switched off.
 */
const E_RESTORING = new Set(['d', 's', 'es', 'ed', 'ing', 'ly']);

/**
 * Put back the inflection that was stripped to find the dictionary entry.
 *
 * Without this the lookup is correct and the suggestion is wrong: "colours" finds the entry
 * for "colour" and would be reported as "color", so a sweep acting on the suggestion turns
 * a heading reading "Colours" into "Color". The plural has to survive the round trip.
 */
function inflect(american, suffix) {
  if (!suffix) return american;
  if (suffix === 'ies') return american.replace(/y$/, 'ies');
  // A vowel-initial suffix absorbs a silent -e: "analyze" + "ed" is "analyzed".
  const stem = /^[aeiou]/.test(suffix) ? american.replace(/e$/, '') : american;
  return stem + suffix;
}

/**
 * The dictionary entry for a word, or null.
 *
 * `BRITISH_TO_AMERICAN` is a plain object literal, so a bare `MAP[word]` also finds everything on
 * `Object.prototype`. Prose containing the word "constructor" was reported as a British spelling
 * whose American form is `function Object() { [native code] }`, and "toString", "valueOf" and
 * "hasOwnProperty" behave the same way. The check runs over prose ABOUT code, where those words
 * are ordinary, and it exits 1 -- so an inherited key is a false failure on a gate, not a
 * curiosity. Every lookup goes through here so the guard cannot be forgotten at one call site.
 */
function entry(key) {
  return Object.prototype.hasOwnProperty.call(BRITISH_TO_AMERICAN, key)
    ? BRITISH_TO_AMERICAN[key]
    : null;
}

/** The dictionary entry for a token, trying the token itself then common inflections. */
function lookup(token) {
  const w = token.toLowerCase();
  if (entry(w)) return entry(w);
  for (const suffix of INFLECTIONS) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length);
      if (entry(base)) return inflect(entry(base), suffix);
      // "enquiries" -> entry "enquiry" -> "inquiry" -> "inquiries".
      if (suffix === 'ies' && entry(`${base}y`)) {
        return inflect(entry(`${base}y`), 'ies');
      }
      if (E_RESTORING.has(suffix) && entry(`${base}e`)) {
        // The British base ends in -e and the token dropped it before the suffix
        // ("organise" -> "organising"), so the American form drops its -e the same way.
        return entry(`${base}e`).replace(/e$/, '') + suffix;
      }
    }
  }
  return null;
}

/**
 * Split a run of letters into words, breaking camelCase and PascalCase.
 *
 * Without this, "ColaberryEnterprise" in a GitHub URL is one token, the allowlist entry
 * "enterprise" never matches it, and the -ise net reports the repository's own name as a
 * British spelling. Identifiers and URLs are full of compounds like this.
 */
function words(text) {
  const out = [];
  for (const run of String(text || '').match(/[A-Za-z]+/g) || []) {
    out.push(...run.split(/(?<=[a-z])(?=[A-Z])/));
  }
  return out;
}

/**
 * The -ise/-isation net, for words the dictionary above does not list.
 *
 * Returns the American form, or null when the word is allowlisted or does not match. The
 * length floors keep it off short words, where "rise" and "wise" and their compounds live.
 */
function iseNet(token) {
  const w = token.toLowerCase();
  const stem = w.replace(/(ed|ing|ation|ations|ational|s)$/, '');
  if (ISE_ALLOWLIST.has(w) || ISE_ALLOWLIST.has(stem) || ISE_ALLOWLIST.has(`${stem}e`)) {
    return null;
  }
  // "otherwise", "likewise", "clockwise", "pairwise": an open-ended compound family that no
  // allowlist of whole words can keep up with, so it is excluded by shape instead.
  if (/wise$/.test(w)) return null;
  // A prefixed allowlisted word: "overpromise", "underpromise". Matching on the stem rather
  // than the whole word means the prefix list does not have to be enumerated. The length
  // floor keeps short stems like "ris" (from "rise") from allowing "authorise".
  const bare = stem.replace(/e$/, '');
  if ([...ISE_STEMS].some((s) => s.length >= 6 && bare.endsWith(s))) return null;
  // The -ise suffix is preceded by a consonant in British verbs ("organ-ise", "priorit-ise").
  // A vowel before it means the "is" belongs to the stem instead, as in "fundraising" and
  // "raised", which are correct American English and must not be rewritten to "-iz".
  if (/[^aeiou]isation(s|al)?$/.test(w) && w.length > 9) return w.replace(/isation/, 'ization');
  if (/[^aeiou]is(e|ed|es|ing)$/.test(w) && w.length > 6) {
    return w.replace(/is(e|ed|es|ing)$/, 'iz$1');
  }
  return null;
}

/**
 * Returns the offending word, or null. Returning the word rather than a boolean means the
 * error message can name it, which is the difference between a guard somebody fixes and a
 * guard somebody disables.
 */
function findBritishSpelling(text) {
  for (const token of words(text)) {
    if (lookup(token) || iseNet(token)) return token;
  }
  return null;
}

/** Every offending word in the text, for a sweep that wants the whole list at once. */
function findAllBritishSpellings(text) {
  const hits = [];
  for (const token of words(text)) {
    const american = lookup(token) || iseNet(token);
    if (american) hits.push({ word: token, american });
  }
  return hits;
}

/** The American form for an offending word, for an error message that says what to use. */
function americanForm(word) {
  return lookup(String(word || '')) || iseNet(String(word || '')) || null;
}

module.exports = {
  BRITISH_TO_AMERICAN,
  ISE_ALLOWLIST,
  findBritishSpelling,
  findAllBritishSpellings,
  americanForm,
};
