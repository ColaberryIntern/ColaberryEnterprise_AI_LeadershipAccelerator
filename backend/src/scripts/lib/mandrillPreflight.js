// Preflight checks for outbound Mandrill emails sent on Ali's behalf.
// Hard-fails on documented style violations so they never ship.
//
// Use:
//   const { validateBeforeSend } = require('./lib/mandrillPreflight');
//   validateBeforeSend(htmlBody, textBody);  // throws on violation
//
// Documented in memory/feedback_email_style.md.

const INFORMAL_SIGNOFFS = [
  /\bbest,\s*\n+\s*ali\b/i,
  /\bthanks,?\s*\n+\s*ali\b/i,
  /\bcheers,?\s*\n+\s*ali\b/i,
  /\bregards,?\s*\n+\s*ali\b/i,
  /\bsincerely,?\s*\n+\s*ali\b/i,
  /<p[^>]*>\s*best,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*thanks,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*cheers,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*regards,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*sincerely,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
];

const SIGNATURE_BLOCK_MARKERS = [
  /Managing Director.{0,80}AI Systems Architect/i,
  /Colaberry Inc\.?\s*<\/?br/i,
  /200 Chisholm Place/i,
  /enterprise\.colaberry\.ai/i,
];

function hasBrandedSignature(body) {
  return SIGNATURE_BLOCK_MARKERS.some(rx => rx.test(body));
}

function findInformalSignoff(body) {
  for (const rx of INFORMAL_SIGNOFFS) {
    if (rx.test(body)) return rx.toString();
  }
  return null;
}

/**
 * Lines that appear exactly ONCE per signature block and essentially never in ordinary
 * body copy. These are what get counted.
 *
 * Deliberately NOT the whole SIGNATURE_BLOCK_MARKERS list: `enterprise.colaberry.ai`
 * is in that list and legitimately appears several times in a single email (body links,
 * the signature's own call-to-action button), so counting it would over-report. These
 * two are structural parts of the block itself.
 */
const SIGNATURE_ANCHORS = [
  /Managing Director.{0,80}AI Systems Architect/gi,
  /200 Chisholm Place/gi,
];

/**
 * How many branded signature blocks the body contains.
 *
 * Counts the block's own anchor lines rather than the name. Anchoring on the name does
 * not work: in a short plain-text email a mention sits only a line or two above the
 * signature, so any proximity window wide enough to span the HTML signature's markup
 * also swallows the mention above it and reports two signatures where there is one.
 * That was the first attempt at this fix and its own tests caught it.
 *
 * The anchors appear once per block, so the count is the number of blocks. A repeated
 * name with no anchor is a mention, not a signature, and is correctly ignored.
 *
 * @param {string} body html or text body
 * @returns {number} number of signature blocks detected
 */
function countSignatureBlocks(body) {
  const source = String(body || '');
  let blocks = 0;
  for (const rx of SIGNATURE_ANCHORS) {
    // Fresh regex per call: a shared /g regex carries lastIndex between calls and would
    // silently miscount on the second body it is handed.
    const counter = new RegExp(rx.source, rx.flags);
    const matches = source.match(counter);
    blocks = Math.max(blocks, matches ? matches.length : 0);
  }
  return blocks;
}

/**
 * Dashes that are not the literal character but render as one in a mail client.
 *
 * The literal check below tests only U+2014. An HTML body is free to spell the
 * same glyph as an entity, and every one of these renders as an em- or en-dash
 * in the recipient's inbox, so a body containing them violates the style rule
 * just as loudly while passing a literal-character test in silence.
 *
 * Why this list and not a decode-then-check: decoding would need an entity
 * table for every name in HTML5 and would also rewrite the body, which this
 * module must never do - it is a validator, not a transformer. Matching the
 * handful of forms that actually mean "dash" is exact and has no false
 * positives on ordinary text (see the `&m`/`&n` negative controls in the tests).
 *
 * Hex is matched case-insensitively on BOTH the `x` and the digits because
 * `&#X2014;` and `&#x2014;` are the same character to a browser.
 */
