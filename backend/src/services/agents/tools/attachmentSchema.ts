/**
 * The runtime contract for attachment references on a chat turn — the tool's
 * input schema, kept beside the tool so the two cannot drift.
 *
 * Every surface that lets a student attach something validates with THIS, so
 * the ceiling, the id format, and the name cap are one decision rather than
 * three that slowly diverge.
 */
import { z } from 'zod';
import { MAX_ATTACHMENTS_PER_TURN } from './readAttachmentsTool';

export const attachmentRefSchema = z.object({
  id: z.string().uuid(),
  // Display only — the real filename comes from the stored row, so a spoofed
  // name here changes nothing the model is told about the file.
  name: z.string().max(255).nullish(),
});

/**
 * Note the ceiling is MAX_ATTACHMENTS_PER_TURN + 4: the schema is deliberately
 * looser than the tool. The tool reports anything past the limit back to the
 * student as skipped ("only 4 can be read at once"), which is a better answer
 * than a 400 that tells them nothing. The slack is small enough that this is
 * still a bound, not an open door.
 */
export const attachmentsSchema = z
  .array(attachmentRefSchema)
  .max(MAX_ATTACHMENTS_PER_TURN + 4)
  .optional();
