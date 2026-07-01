/**
 * Outward-facing classifier — the deterministic gate that decides whether ATA
 * may act on a task autonomously (internal work) or must DRAFT it and queue it
 * for Ali's approval (anything that leaves the building).
 *
 * Per Ali's locked decision: ATA does internal work autonomously but anything
 * outward-facing — client emails, commitments, money, personnel — is drafted
 * and queued. This classifier is the same shape as the HUMAN_ONLY_RES gate
 * already proven in runCbAiTasksGeneric.js, extended with explicit outbound-
 * communication patterns.
 *
 * Bias: when in doubt, classify OUTWARD. A false "outward" only means a human
 * looks at a draft that could have been auto-posted (cheap). A false "internal"
 * could mean an autonomous action that should have had a human in the loop
 * (expensive). Fail toward the human.
 *
 * Pure + null-safe so it can be unit-tested without a DB/API.
 */

// Tasks whose verbs are inherently a human act or carry external/commitment/
// money/personnel blast radius. Matching any one routes the task to approval.
const OUTWARD_RES = [
  /\b(meeting|sync|call|demo|attend|join|schedule (?:a|the) call)\b/i,
  /\b(approval|approve|sign[- ]?off|signoff|authorize|notarize|\bsign\b)\b/i,
  /\b(negotiate|interview|hire|fire|onboard|offer letter|terminate)\b/i,
  /\b(pay|payment|invoice|wire|refund|contract|legal|nda|sow|proposal|quote|pricing)\b/i,
  /\b(present to|review with|pitch|send to (?:the )?(?:client|customer|prospect|partner|vendor))\b/i,
  // Outbound communication to a third party (drafted, never sent by ATA).
  /\b(email|message|reply to|respond to|reach out to|follow up with|dm)\b[^.]*\b(client|customer|prospect|partner|vendor|lead|investor|press|media)\b/i,
  /\b(post|publish|tweet|announce)\b[^.]*\b(linkedin|twitter|reddit|social|blog|public)\b/i,
];

/**
 * Classify a task by its title + description text.
 * @param {string} text combined title + plaintext description
 * @returns {'outward'|'internal'}
 */
function classifyTask(text) {
  const t = (text || '').toLowerCase();
  return OUTWARD_RES.some((re) => re.test(t)) ? 'outward' : 'internal';
}

function isOutwardFacing(text) {
  return classifyTask(text) === 'outward';
}

module.exports = { OUTWARD_RES, classifyTask, isOutwardFacing };