const ENCODED_DASHES = [
  { label: 'named em-dash entity (&mdash;)', rx: /&mdash;/ },
  { label: 'named en-dash entity (&ndash;)', rx: /&ndash;/ },
  // NUMERIC references tolerate LEADING ZEROS and a MISSING SEMICOLON, and both still reach the
  // reader. HTML5 permits `&#08212;`, and a missing semicolon is a parse error that flushes the
  // code point anyway. An adversarial grader walked `&#08212;`, `&#008212;`, `&#x02014;` and
  // `&#8212` straight past the strict six-form table, so the digits are the anchor and the
  // semicolon is not.
  //
  // The NAMED forms above deliberately keep the required semicolon: `mdash` is NOT in HTML's
  // legacy no-semicolon table, so `&mdash` alone does not decode and flagging it would be a
  // false positive.
  //
  // The trailing lookahead is why this is not simply `;?`. Without it, `&#8212` matches inside
  // `&#82125;` (U+140ED), which is a different character entirely — the guard refuses to read a
  // longer code point as a shorter one.
  { label: 'decimal em-dash entity (&#8212;)', rx: /&#0*8212(?![0-9])/ },
  { label: 'decimal en-dash entity (&#8211;)', rx: /&#0*8211(?![0-9])/ },
  { label: 'hex em-dash entity (&#x2014;)', rx: /&#[xX]0*2014(?![0-9a-fA-F])/ },
  { label: 'hex en-dash entity (&#x2013;)', rx: /&#[xX]0*2013(?![0-9a-fA-F])/ },
];

/**
 * Which encoded-dash forms a body contains, by label.
 *
 * Returns labels rather than a boolean so the violation message can name the
 * form that was found. "Em-dash found" sends the author hunting for a character
 * that is not in their source; "named em-dash entity (&mdash;)" is greppable.
 *
 * @param {string} body html or text body
 * @returns {string[]} labels of the forms present, in ENCODED_DASHES order
 */
function findEncodedDashes(body) {
  const source = String(body || '');
  return ENCODED_DASHES.filter(d => d.rx.test(source)).map(d => d.label);
}

function validateBeforeSend(html, text) {
  const violations = [];

  // 1. Em-dashes anywhere
  if (/—/.test(html) || /—/.test(text || '')) {
    violations.push('Em-dash (—) found. Use a slash, comma, hyphen with spaces, or "and"/"but" instead.');
  }

  // 1b. The same dash spelled as an HTML entity.
  //
  // The literal check above was the whole rule for a long time, and it is blind
  // to every encoded form. That blindness was not hypothetical: the canonical
  // signature in config/emailSignature.ts rendered "Managing Director &mdash;
  // AI Systems Architect" against a house rule that says slash, and three
  // scheduled reports that dutifully call this function shipped an entity dash
  // in their headline every day while the gate reported them clean.
  //
  // Reported separately from the literal violation, and naming the form, so the
  // author can grep for what was actually in their source.
  const htmlEncoded = findEncodedDashes(html);
  const textEncoded = findEncodedDashes(text || '');
  if (htmlEncoded.length > 0) {
    violations.push(`Em-dash as HTML entity found in HTML body: ${htmlEncoded.join(', ')}. These render as a dash in the recipient's inbox. Use a slash, comma, hyphen with spaces, or "and"/"but" instead.`);
  }
  if (textEncoded.length > 0) {
    violations.push(`Em-dash as HTML entity found in TEXT body: ${textEncoded.join(', ')}. Use a slash, comma, hyphen with spaces, or "and"/"but" instead.`);
  }

  // 2. Double signature - informal signoff WHILE branded signature is present
  const htmlHasBrand = hasBrandedSignature(html);
  const textHasBrand = hasBrandedSignature(text || '');
  const htmlInformal = findInformalSignoff(html);
  const textInformal = findInformalSignoff(text || '');

  if (htmlHasBrand && htmlInformal) {
    violations.push(`HTML body has both branded signature AND informal signoff (${htmlInformal}). Pick ONE: branded signature OR "Ali" closer, never both.`);
  }
  if (textHasBrand && textInformal) {
    violations.push(`TEXT body has both branded signature AND informal signoff (${textInformal}). Pick ONE.`);
  }

  // 3. Duplicate SIGNATURE - not merely a repeated name.
  //
  // This rule used to count every occurrence of "Ali Muwwakkil" in the body and fail
  // above one. That conflated two different things: a signature pasted twice (a real
  // defect) and an email that legitimately mentions Ali more than once (not a defect
  // at all). Any digest that quotes his Basecamp tasks, escalates a thread he is named
  // in, or summarises his own assignments hits the second case every single time.
  //
  // It was not theoretical. Three scheduled jobs were blocked by this false positive
  // and nobody was told, because each failed inside its own cron log:
  //   - Task Prompt Worker      dead since 2026-07-08 ("Ali Muwwakkil" 4 and 6 times)
  //   - David ad escalation     276 failures to 2026-06-14 (2 times)
  //   - Family Command Center   3 failures to 2026-08-03 (3 and 5 times)
  //
  // A signature is the name sitting next to the signature block's own markers, so
  // that is what gets counted. Two of those means the signature really is duplicated.
  // A name appearing in quoted content carries no marker and is correctly ignored.
  const htmlSignatures = countSignatureBlocks(html);
  const textSignatures = countSignatureBlocks(text || '');
  if (htmlSignatures > 1) {
    violations.push(`HTML has ${htmlSignatures} branded signature blocks - duplicate signature.`);
  }
  if (textSignatures > 1) {
    violations.push(`TEXT has ${textSignatures} branded signature blocks - duplicate signature.`);
  }

  if (violations.length > 0) {
    const message = 'Mandrill preflight failed:\n  - ' + violations.join('\n  - ');
    throw new Error(message);
  }
}

module.exports = {
  validateBeforeSend,
  hasBrandedSignature,
  findInformalSignoff,
  countSignatureBlocks,
  findEncodedDashes,
};
