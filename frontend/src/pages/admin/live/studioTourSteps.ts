import type { TourStep } from './StudioTour';

/**
 * What the walkthrough points at, and what it says when it gets there.
 *
 * Kept out of the page so the words can be read and changed without scrolling through render
 * code, and so the two pages' tours sit next to each other where the difference between them
 * is obvious.
 *
 * ## Each step earns its place by saying something the card does not
 *
 * The card already says "Access mode" and lists four options. Pointing at it to announce
 * "this is the access mode" is the kind of tour everybody clicks through without reading. What
 * the screen does NOT say is that the choice is permanent and has no undo, so that is what the
 * step says.
 */

/** The class list: one step, then it opens a class and the setup tour takes over. */
export function indexTourSteps(firstClassPath: () => string | null): TourStep[] {
  return [
    {
      target: 'class-list',
      title: 'Every class you can set up',
      body: 'The last month and the next four. A class reads "Not set up" until it has a '
        + 'broadcast, which is what the next screen creates. Open one and the rest of this '
        + 'walkthrough follows you there.',
    },
    {
      goto: firstClassPath,
      target: 'show',
      title: 'This is the class itself',
      body: 'Title and timing come from the class that already exists, so there is nothing to '
        + 'retype here. If the date is wrong, fix it where classes are scheduled - changing it '
        + 'here would let the two disagree.',
    },
    ...setupTourSteps().slice(1),
  ];
}

/** The setup screen: one step per card, in the order somebody fills them. */
export function setupTourSteps(): TourStep[] {
  return [
    {
      target: 'show',
      title: 'This is the class itself',
      body: 'Title and timing come from the class that already exists, so there is nothing to '
        + 'retype here. If the date is wrong, fix it where classes are scheduled - changing it '
        + 'here would let the two disagree.',
    },
    {
      target: 'people',
      title: 'Who teaches, and who runs the show',
      body: 'Start typing a name and pick from the list. Anyone with the staff role can be '
        + 'named. Some of those are agent accounts, so type a couple of letters of a '
        + 'colleague’s name rather than scrolling.',
      warning: 'These must be two different people. Whoever is teaching cannot also watch the '
        + 'feed health and end the broadcast, so Create stays locked until they differ.',
    },
    {
      target: 'audience',
      title: 'Who may join on the night',
      body: 'Cohort only, or cohort and guests. This used to be decided by whether the class '
        + 'title contained the words "Open House", which meant renaming a class quietly changed '
        + 'who could see it. Now it is a choice you make here.',
    },
    {
      target: 'access',
      title: 'Who may watch afterwards',
      body: 'Read the sentence under each option rather than the single word above it: the '
        + 'sentence says what a remote viewer actually gets.',
      warning: 'THIS CANNOT BE CHANGED LATER. It is written once, and there is no undo on this '
        + 'screen - widening it afterwards would mean people who were told one thing are shown '
        + 'another. Fixing a mistake means deleting the airing by hand in the database, which '
        + 'is why there is a checkbox to acknowledge it.',
    },
    {
      target: 'recording',
      title: 'The recording',
      body: 'Zoom cloud recording with transcription, confirmed before you create. The '
        + 'recording is what the clip list and the videographer handoff are measured against '
        + 'later, so an airing with nothing bound has no replay and no clips.',
    },
    {
      target: 'summary',
      title: 'Four things, then Create',
      body: 'Create stays disabled until all four read Done, so the list is the checklist. '
        + 'Save without creating keeps your answers without minting the broadcast, which is '
        + 'the one to use if you are part-way through and want to come back.',
    },
    {
      target: 'summary',
      title: 'What happens after Create',
      body: 'The class page gets the producer controls: go backstage, mark content started, go '
        + 'live, mark a moment for the editor, and end. The clip list and the handoff check '
        + 'appear in the Class Kit once it has aired.',
    },
  ];
}
