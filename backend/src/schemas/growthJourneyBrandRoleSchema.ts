import { z } from 'zod';

/**
 * The contract for the one write this build introduces: a brand's agent role.
 *
 * ─── WHY THE LENGTH LIMIT IS APPLIED AFTER STRIPPING, NOT BEFORE ────────────
 *
 * The bound is on what gets STORED, so the strip runs first and the limit is
 * checked on its output. Bounding first would reject a long paste that strips
 * down to four honest words, and - worse - would let a value that passed the
 * check shrink afterwards, so the number in the error message would not be the
 * number that governs the row.
 *
 * ─── WHAT THE STRIP REMOVES, AND WHY IT IS NOT ESCAPING ─────────────────────
 *
 * React escapes on render, so the display surface is already safe and this is
 * not what stops a script tag reaching a browser. It is storage hygiene: the
 * stored value is configuration that a future consumer (an export, a PDF, an
 * email subject) may not escape, and a role title has no legitimate use for
 * angle brackets or control characters. Stripping at the boundary means the
 * column never holds markup in the first place, rather than every reader
 * having to remember.
 *
 * Newlines go too. A role is a title and a sentence, not a document, and a
 * newline in a title is how a one-line admin table silently grows a second row.
 */

/** Tags, control characters and collapsed whitespace, in that order. */
export function stripRoleText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    // Angle brackets that survived the tag strip (an unclosed `<`), so nothing
    // stored can read as the start of markup to a consumer that reassembles it.
    .replace(/[<>]/g, ' ')
    // C0 and C7F controls, newlines and tabs included.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(max: number, label: string) {
  return z
    .string()
    .transform(stripRoleText)
    .pipe(
      z
        .string()
        .min(1, `${label} cannot be empty once markup is removed`)
        .max(max, `${label} must be ${max} characters or fewer`)
    );
}

export const ROLE_TITLE_MAX = 80;
export const ROLE_DESCRIPTION_MAX = 280;

export const brandRoleParamsSchema = z.object({
  brand_id: z.string().uuid(),
});

/**
 * `.strict()`: an unknown key is a 400, not ignored.
 *
 * It matters more here than on a read. `metadata` is a JSONB column shared with
 * `terminology`, so a body that smuggled extra keys through would be a way to
 * write arbitrary structure into a column the rest of the journey reads from.
 */
/**
 * `.brand()`: the service accepts ONLY a value this schema produced.
 *
 * Without it the inferred type is `{ title: string; description: string }`, which
 * TypeScript satisfies structurally - so a controller that forgot to `parse`
 * would compile, store unbounded markup, and no test would fail. The brand makes
 * skipping validation a type error at the call site rather than a defect
 * discovered in the row. A cast can still defeat it, but a cast is visible in
 * review, and "forgot to validate" is not.
 */
export const brandRoleBodySchema = z
  .object({
    title: cleanText(ROLE_TITLE_MAX, 'Title'),
    description: cleanText(ROLE_DESCRIPTION_MAX, 'Description'),
  })
  .strict()
  .brand<'BrandRoleBody'>();

export type BrandRoleParams = z.infer<typeof brandRoleParamsSchema>;
export type BrandRoleBody = z.infer<typeof brandRoleBodySchema>;
