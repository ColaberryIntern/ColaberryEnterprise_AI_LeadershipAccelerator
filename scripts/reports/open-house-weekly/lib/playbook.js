/**
 * C124: what to DO about each weak step. One entry per rate key (targets.js) plus `source`. The recommendation engine
 * scores the steps; this file says what the move is, who can make it, where to start, and the hypothesis that the next
 * weekly report will grade. Edit freely: the report and the ONE_MOVE prompt both read it, so they stay in sync.
 *
 * weight   = closeness to the first win (later steps are worth more: a person there already cost an ad click)
 * executor = 'build' (Claude Code can ship it) or 'human' (needs a person: ad budgets, re-shooting video)
 */
'use strict';

module.exports = {
  bounce: {
    weight: 0.9, executor: 'build', title: 'Make the first phone screen of the landing page answer "what is this, and is it for me?"',
    how: ['Capture the landing page at 390x844 and list what a visitor sees before scrolling.', 'Move the one-line promise, the Open House date and the Save my seat button above the fold; cut everything else from the first screen.', 'Keep the copy rules: never the word for zero-cost, say "$0" or "No card needed"; American spelling.'],
    files: ['backend/src/services/marketing/landingPageRenderer.ts', 'the landing page content row for /lp/colaberry-training/ai-learning-platform (landing page admin)'],
    hypothesis: { metric: 'bounce', op: '<=', value: 40 },
  },
  seatClick: {
    weight: 1, executor: 'build', title: 'Make Save my seat the obvious move on the landing page',
    how: ['Check where the button sits on a phone and how many screens down the second one is.', 'Make the button copy say what happens next ("Save my seat, start today").', 'One primary action per screen; the $0 path stays secondary.'],
    files: ['backend/src/services/marketing/landingPageRenderer.ts'],
    hypothesis: { metric: 'seatClick', op: '>=', value: 25 },
  },
  formFinish: {
    weight: 1.2, executor: 'build', title: 'Shorten the Open House form so everyone who clicks finishes it',
    how: ['Count the fields and taps on a phone.', 'Make phone optional or move it after sign-up; keep name and email.', 'Show the Open House date at the top so the visitor knows what they are saving.'],
    files: ['frontend/src/pages/OpenHouseSignupPage.tsx', 'backend/src/controllers/openHouseController.ts'],
    hypothesis: { metric: 'formFinish', op: '>=', value: 70 },
  },
  signup: {
    weight: 1.1, executor: 'build', title: 'Lift landing page sign-ups', how: ['See the bounce and Save my seat moves; pick the weaker one.'], files: [],
    hypothesis: { metric: 'signup', op: '>=', value: 20 },
  },
  enter: {
    weight: 1.5, executor: 'build', title: 'Get every brand-new account through the door',
    how: ['Check the signed-up screen on a phone: is Access your account the only big button?', 'For accounts that never went in, look at whether the welcome email landed, and whether its subject says the account is ready.', 'Do NOT add new outreach: Maya owns reach-out. Fix the product path.'],
    files: ['frontend/src/pages/OpenHouseSignedUp.tsx', 'backend/src/services/openHouse/instantAccess.ts'],
    hypothesis: { metric: 'enter', op: '>=', value: 70 },
  },
  play: {
    weight: 2, executor: 'build', title: 'Make pressing play the obvious next step when a new account lands on the welcome video',
    how: ['Open the welcome video card as a brand-new account on a 390x844 phone screen and screenshot exactly what they see.', 'Make the player the first thing on screen with one large "Watch Ali\'s 2-minute welcome" play button; nothing competes with it.', 'Consider starting it muted with captions on arrival (browsers allow muted autoplay); a tap unmutes.', 'Keep C119 exit beats working: a play of any length must record.'],
    files: ['frontend/src/components/timeline/VideoEmbed.tsx', 'frontend/src/components/timeline/CardDetailBody.tsx', 'frontend/src/components/timeline/TimelineCard.tsx'],
    hypothesis: { metric: 'play', op: '>=', value: 50 },
  },
  finish: {
    weight: 2.2, executor: 'human', title: 'Re-cut the first 18 seconds of the welcome video',
    how: ['Pull the exit seconds from the report: most quitters leave in the first 18 s.', 'Ali re-cuts the opening so the payoff comes first; re-encode 1080p H.264 faststart.', 'Swap the file in the card metadata; the report compares before vs after.'],
    files: ['timeline_cards.metadata.video for card b0c844c0-01b0-439e-bc28-6a1b76b09afb'],
    hypothesis: { metric: 'finish', op: '>=', value: 50 },
  },
  credit: {
    weight: 2.4, executor: 'build', title: 'Award the credit automatically when a learner passes 75% of the video',
    how: ['Find where a watched card waits for a "collect" click after the 75% gate.', 'Award it on the watch beat that crosses 75%, idempotently (a second beat must not award twice).', 'Backfill: anyone already over 75% without the credit gets it, once.'],
    files: ['frontend/src/components/timeline/VideoWinCelebration.tsx', 'the runtime watch route that records beats (backend runtime cards watch)'],
    hypothesis: { metric: 'credit', op: '>=', value: 90 },
  },
  check: {
    weight: 2.4, executor: 'build', title: 'Open the Quick check the moment the credit is collected',
    how: ['After the credit, take the learner straight to the Quick check card.', 'One tap from video to first question.'],
    files: ['frontend/src/components/timeline/VideoWinCelebration.tsx'],
    hypothesis: { metric: 'check', op: '>=', value: 70 },
  },
  emailOpen: {
    weight: 1, executor: 'build', title: 'Get the welcome email opened',
    how: ['It lands in Gmail Updates: test a plainer subject that says the account is ready.', 'Measure opens in Mandrill next week.'],
    files: ['the open_house_welcome email template'],
    hypothesis: { metric: 'emailOpen', op: '>=', value: 40 },
  },
  source: {
    weight: 1, executor: 'human', title: 'Move ad spend from the weaker source to the stronger one',
    how: ['Share the source split with whoever runs the Meta ads.', 'Shift the weaker placement\'s budget to the stronger one for one week; compare sign-ups per visitor.'],
    files: [],
    hypothesis: { metric: 'signup', op: '>=', value: 25 },
  },
};
