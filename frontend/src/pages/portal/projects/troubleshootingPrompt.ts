/**
 * troubleshootingPrompt — the text a stuck student pastes into Claude Code when
 * the thing that is broken is THEIR OWN CODE.
 *
 * Kept out of the page component because it is copy, not behavior, and because
 * the last paragraph is load-bearing enough to want its own test.
 *
 * That last paragraph is the whole point. Claude Code can read and change the
 * files on the student's machine; it cannot see the portal, the enrollment, the
 * story, or what the platform has recorded. Asked "why does the portal say 0 of
 * 3?", it does not decline — it answers, fluently and wrongly, because it is
 * reasoning about a page it has never seen. That is how a student spent a day
 * pushing code at a problem that turned out to be a missing criteria block. So
 * the prompt itself tells the model to stop and hand the question back, which is
 * the only version of this warning that survives the student ignoring the page.
 *
 * Written for a reader who does not consider themselves technical: short lines,
 * no jargon, and the two blanks the student must fill marked in plain words.
 */

/**
 * @param storyLabel How the open story is titled on the page (e.g.
 *   "STORY-004 · Take a deposit"), so the student does not have to explain
 *   which piece of work they are on. Falls back to a neutral phrase when the
 *   page has no title yet.
 */
export function troubleshootingPrompt(storyLabel?: string): string {
  const story = (storyLabel || '').trim() || 'my current story';
  return [
    `I am a student on the Colaberry AI Systems Architect Accelerator, working on ${story}.`,
    'Something in my own code is not working and I would like your help fixing it.',
    '',
    'What I was trying to do:',
    '<replace this line with what you wanted to happen>',
    '',
    'What happened instead:',
    '<replace this line with the error message, or with what you saw>',
    '',
    'Please work in this order:',
    '1. Read the files in this project that are involved before you suggest anything.',
    '2. Tell me in plain English what is going wrong, and why.',
    '3. Make the smallest change that fixes it, and show me exactly what you changed.',
    '4. Prove it works by running the project or its tests. If you cannot run them,',
    '   tell me the exact command to run.',
    '',
    'One limit to respect: you can only see the code in this folder. You cannot see',
    'my course portal, my progress, or whether a story is marked complete. If it',
    'turns out the problem is that the portal is showing something I did not expect,',
    'say so and stop there. Do not guess at it. That one is for Cory, on the story',
    'page in the portal, and not for you.',
  ].join('\n');
}
