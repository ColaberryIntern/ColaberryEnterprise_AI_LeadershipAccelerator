import * as fs from 'fs';
import * as path from 'path';

/**
 * The lead auto-reply prompt must not hardcode a fact that goes stale.
 *
 * WHAT HAPPENED. The prompt told the model to "mention the upcoming April 14
 * cohort" whenever a lead asked about pricing. It shipped in spring and was
 * still saying it in September — five months after that cohort started. Every
 * CRM lead who asked about pricing was pointed at a date that had passed, and
 * nothing about the reply looked wrong, so nobody noticed.
 *
 * This is a SOURCE-LEVEL test on purpose. The property is "this text contains
 * no hardcoded date", which is a property of the file, and importing the
 * controller pulls in nodemailer, the database and half the service graph.
 *
 * It guards the lead path specifically. Explorer sends have three enforcement
 * points for this rule (the copy lint, the prompt constraint, and the send-time
 * fact guard); this path has none of them, because it bypasses
 * messageValidatorService entirely.
 */

const source = fs.readFileSync(
  path.join(__dirname, '..', 'mandrillWebhookController.ts'),
  'utf8',
);

/** The prompt array, not the whole file — comments here legitimately discuss dates. */
function autoReplyInstructions(): string {
  const start = source.indexOf('ai_instructions: [');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('].join(', start);
  expect(end).toBeGreaterThan(start);

  const block = source.slice(start, end);
  // Strip comments: the explanation above the instruction names the old date on
  // purpose, and flagging our own record of the bug would make this unfixable.
  return block.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('the lead auto-reply prompt states no perishable fact', () => {
  const instructions = autoReplyInstructions();

  it('names no month-and-day', () => {
    expect(instructions).not.toMatch(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i,
    );
  });

  it('names no numeric or ISO date', () => {
    expect(instructions).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
  });

  it('names no price', () => {
    expect(instructions).not.toMatch(/\$\s?\d|\b\d[\d,]*\s?(?:dollars|usd)\b/i);
  });

  it('names no seat count', () => {
    expect(instructions).not.toMatch(/\b\d+\s+(?:seats?|spots?|places?)\b/i);
  });

  it('still tells the model what to do about pricing questions', () => {
    // Removing the stale date must not remove the behaviour. A prompt that says
    // nothing about pricing produces a reply that ignores the question asked.
    expect(instructions).toMatch(/pricing/i);
    expect(instructions).toMatch(/strategy call/i);
  });

  it('explicitly forbids the model inventing one', () => {
    // Silence is not enough: a fluent generator asked about pricing will supply
    // a plausible date unless told not to.
    expect(instructions).toMatch(/do not state/i);
  });
});
