import type { Request } from 'express';

/**
 * Is this participant staff — the producer test, in one place.
 *
 * WHY IT LIVES HERE. `req.participant` is a global augmentation declared in `participantAuth.ts`
 * and `isStaff` is resolved onto it by `communityRoomsStaffContext`, so the predicate over it
 * belongs beside them rather than inside whichever controller needed it first.
 *
 * It was first written inside `broadcastController.ts`, which is where every producer-facing
 * route in this subsystem used it from. It moved when a second controller needed it: importing
 * it from there would have pulled that file's whole module graph — the models barrel, the
 * entitlement loaders, the provider client — behind a one-line boolean, which is the cost that
 * turned two other suites in this area from seconds into minutes. Re-declaring the one-liner in
 * the second controller was the other option, and a duplicated authorization test is the one
 * duplication this subsystem cannot afford to let drift.
 *
 * THE CAST IS DELIBERATE AND NARROW. `ParticipantPayload.isStaff` is attached by middleware
 * rather than carried in the JWT, so it is absent on the declared type for a request that has
 * not been through `attachCommunityStaffContext`. `Boolean` over `undefined` is the right
 * answer there: a route that forgot the middleware fails CLOSED and nobody is called a
 * producer by accident.
 */
export function isStaff(req: Request): boolean {
  return Boolean((req.participant as { isStaff?: boolean } | undefined)?.isStaff);
}
