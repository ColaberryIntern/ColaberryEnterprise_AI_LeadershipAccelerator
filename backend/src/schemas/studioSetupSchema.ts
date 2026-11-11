import { z } from 'zod';

/**
 * Request contract for Studio setup (D4).
 *
 * `.strict()`, like the rest of the broadcast surface: an unknown key is a 400, not a silently
 * ignored field. That matters here more than most places, because this body carries the one
 * decision in the product that cannot be undone. A typo'd `access_modee` that was quietly
 * dropped would look like a working request that configured nothing, and the operator would
 * find out at air time.
 *
 * The deploy consequence is the same as the broadcast schemas': a `.strict()` route rejects a
 * body from a NEWER frontend than the running backend, so this ships backend-first.
 *
 * Every field is optional because the screen saves incrementally as the operator works through
 * the cards. `create` is what turns a saved configuration into a broadcast.
 */
export const studioSetupBodySchema = z
  .object({
    /**
     * Nullable, not merely optional. Absent means "do not change this"; explicit null means
     * "clear it". Collapsing the two would leave no way to un-assign a producer.
     */
    presenter_enrollment_id: z.string().uuid().nullable().optional(),
    producer_enrollment_id: z.string().uuid().nullable().optional(),
    guest_access: z.boolean().nullable().optional(),
    /**
     * Accepted only while no occurrence exists. The service refuses a change rather than
     * performing one, per the write-once invariant; this schema's job is only to reject a value
     * that is not one of the four.
     */
    access_mode: z.enum(['free', 'paid', 'preview', 'private']).optional(),
    /**
     * Optimistic concurrency. Optional here rather than required, unlike the producer-command
     * schema, because most Studio setup saves happen BEFORE an occurrence exists and there is
     * no version to conflict on. The service enforces it whenever there is one.
     */
    expected_version: z.number().int().nonnegative().optional(),
    /** Create the broadcast. Absent means save the configuration only. */
    create: z.boolean().optional(),
  })
  .strict();

export type StudioSetupBody = z.infer<typeof studioSetupBodySchema>;
