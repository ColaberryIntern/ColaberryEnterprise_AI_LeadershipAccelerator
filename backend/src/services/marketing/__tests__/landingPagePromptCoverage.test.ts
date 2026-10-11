import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The prompt must name every field the schema offers.
 *
 * WHY THIS EXISTS. On 2026-10-09 an audit found that `SECTION_GUIDE` listed a subset of the
 * schema - no `eyebrow`, no `headlineAccent`, no `tone`, no `variant`, no `kicker` - and ended
 * with "Omit any field not listed above". So the model was explicitly forbidden from using the
 * exact fields that make a page look designed, and every page it produced came out as grey and
 * white bands with every list drawn as identical cards. The renderer had supported all of it for
 * weeks. Raising the model changed nothing, because the model was never the constraint.
 *
 * THE ORDERING IS THE LESSON. The prompt is the schema's only consumer: a field added to the
 * schema and not added to the prompt does not exist in practice, and nothing fails. This test is
 * what makes that impossible - add a field to landingPageContentSchema.ts, and this goes red
 * until the prompt teaches the model when to use it.
 *
 * READ AS TEXT, deliberately. The alternative is to introspect the zod object, which would couple
 * this to zod's internals and - worse - would pass on a prompt that merely contained the word
 * somewhere. Reading both files as text asks the only question that matters: does the string the
 * model is sent mention this field at all.
 */

const SRC = join(__dirname, '..', '..', '..');

function read(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8');
}

/** Every optional/required key the section schemas declare, from the schema file itself. */
function schemaFields(): string[] {
  const schema = read(join('schemas', 'landingPageContentSchema.ts'));
  // Field declarations look like `  eyebrow,` or `  headline: text(160),` inside the section
  // objects. Collected by name, then filtered to the ones a model actually fills.
  const names = new Set<string>();
  for (const m of schema.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*)[,:]/gm)) names.add(m[1]);

  // Subtract EXACTLY the section variables, by reading the discriminatedUnion's own member
  // list. Two earlier attempts were wrong in opposite directions: matching by shape caught
  // `heroSection` (indented two, followed by a comma - identical to a field), and subtracting
  // every declared const then removed `eyebrow` and `tone`, which ARE fields and happen to be
  // shared helpers declared once at the top. The union list is the only unambiguous source of
  // what is a section rather than a field - and the positive control below is what caught the
  // second mistake.
  const union = /z\.discriminatedUnion\([^[]*\[([^\]]*)\]/s.exec(schema);
  for (const name of (union ? union[1] : '').split(',')) names.delete(name.trim());

  return [...names];
}

/**
 * Keys that are not the model's to fill, with the reason each is exempt. An exemption is a
 * decision; silence would be a hole.
 */
const NOT_THE_MODEL_S_TO_FILL = new Set([
  'image',   // rule: never emit one, there is no URL it could know
  'src',     // part of image
  'alt',     // part of image
  'type',    // the discriminator, named by every example line
  'sections', 'title', 'description', // document level, covered by the SYSTEM preamble
]);

describe('the prompt exposes the whole schema', () => {
  const prompt = read(join('services', 'marketing', 'landingPageDraftService.ts'));
  const fields = schemaFields();

  it('found the schema fields at all, so a silent zero cannot pass this suite', () => {
    // Positive control. If the regex stops matching, every assertion below passes vacuously.
    expect(fields.length).toBeGreaterThan(8);
    expect(fields).toEqual(expect.arrayContaining(['headline', 'eyebrow', 'tone', 'variant']));
  });

  it.each(
    // Filtered at module scope so the table is the real list, not an empty one.
    schemaFields().filter((f) => !NOT_THE_MODEL_S_TO_FILL.has(f)),
  )('names "%s" somewhere in the prompt', (field) => {
    expect(prompt).toContain(field);
  });

  it('teaches the fields that decide how the page LOOKS, not merely lists them', () => {
    // Listing `variant` in a type signature and never saying when to use "steps" is how every
    // list ended up as cards. Each of these needs guidance, not just a mention.
    ['eyebrow', 'headlineAccent', 'tone', 'variant', 'kicker'].forEach((field) => {
      const mentions = prompt.split(field).length - 1;
      expect(mentions).toBeGreaterThan(1);
    });
  });

  it('still forbids inventing an image', () => {
    // The rule that stopped a live page rendering a broken picture. Expanding the guide must not
    // have quietly re-opened it.
    expect(prompt).toContain('NEVER emit an image');
  });

  it('still refuses to invent a button destination', () => {
    // "/apply" shipped a live page whose only button 404'd. Supplying a real URL is the fix;
    // guessing one is not.
    expect(prompt).toContain('Never invent a path');
  });

  it('uses a supplied button destination when there is one', () => {
    expect(prompt).toContain('BUTTON DESTINATION');
  });
});
