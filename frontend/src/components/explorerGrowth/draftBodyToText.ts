/**
 * The generated body as readable text.
 *
 * NOT `dangerouslySetInnerHTML`. The body is model-written HTML, and this repo forbids
 * injecting un-sanitised markup without a stated reason — "it came from our own generator"
 * is not one, because the generator's input includes lead fields and lesson titles that
 * originate outside it.
 *
 * A reviewer is here to judge the WORDS, so tags are dropped rather than shown raw: block
 * boundaries become newlines, entities are decoded, and nothing is executed. `<br>` and the
 * closing of a block tag both become line breaks so paragraphs survive the trip.
 *
 * ## Why this is its own module
 *
 * It lived in `DecisionWhyModal.tsx`. The revision panel needs it too, and importing it
 * from the modal — which imports the panel — would be a cycle. Moved here rather than
 * copied, because two converters would eventually disagree about what a draft says, and
 * they would disagree on the version-diff screen, which exists precisely to show small
 * textual differences. The modal re-exports it so every existing importer is unaffected.
 */
export function draftBodyToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
