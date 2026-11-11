import React, { useCallback, useState } from 'react';
import { markClipNow, type ClipMarkResult } from '../../services/broadcastProducer';
import { formatMarkTimecode, markOutcomeCopy } from './producerStripCopy';

/**
 * D10 — "mark this moment", for the producer watching the class.
 *
 * ## Why it is a separate component
 *
 * Two reasons, and the second is the real one. `ProducerStrip.tsx` sits at 482 lines against
 * CLAUDE.md's 500-line hard ceiling, so a button with its own request, its own busy state and
 * its own four outcomes does not belong inside it. And a control whose entire job is to tell
 * somebody whether a thing happened deserves to be testable without rendering a component that
 * polls three endpoints.
 *
 * `sendMark` is injectable for the reason this directory already states about the rundown: a
 * child that fetches for itself turns every unit test of the parent into one that makes a real
 * request, and there is no global axios mock in this app.
 *
 * ## It says what happened, every time
 *
 * A press is a person pressing a button and then looking at the screen. The four outcomes are
 * deliberately not collapsed into worked/did-not:
 *
 *   - `marked` names the timecode, so a producer can see it landed where they expected;
 *   - `duplicate` is a correct press that did nothing, because the second was already marked.
 *     Reporting it as success would tell somebody who pressed twice that they have two clips;
 *   - `refused` is the world not being ready, said as a sentence rather than a reason code;
 *   - `failed` is the one that must never be silent. A producer who believes a moment was
 *     captured stops paying attention to it.
 */

export interface ClipMarkButtonProps {
  sessionId: string;
  /**
   * Whether the server could accept a mark right now: on air, with content started.
   *
   * The button is DISABLED rather than hidden when it is false, and it says why. A control that
   * vanishes between one poll and the next is indistinguishable from one that was never there,
   * which is the lesson the strip's own `everAuthorized` comment records.
   */
  ready: boolean;
  /** Why it is not ready, in the producer's words. Shown on the disabled button. */
  notReadyReason?: string;
  /** Injected in tests. Production posts to the real route. */
  sendMark?: (sessionId: string) => Promise<ClipMarkResult>;
}

export default function ClipMarkButton(
  { sessionId, ready, notReadyReason, sendMark }: ClipMarkButtonProps,
): React.ReactElement {
  const send = sendMark ?? markClipNow;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const press = useCallback(async (): Promise<void> => {
    setBusy(true);
    setSaid(null);
    try {
      const r = await send(sessionId);
      setSaid(markOutcomeCopy(r));
    } catch {
      // The client already turns a rejected request into { outcome: 'failed' }, so reaching here
      // means something unforeseen. It still has to say so rather than leave the producer with
      // a button that did nothing visible.
      setSaid(markOutcomeCopy({ outcome: 'failed' }));
    } finally {
      setBusy(false);
    }
  }, [send, sessionId]);

  return (
    <span className="cps-mark">
      <button
        type="button"
        className="cps-btn"
        disabled={!ready || busy}
        onClick={() => { void press(); }}
        data-testid="clip-mark"
        title={ready ? 'Stamp this moment for the editor' : notReadyReason}
      >
        {busy ? 'Marking...' : 'Mark this moment'}
      </button>
      {/*
        * A live region, unlike the readings in the header. Those change on their own and would
        * be read aloud over the class; this only ever changes because the producer just pressed
        * the button, which is exactly when they want to hear the answer.
        */}
      {said && (
        <span className="cps-mark-said" role="status" data-testid="clip-mark-said">{said}</span>
      )}
      {!ready && notReadyReason && !said && (
        <span className="cps-mark-said" data-testid="clip-mark-blocked">{notReadyReason}</span>
      )}
    </span>
  );
}

export { formatMarkTimecode };
