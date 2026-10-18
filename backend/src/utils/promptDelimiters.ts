/**
 * SAFE-002: stop an untrusted body from closing the delimiter that wraps it.
 *
 * ## THE DEFECT
 *
 * `delimited()` is duplicated verbatim in `services/sbp/decomposePrompt.ts` and
 * `services/factory/factoryDecomposePrompt.ts`, and both interpolate the body raw:
 *
 *     return `<${tag}>\n${body}\n</${tag}>`;
 *
 * A body containing its own `</TAG>` therefore closes the block early, and everything after it
 * sits OUTSIDE any delimiter — the position the SAFE-002 instruction explicitly does not cover.
 *
 * Every pre-existing delimiter assertion in this repo still passes against such a prompt,
 * because a forged close tag ADDS a closing delimiter rather than removing the real one, and
 * `toContain('</TAG>')` cannot tell one from two.
 *
 * ## WHY IT NEUTRALISES RATHER THAN REFUSES
 *
 * A student brief that happens to contain angle brackets is not an attack, and refusing it would
 * punish the ordinary case to defend against the rare one. Replacing the brackets with single
 * angle quotation marks keeps the text readable to the model, changes no meaning a human
 * intended, and cannot close a tag. Measured blast radius on the half that could be measured:
 * **0 of 48 stored briefs render differently**.
 *
 * ## WHY IT IS BEHIND A FLAG, DEFAULT OFF
 *
 * The finding that produced this carries a PRE-REGISTERED decision rule, written before its
 * measurement so that no result could be read as justifying whatever was already wanted:
 *
 *   - any stored brief contains a forged close tag  -> active risk, neutralise
 *   - zero                                          -> latent; propose the fix rather than
 *                                                      change a live student prompt path
 *
 * The measurement was ZERO on the brief half. So this ships inert: the code, the tests and the
 * flag exist, and nothing changes until the DRI turns it on. The factory half — whose bodies are
 * parsed OOXML and proposal text, where a `<` is ordinary rather than unlikely — was never
 * measurable, which is why the fix covers both modules at once rather than only the one with a
 * number against it.
 */

/**
 * Every tag `delimited()` is called with, in either module.
 *
 * A test derives this set from the call sites and fails if they diverge. That check exists
 * because the fix as originally written out covered FOUR of these five — `REQUIREMENTS` was
 * missing — and a hand-maintained list of tags is exactly the thing that silently stops covering
 * the one someone adds next.
 */
export const DELIMITER_TAGS = [
  'ORIGINAL_BRIEF',
  'EXPANDED_DOCUMENT',
  'SOURCE_BLOCKS',
  'REQUIREMENTS',
  'CONTEXT',
] as const;

/** `<` and `>` replaced by single angle quotation marks: readable, and inert as markup. */
const OPEN_SUBSTITUTE = '‹';
const CLOSE_SUBSTITUTE = '›';

const TAG_PATTERN = new RegExp(`<\\/?(${DELIMITER_TAGS.join('|')})>`, 'gi');

/**
 * Render any delimiter tag inside an untrusted body unable to open or close a block.
 *
 * Matches BOTH `<TAG>` and `</TAG>`, and every tag rather than only the one being wrapped: a
 * body nested in `<CONTEXT>` that carries `</SOURCE_BLOCKS>` is as much a forgery as one that
 * closes its own block, and the model reads the whole prompt rather than one section of it.
 */
export function neutraliseDelimiters(body: string): string {
  return body.replace(TAG_PATTERN, (match) => (
    match.replace('<', OPEN_SUBSTITUTE).replace('>', CLOSE_SUBSTITUTE)
  ));
}
