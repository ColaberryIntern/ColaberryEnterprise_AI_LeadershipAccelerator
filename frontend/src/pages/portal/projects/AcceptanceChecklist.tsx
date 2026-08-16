import React from 'react';

/**
 * AcceptanceChecklist — "Done means", as a VIEW OF SERVER TRUTH.
 *
 * These boxes used to be localStorage and nothing else: the student ticked
 * them, the count went up, and not one bit of it was reported anywhere. That is
 * a checklist that looks like a claim about the work while asserting nothing.
 *
 * Now there are two states and they must never be confusable:
 *
 *   CONFIRMED — the platform read this criterion as passing out of the repo.
 *     Evidence. Read-only, because there is no such thing as un-confirming your
 *     own evidence and a control that appeared to offer it would be lying about
 *     who decides.
 *
 *   SELF-TICKED — the student ticked it here. A note to self, kept because it is
 *     genuinely useful working memory, and drawn QUIETER than an untouched row
 *     rather than louder. An intention must never read as an achievement.
 *
 * They are separated on three channels at once — colour, weight and a written
 * label — because colour alone dies in a screenshot, in greyscale, and for a
 * colour-blind reader, and this distinction is the one the whole feature rests
 * on.
 */
export interface AcceptanceChecklistProps {
  /** The criteria as the published PLAN has them, in plan order. */
  acceptance: string[];
  stepNo: number;
  /** Has the platform confirmed this criterion against the repo? */
  isConfirmed: (text: string) => boolean;
  /** Is this criterion mid-celebration right now? Drives the staggered tick. */
  isJustConfirmed: (text: string) => boolean;
  /** The student's local scratchpad ticks, keyed by index. */
  ticked: Record<string, boolean>;
  onToggle: (index: number) => void;
}

const AcceptanceChecklist: React.FC<AcceptanceChecklistProps> = ({
  acceptance, stepNo, isConfirmed, isJustConfirmed, ticked, onToggle,
}) => {
  if (acceptance.length === 0) return null;

  const confirmedCount = acceptance.reduce((n, a) => (isConfirmed(a) ? n + 1 : n), 0);
  const selfTickedCount = acceptance.reduce(
    (n, a, i) => (ticked[i] && !isConfirmed(a) ? n + 1 : n), 0,
  );

  return (
    <section className="rt-step">
      <div className="rt-step-h">
        <span className="rt-step-n">{stepNo}</span>
        <span className="rt-step-t">Done means</span>
        {/* The count is CONFIRMED work, not ticked boxes. It used to be the local
            ticks, which meant a student could read "4 of 4" off a page where the
            platform had confirmed nothing at all. */}
        <span className="rt-step-c">{confirmedCount} of {acceptance.length} confirmed</span>
      </div>
      <div className="rt-card">
        <ul className="rt-acc">
          {acceptance.map((a, i) => {
            const confirmed = isConfirmed(a);
            const selfTicked = !confirmed && !!ticked[i];
            const landing = isJustConfirmed(a);
            return (
              <li
                key={i}
                className={
                  `${confirmed ? 'rt-acc-ok' : ''}`
                  + `${selfTicked ? ' rt-acc-self' : ''}`
                  + `${landing ? ' rt-acc-land' : ''}`
                }
              >
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed || !!ticked[i]}
                    disabled={confirmed}
                    onChange={() => { if (!confirmed) onToggle(i); }}
                  />
                  <span>{a}</span>
                </label>
                {confirmed && <span className="rt-acc-tag ok">Confirmed from your repo</span>}
                {selfTicked && <span className="rt-acc-tag self">Your note — not confirmed yet</span>}
              </li>
            );
          })}
        </ul>
        {selfTickedCount > 0 && (
          <p className="rt-acc-foot">
            {selfTickedCount === 1 ? '1 box is' : `${selfTickedCount} boxes are`} ticked by you but not
            yet confirmed. Tick them in <code>.colaberry/progress.json</code>, commit, and push — the
            platform confirms them from your repo, not from this page.
          </p>
        )}
      </div>
    </section>
  );
};

export default AcceptanceChecklist;
