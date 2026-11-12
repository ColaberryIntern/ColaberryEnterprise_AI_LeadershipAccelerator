/**
 * One data module for the Round 11 (Explorer first win from ad traffic) ticket artifacts: C118, C120, C121, C122.
 * Every figure below was measured on production in session CC-20261029-f4w2 (9 to 11 Nov 2026); the visual and the
 * document for each ticket both read it, so a number cannot differ between the two PDFs.
 */
const BC = 'https://app.basecamp.com/3945211/buckets/7463955/todos';
const PR = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull';

module.exports = {
  C118: {
    id: 'C118', ticket: `${BC}/10489483829`, title: "Ali's AI-avatar welcome video replaces the program video",
    prs: [`${PR}/3777`, `${PR}/3797`],
    asked: 'Add the new avatar welcome video from Downloads, self-hosted because there is no YouTube link.',
    delivered: 'The video is live as the first assignment for every Explorer who has not finished it, with a Quick check rewritten from its transcript.',
    video: { seconds: 109, mb: 21.7, from: '3840x2160, 316 MB', to: '1920x1080 H.264, faststart' },
    reach: { notFinished: 804, alreadyCredited: 24 },
    // Week before the switch (old YouTube video) vs first 27.8 hours (new video), brand-new sign-ups only.
    newSignups: { old: { openers: 51, finished: 7 }, neu: { openers: 10, finished: 2 } },
    allStarters: { old: { started: 68, finished: 12 }, neu: { started: 13, finished: 4 } },
    // Non-finishers of the new video by the second they left (max_position_s), 27.8 h in.
    exits: [6, 15, 18, 15, 5, 15, 12, 18, 46],
    quickCheck: { attempts: 2, perfect: 2 },
    deployedAt: '11:25 AM CST, 9 Nov', sha: '9009df497',
  },
  C119: {
    id: 'C119', ticket: `${BC}/10493820271`, title: 'The player now records exactly where a learner leaves a video',
    prs: [`${PR}/3808`],
    asked: 'Record exact exits, including a closed tab, before the Monday rerun.',
    delivered: 'Live since 7:03 AM CST, 10 Nov, and proven on production: a tab closed at 8 s recorded 8 s.',
    // Real non-finishers of the welcome video (exit second = max_position_s). "Before" readings sit on a 15-second
    // reporting step or come from a pause; a closed tab under 15 s was not recorded at all.
    before: [6, 15, 18, 15, 5, 15],
    after: [12, 46],
    staleTab: 18,
    proof: { playedTo: 8.3, beatsBeforeClose: 0, recordedWatched: 8, recordedExit: 8, at: '8:04:38 AM CST, 11 Nov' },
    tests: { new: 9, total: 20, mutationFails: 2 },
  },
  C120: {
    id: 'C120', ticket: `${BC}/10498337159`, title: 'The Open House funnel, tested end to end, with a step-by-step report',
    prs: [`${PR}/3861`],
    asked: 'Test the new Open House funnel end to end and be ready to give the numbers and the % at each step.',
    delivered: 'A test sign-up passed every step on production, and a rerunnable read-only report counts people at all ten steps.',
    window: '14.6 hours from 3:10 PM CST, 10 Nov',
    funnel: [
      { step: 'Landing page visitors', people: 27 },
      { step: 'Signed up for Open House', people: 5 },
      { step: 'Account created', people: 5 },
      { step: 'Welcome email sent', people: 5 },
      { step: 'Entered the account', people: 0 },
      { step: 'Played the video', people: 0 },
      { step: 'Finished the video', people: 0 },
      { step: 'Took the Quick check', people: 0 },
    ],
    mandrill: { emails: 5, found: 3, opened: 0, clicked: 0 },
    trainingSite: 2,
    testSteps: [
      ['Sign-up', 'POST /api/v1/open-house/signup returned 201; account, lead, registration and welcome email written within 3 s'],
      ['Email', 'Arrived in 1 s, filed in the Gmail Updates tab'],
      ['Click', 'Tracked link redirected to /portal/verify with the video as next; sign-in recorded'],
      ['Video', 'Served the self-hosted file; watch 14% to 83%; 75% gate met; credit collected'],
      ['Quick check', 'Five new questions served; 5 of 5'],
      ['Mandrill', '1 open, 2 clicks recorded about 10 minutes later'],
    ],
    blind: ['Visits to the /open-house form page (no page views recorded)', 'Which email a sign-in link came from', 'Open House attendance', '2 of the first 5 welcome emails are not found in Mandrill'],
  },
  C121: {
    id: 'C121', ticket: `${BC}/10498443776`, title: 'Open House sign-up opens a brand-new account with one click',
    prs: [`${PR}/3865`, `${PR}/3861`],
    asked: 'Skip the trip to the inbox: an Access your account button that signs them in; the email is the way back.',
    delivered: 'Live on production: a new sign-up reaches the welcome video in one click; an existing account is sent to sign in.',
    sha: '9c980d05c', deployedAt: '7:20 AM CST, 11 Nov',
    tests: { backend: 31, backendNew: 12, frontend: 31, frontendNew: 9 },
    prod: [
      ['New sign-up', '201, created, access returned (session + the welcome video path)'],
      ['Button landing', 'The session opened the welcome video card: 200, the avatar video'],
      ['Same address again', '200, created false, no session, told to sign in'],
      ['Funnel trail', 'Video opened 1 s after sign-up with no link sign-in: counted as a button entry; welcome email still sent'],
    ],
    bugFixed: 'People whose address already had an account were told to check their email for a login link. This form sends them no email; they are now told to sign in.',
  },
  C122: {
    id: 'C122', ticket: `${BC}/10498635255`, title: 'Email to Jackie went out with raw HTML: the send guard now refuses it',
    prs: [`${PR}/3868`],
    asked: 'Make sure an email like this can never go out again.',
    delivered: 'sendAsAli refuses any body containing HTML, in dry runs and live; installed on the host that sends, and tested with the exact Jackie body.',
    sentAt: '6:51 AM CST, 11 Nov', tests: 19, mutationFails: 9,
    chain: [
      'A session wrote the body in HTML (<p>, <a href>)',
      'sendAsAli treats the body as plain text and escaped every tag',
      'The email showed the tags as literal text',
      'linkify wrapped the URL already inside <a href> a second time: the garbled link',
      'The old guard checked dashes, sign-offs and the signature, never HTML',
    ],
    hostChecks: [
      ['HTML body (the Jackie email)', 'REFUSED, exit 1, with the plain-text instruction'],
      ['The same email in plain text', 'Passed the dry run, exit 0; nothing sent'],
      ['Host copy before the change', 'Identical to the repo copy (hash 519b095c); backup kept as sendAsAli.js.bak-pre-c122'],
    ],
  },
};
