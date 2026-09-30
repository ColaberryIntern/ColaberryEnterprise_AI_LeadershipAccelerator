/**
 * The wizard's own payload must survive its own route schema.
 *
 * Taiwo Oludimimu, 2026-08-17: "We could not reach the requirements service".
 * The service was reached. It returned 400 `Invalid input`, because the browser
 * copies ONE interview answer verbatim into `users` / `data_sources` /
 * `done_definition` (frontend deriveLegacyScope) and those fields were capped
 * at 2,000 while the answer they are copied FROM is capped at 4,000.
 *
 * So the effective ceiling on a single interview answer was 2,000 characters,
 * enforced on a field the student never filled in and cannot see, and reported
 * to them as a network outage. A student who wrote a thorough answer to a
 * question we asked them got a ten-task template and no STORY-000.
 *
 * These tests pin the contract from the CLIENT's side: whatever the wizard can
 * legally put in `answers[].answer`, the derived legacy fields must also accept.
 */
import { startSchema } from '../sbpRoutes';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** The payload ProjectsPage.handleCreate builds, with one long interview answer. */
function wizardPayload(answerLength: number) {
  const answer = 'We sell handmade occasion wear and take fittings by appointment. '
    .repeat(Math.ceil(answerLength / 64))
    .slice(0, answerLength);

  return {
    project_id: UUID,
    idea: 'A storefront and order system for my couture label, with fittings, fabric stock and client reminders.',
    name: 'Palette & Poise Couture',
    size: 'project' as const,
    // deriveLegacyScope copies the matching answer through UNCHANGED — this is
    // the same string as answers[0].answer below, not a summary of it.
    users: answer,
    answers: [
      { id: 'q1', question: 'Who will use this, and what do they do today?', answer },
    ],
    target_weeks: 6,
  };
}

describe('startSchema accepts what the wizard can produce', () => {
  it('accepts a derived legacy field as long as the answer it is copied from', () => {
    // 4,000 is the documented ceiling on answers[].answer, so it is also the
    // largest string deriveLegacyScope can ever put in `users`.
    const result = startSchema.safeParse(wizardPayload(4_000));

    expect(result.success).toBe(true);
  });

  it('does not reject a 2,001 character answer that answers[].answer allows', () => {
    const result = startSchema.safeParse(wizardPayload(2_001));
    const rejectedPaths = result.success
      ? []
      : result.error.issues.map((i) => i.path.join('.'));

    expect(rejectedPaths).toEqual([]);
  });

  it('still rejects a derived field beyond the answer ceiling it comes from', () => {
    // The cap is a real contract, not an absence of one. Past 4,000 nothing
    // legitimate produced it, so it is still refused.
    const result = startSchema.safeParse(wizardPayload(4_001));

    expect(result.success).toBe(false);
  });
});
