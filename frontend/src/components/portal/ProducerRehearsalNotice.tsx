import React from 'react';

/**
 * What a rehearsal does and does not reach (D7).
 *
 * ## The draft ticket asked for a banner that would have been half false
 *
 * D7 in DOC 18 says: "An amber banner states nothing reaches viewers or the recording." The
 * first half is true and provable. The second half was not, and checking it is what found a
 * defect worth more than the banner:
 *
 *   - VIEWERS: provable. `broadcastActiveQuery` excludes `backstage` from discovery because it
 *     "is a PRODUCER state", and DOC 19's matrix holds that a non-staff viewer cannot tell
 *     `backstage` from `scheduled` at all. Nothing reaches the room.
 *   - THE RECORDING: false. The live input is created with `recording: { mode: 'automatic' }`
 *     (cloudflareStreamProvider.ts:310), so Cloudflare records whatever is pushed to it
 *     whatever our editorial state says. A rehearsal with OBS running IS recorded.
 *
 * Worse, the health loop observes `backstage` on purpose and used to bind the first video uid
 * it saw - so the rehearsal became the occurrence's `provider_instance_uuid`, the real class
 * was refused as a conflict, and the published replay was the rehearsal. That is fixed in
 * `broadcastRecordingBinding.ts`, which now binds only on air.
 *
 * So the banner says the two things that are now true and the one thing that is still a
 * hazard. A banner promising "this is not recorded" would have been the most expensive kind of
 * wrong: staff speak freely on the strength of it, and the bytes exist either way.
 *
 * Its own component rather than more JSX in the strip because `ProducerStrip.tsx` was at 477
 * lines against CLAUDE.md's 500-line ceiling, and because copy that carries a privacy
 * assurance deserves to be testable without rendering a polling component.
 */
export default function ProducerRehearsalNotice(): React.ReactElement {
  return (
    <p className="cps-rehearsal" role="status" data-testid="producer-rehearsal">
      <b>Rehearsal.</b> Nothing you do here reaches viewers, and this rehearsal will not become
      the class replay. The feed itself is still recorded by the provider from the moment you
      start pushing, so treat the room as recorded.
    </p>
  );
}
