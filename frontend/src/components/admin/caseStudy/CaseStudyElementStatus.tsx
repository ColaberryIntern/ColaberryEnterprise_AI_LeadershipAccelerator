import React from 'react';

/**
 * CaseStudyElementStatus — the five words, rendered so AI prose and verified
 * fact cannot be mistaken for one another.
 *
 * THE FAILURE THIS EXISTS TO PREVENT is not a wrong badge. It is a screen on
 * which a sentence a model wrote and a figure a third party verified are
 * rendered in the same weight, the same colour and the same box, so that a
 * reviewer scanning quickly treats them as the same kind of thing. Once that
 * happens, every downstream control is being asked to catch a mistake the
 * interface encouraged.
 *
 * SO THE TREATMENTS ARE DELIBERATELY UNEQUAL, and never colour alone —
 * `claimsRegistry`'s rule and WCAG 1.4.1 both. Each status carries a WORD, and
 * `generated` additionally carries a dashed border and an explicit "not
 * checked" sentence, because it is the only one of the five that means "nobody
 * has looked at this".
 *
 * `publishable` is not rendered as a tick. A reviewer reading a tick beside
 * `Verified` would reasonably infer it is on the page, which is a different
 * question — publication is per surface and decided by the gate.
 */

export type StoryElementStatus =
  | 'generated' | 'needs_evidence' | 'verified' | 'human_approved' | 'hidden';

interface StatusTreatment {
  readonly label: string;
  readonly className: string;
  readonly meaning: string;
  readonly dashed: boolean;
}

/**
 * Mirrors `backend/src/types/caseStudyStory.ts`'s `STORY_ELEMENT_STATUS_META`.
 * `caseStudyElementStatus.test.ts` asserts the two vocabularies have identical
 * keys, so the copy here cannot quietly grow a sixth word the backend does not
 * know or lose one it does.
 */
export const STATUS_TREATMENTS: Readonly<Record<StoryElementStatus, StatusTreatment>> = {
  generated: {
    label: 'Generated',
    // NO `border` UTILITY CLASS HERE, AND THAT IS LOAD-BEARING — see
    // `DASHED_FRAME` below. Bootstrap's `.border` is `!important` and would
    // silently overrule the dashed style this status depends on.
    className: 'bg-white text-dark',
    meaning: 'Written by AI. Nobody has checked it. It cannot reach a public page in this state.',
    dashed: true,
  },
  needs_evidence: {
    label: 'Needs Evidence',
    className: 'bg-warning text-dark',
    meaning: 'It asserts something no evidence in this record supports yet.',
    dashed: false,
  },
  verified: {
    label: 'Verified',
    className: 'bg-success text-white',
    meaning: 'Backed by an evidence record or an approved metric, not by an opinion.',
    dashed: false,
  },
  human_approved: {
    label: 'Human Approved',
    className: 'bg-primary text-white',
    meaning: 'A named human wrote or accepted this and is accountable for it.',
    dashed: false,
  },
  hidden: {
    label: 'Hidden',
    className: 'bg-secondary text-white',
    meaning: 'Deliberately withheld from every surface. Not deleted, not published.',
    dashed: false,
  },
};

/**
 * THE DASHED FRAME, AS ONE SHORTHAND, AND WHY IT IS NOT A BOOTSTRAP CLASS.
 *
 * The first version of this file wrote `className="... border border-secondary"`
 * and `style={{ borderStyle: 'dashed', borderWidth: '2px' }}`, on the ordinary
 * assumption that an inline style beats a class. It does not here. Bootstrap
 * 5.3's border utility is:
 *
 *   .border { border: var(--bs-border-width) var(--bs-border-style)
 *             var(--bs-border-color) !important; }
 *
 * `!important` outranks an inline declaration, so the frame rendered as a plain
 * 1px SOLID line and the one visual signal separating AI prose from verified
 * fact was simply absent. Every unit test passed, because jsdom applies no
 * stylesheet and cannot compute that cascade. It was caught by the browser run
 * reading `getComputedStyle`, which is the third failure class
 * `STORY_STUDIO_TEST_PLAN.md` §1.3 was written against — this surface has
 * already shipped three invisible-text contrast bugs the same way.
 *
 * So the border is declared ONCE, as a shorthand, with no competing utility
 * class. `currentColor` avoids a raw hex and inherits the text colour, so the
 * frame stays legible in whatever context it is dropped into.
 */
const DASHED_FRAME: React.CSSProperties = { border: '2px dashed currentColor' };

interface Props {
  status: StoryElementStatus;
  /** Appended to the testid so repeated rows do not collide. */
  testIdSuffix?: string;
  /** Render the one-sentence meaning beside the badge. */
  withMeaning?: boolean;
}

export default function CaseStudyElementStatus({
  status, testIdSuffix, withMeaning = false,
}: Props): React.ReactElement {
  const treatment = STATUS_TREATMENTS[status];
  const testId = testIdSuffix ? `cs-status-${status}-${testIdSuffix}` : `cs-status-${status}`;

  return (
    <span data-testid={testId}>
      <span
        className={`badge ${treatment.className}`}
        style={treatment.dashed ? DASHED_FRAME : undefined}
        title={treatment.meaning}
      >
        {treatment.label}
      </span>
      {withMeaning ? (
        <span className="small text-muted ms-2">{treatment.meaning}</span>
      ) : null}
    </span>
  );
}

/**
 * The wrapper that makes generated prose LOOK unfinished.
 *
 * A badge alone is not enough: a reviewer reads the text, not the label beside
 * it. Quarantined text is therefore set on a tinted, dashed-bordered ground so
 * that a screenshot of this panel, with no badge legible, still shows which
 * sentences nobody has stood behind.
 */
export function GeneratedTextFrame({
  children, testId,
}: { children: React.ReactNode; testId: string }): React.ReactElement {
  return (
    <div
      // No `border` utility class — see DASHED_FRAME. `text-secondary-emphasis`
      // sets the currentColor the frame inherits, so the dash reads as muted
      // rather than as an error state.
      className="p-2 rounded bg-light text-secondary-emphasis"
      style={DASHED_FRAME}
      data-testid={testId}
    >
      <span className="text-body">{children}</span>
    </div>
  );
}
