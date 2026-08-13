import { getReeseEnrollmentId } from './reeseIdentitySeed';

// Reese Phase 2 (Autonomous Outreach) — the `initiate_dm` capability. This is
// the ONLY new send plumbing Phase 2 adds: everything below it is Phase 1's
// own openDm()/sendDmMessage() (dmService.ts), reused verbatim. No new message
// model, no new room model, no parallel send path.
//
// Calling sendDmMessage() with Reese as the ctx.enrollmentId re-triggers
// dmService.ts's maybeTriggerReeseReply() hook internally — that hook's loop
// guard (`if (senderEnrollmentId === reeseEnrollmentId) return;`,
// reeseReplyService.ts) already makes this a safe no-op for Reese's own
// messages, so initiating a DM here can never recursively trigger a reply to
// itself. This function does not need its own loop guard; it inherits Phase
// 1's.

export class ReeseOutreachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReeseOutreachError';
  }
}

export interface InitiateDmResult {
  roomId: string;
  messageId: string;
}

/**
 * Opens (or reuses) the DM room between Reese and a student and posts the
 * first (or a follow-up) message, as Reese. Never throws for "room already
 * exists" — openDm() is itself idempotent (find-or-create). Throws
 * ReeseOutreachError only if Reese's identity isn't seeded yet (should not
 * happen post-boot; callers should let this propagate, not swallow it — an
 * autonomous send that silently no-ops on a real error is worse than a loud
 * failure here).
 */
export async function initiateDm(studentEnrollmentId: string, content: string): Promise<InitiateDmResult> {
  const reeseEnrollmentId = await getReeseEnrollmentId();
  if (!reeseEnrollmentId) {
    throw new ReeseOutreachError(
      '[Reese] initiateDm() called before Reese\'s enrollment identity was seeded.',
    );
  }

  const { openDm, sendDmMessage } = await import('../communityRooms/dmService');
  const { roomId } = await openDm(reeseEnrollmentId, studentEnrollmentId, null);
  const message = await sendDmMessage(
    { enrollmentId: reeseEnrollmentId, cohortId: null, isAdmin: false },
    roomId,
    content,
  );

  return { roomId, messageId: message.id };
}
