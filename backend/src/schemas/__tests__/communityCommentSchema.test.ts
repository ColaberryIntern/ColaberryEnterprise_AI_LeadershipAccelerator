import { CreateCommentSchema } from '../communitySchemas';

/**
 * 2026-10-26 (Ali: "i can't comment here - getting an error on the new community board"): the reply route now answers with the
 * schema's own reason instead of "Invalid comment", so the first issue's message must be the human sentence the reply box can show.
 */
it('a one-word reply is refused with the reason the reply box shows', () => {
  const r = CreateCommentSchema.safeParse({ body: 'Testing' });
  expect(r.success).toBe(false);
  expect(!r.success && r.error.issues[0]?.message).toMatch(/^Replies need at least 5 words/);
});

it('an empty reply says so', () => {
  const r = CreateCommentSchema.safeParse({ body: '' });
  expect(!r.success && r.error.issues[0]?.message).toBe('Comment body cannot be empty');
});

it('five real words pass', () => {
  expect(CreateCommentSchema.safeParse({ body: 'I tried a retry with backoff' }).success).toBe(true);
});
