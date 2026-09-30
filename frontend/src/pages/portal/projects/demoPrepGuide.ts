/**
 * What each demo-prep task actually asks for, in the words a first-timer needs.
 *
 * Until 2026-09-18 a prep task's page was its title twice and a box: "Record a
 * first run-through and watch it back", then "Paste a link to your first
 * run-through recording." A learner who had verified every story in his build
 * wrote in asking what to record, how to record it, and for a sample. Nothing
 * on the platform said. His step-1 narrative had gone in as a localhost link,
 * which only opens on his own machine, because nothing said a link has to open
 * for someone else either.
 *
 * Pure data, so the panel stays a form and this stays readable in one place.
 * The advice is deliberately tool-agnostic and names no length the programme
 * has not set.
 */
export type PrepGuide = {
  /** One sentence: what this task is, and why it sits where it does. */
  what: string;
  /** The steps, in order. Plain sentences, no jargon. */
  steps: string[];
};

/** How to make a screen recording with things a learner already has. */
export const HOW_TO_RECORD =
  'Any recorder works: Zoom (start a meeting on your own, share your screen, press Record), Loom (free, and it gives you a link as soon as you stop), or the one built into your computer (Windows: Snipping Tool, then Record; Mac: Cmd+Shift+5). Make sure your microphone is on.';

/** How to turn a file on your computer into a link someone else can open. */
export const HOW_TO_SHARE =
  'Upload the file to Google Drive or OneDrive and set sharing to "Anyone with the link can view", or upload it to YouTube as Unlisted. Copy that link. Before you paste it, open it in a private browser window: if it asks you to sign in or request access, nobody else can see it either. A link starting with localhost or a file on your computer only works for you.';

export const PREP_GUIDE: Readonly<Record<string, PrepGuide>> = {
  'PREP-1': {
    what: 'The story you will tell on Demo Day, written down before you build slides or record anything.',
    steps: [
      'The problem: who has it, and what it costs them today. Two or three sentences.',
      'The one moment: the single thing your system does, live, that makes someone say "oh". Just one.',
      'The guardrail: what stops your system doing harm when it is wrong or the data is bad, and how you will show it.',
      'Hand in the text itself, or a link to a document others can open.',
    ],
  },
  'PREP-2': {
    what: 'A first, rough recording of you giving your demo, so you can see and hear it the way your audience will. Nobody grades the polish; the point is what you notice when you watch it back.',
    steps: [
      'Open your working system and your narrative from step 1.',
      `Record your screen while you talk through it once, start to finish, as if the audience were watching: the problem, then show the one moment live, then show the guardrail. Do not restart when you stumble. ${HOW_TO_RECORD}`,
      'Watch it back once with a notepad. Write down where you lost the thread, rushed, clicked around looking for something, or used a word your audience would not know. Those notes are what the slides (step 3) and the rehearsal (step 4) fix.',
      HOW_TO_SHARE,
    ],
  },
  'PREP-3': {
    what: 'A few slides that frame the demo, not a replacement for it.',
    steps: [
      'What it does, in one line.',
      'Who it is for, by role.',
      'The number it moves: the time, cost, or risk it changes, and how you know.',
      'Use your notes from the run-through: anything you had to explain at length is a slide.',
      'Hand in a link others can open (Google Slides, PowerPoint online, or a PDF on Drive or OneDrive), or describe the slides in text.',
    ],
  },
  'PREP-4': {
    what: 'One real rehearsal in front of one real person, before the day.',
    steps: [
      'Give the whole demo, slides and live system, to a classmate, colleague, or friend.',
      'Ask them: what was the problem, what did it do, and what would stop it going wrong? If they cannot answer, that part needs work.',
      'Hand in who you rehearsed with and what they told you.',
    ],
  },
  'PREP-5': {
    what: 'The finished recording of your demo: the version you would be happy for an employer to watch.',
    steps: [
      'Apply the notes from your run-through (step 2) and your rehearsal (step 4).',
      `Record it the same way as the run-through. ${HOW_TO_RECORD}`,
      HOW_TO_SHARE,
    ],
  },
};

export function guideFor(storyId: string | null | undefined): PrepGuide | null {
  return (storyId && PREP_GUIDE[storyId]) || null;
}
