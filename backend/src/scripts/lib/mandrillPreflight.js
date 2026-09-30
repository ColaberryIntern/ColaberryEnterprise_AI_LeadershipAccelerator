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

function validateBeforeSend(html, text) {
  const violations = [];

  // 1. Em-dashes anywhere
  if (/—/.test(html) || /—/.test(text || '')) {
    violations.push('Em-dash (—) found. Use a slash, comma, hyphen with spaces, or "and"/"but" instead.');
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
};
