/**
 * AF2.9's facts: the stale copy an intern could not clear, what actually caused it, and the one
 * acceptance criterion that is NOT met.
 *
 * Data only, no rendering. Taken from the merged PR #3442, the ticket's own wording, and the
 * committed harness at scripts/captureStaleCopyProof.js.
 *
 * This artifact has to do two things most of the others do not. It has to say that the TICKET'S
 * PREMISE WAS WRONG -- the pull never failed -- and it has to say plainly that criterion 3 is
 * still unproven, because the thing that would prove it cannot be faked and has not been run.
 */
const TICKET = 'AF2.9';
const PR = 3442;
const MERGED_ON = '2026-10-28';

const COST = [
  'Mihret, 21 Oct: reported a story showing "This story is human work ... no prompt on purpose". '
    + 'Was told to hard refresh. Did. Still saw it. Eventually tried an incognito window herself '
    + 'and got the right prompt. She diagnosed our bug for us.',
  'Quincy, 21 Oct 21:57: the same stale text on a different story, asked "is that correct?" and '
    + 'copied Kes.',
  'The database was clean the entire time: 0 rows table-wide carried that phrase, and both '
    + 'stories held correct prompts of roughly 4,100 characters. Every server-side check said the '
    + 'problem did not exist, which is precisely why it took two interns and several hours.',
];

/** The ticket asked why the pull fails for domain projects. It does not fail. */
const PREMISE = {
  asked: 'AF2.9 reports "a failed refresh silently serves a stale copy" and asks, as its third '
    + 'item, WHY the pull fails for domain projects.',
  truth: 'The pull does not fail. adoptServerTasks was ADD-ONLY BY DESIGN: it hands a device the '
    + 'stories it lacks and never touches one it already has. So server-authored text reached an '
    + 'existing card only if somebody remembered to copy that one field by hand.',
  explains: 'It explains both halves of what Mihret saw. A hard refresh CANNOT help, because the '
    + 'stale copy is in localStorage, which outlives a refresh. An incognito window CAN, because '
    + 'an empty store forces the hydrate path.',
};

/** The same shape had already cost three incidents. prompt/what/acceptance were 4, 5 and 6. */
const PRIOR = [
  ['verifiedAt', '2026-09-15', 'projectPoints.earned read 0 on the very device that had earned 1,489 points'],
  ['points', '--', 'a task stored before its story had a price tag could never acquire one'],
  ['title', '2026-10-25', '250 demo-prep rows renamed and verified in the database, invisible on every existing device forever'],
];

const TEST_LESSON = 'projectHydrate.renamedTitle.test.ts closes with "These tests exist so the '
  + 'fourth one is caught by a test instead of a screenshot." It was not -- because that suite '
  + 'guards THE FIELD, not THE RULE.';

const FIX = {
  what: 'adoptServerContent copies EVERYTHING the server authors, by one rule, replacing three '
    + 'hand-maintained Maps. The next field added to a plan now arrives on existing devices '
    + 'without anyone remembering anything.',
  refusals: [
    ['Never writes state or due', 'completion is the student\'s, and the monotonic guard stays: '
      + 'the server may mark a story done, never undo one'],
    ['Never writes id', 'it keys the acceptance ticks in te_ws_acc_*, so re-pointing it would '
      + 'silently disconnect a student from their own checklist'],
    ['Set-from, never cleared-by', 'a server returning no prompt says nothing about the prompt '
      + 'on screen'],
  ],
  control: 'The new control NAMES NO FIELD. It builds the project both ways from one tree and '
    + 'asserts that a device which HAS the story ends up with the same story as a device seeing '
    + 'it for the first time. A seventh field fails it UNEDITED.',
};

/** A second silent path, found while fixing the first. */
const SECOND_PATH = 'hydrateProjects threw away write()\'s boolean. A quota failure -- real, at '
  + '114 KB for a tree carrying a 30 KB prompt -- leaves the OLD value in localStorage while '
  + 'every caller believes the new one landed. A pull that SUCCEEDED, a stale screen, and no '
  + 'failure event anywhere. The store\'s own docblock describes the hazard; the function '
  + 'discarded the answer. It now returns it, and the sync layer reports it.';

/** A third route to the same symptom. */
const THIRD_PATH = 'A planless domain project does NOT error. buildTree returns lists: [] and the '
  + 'route answers 200, which the client reads as "no tree" and proceeds -- a third route to the '
  + 'same symptom, also with no signal. A boundary test now pins it.';

const BANNER = {
  what: 'projectFreshness tracks whether this device is showing the server\'s answer, and '
    + 'StaleCopyBanner says so above the story, with how old the copy is. It is the first '
    + 'consumer of plumbing that was built for this banner, documented for it, and then never '
    + 'wired to anything.',
  refusals: [
    ['A 404 is neither stale nor confirmed', 'a flag-gated-off API is not a stale copy, and '
      + 'saying otherwise would be a fault the client invented'],
    ['Reaching the server does not clear a failed WRITE', 'the screen is still showing the older '
      + 'copy, so stamping it "confirmed just now" would be a lie'],
  ],
};

const RECOVERY = 'The ticket asked for a button that "clears the local copy and refetches". IN '
  + 'THAT ORDER IT IS A TRAP: if the refetch then fails, the student has nothing where they at '
  + 'least had stale work. refetchProjectFromServer touches nothing until the tree is in hand. '
  + 'It is scoped to ONE card, so a build that exists only in this browser is not deleted; it '
  + 'carries across local completions the server has not echoed; and it preserves the id aliases '
  + 'that keep a bookmarked workspace URL resolving.';

const CRITERIA = [
  {
    n: 1,
    text: 'An intern whose refresh fails can tell, from the page, that they are looking at a '
      + 'saved copy.',
    met: true,
    evidence: 'StaleCopyBanner renders above the story with the age of the copy, driven by '
      + 'projectFreshness. Two deliberate refusals keep it honest rather than merely present.',
  },
  {
    n: 2,
    text: 'They can recover without being told a browser trick.',
    met: true,
    evidence: 'refetchProjectFromServer fetches first and replaces second, scoped to one card, '
      + 'preserving local completions and the id aliases a bookmarked URL depends on.',
  },
  {
    n: 3,
    text: 'Proved against a real domain project with the pull forced to fail, NOT a fixture.',
    met: false,
    evidence: 'NOT PROVEN. The harness is written and committed at scripts/captureStaleCopyProof.js '
      + 'and it refuses to substitute a fixture, because a fixture is the one thing this criterion '
      + 'excludes. It needs a production participant token for a student who owns a real domain '
      + 'project, and it has not been run.',
  },
];

/** Why the harness is worth running rather than replacing with another unit test. */
const HARNESS = {
  why: 'The unit suites pin the behavior, but a unit test cannot satisfy this criterion BY '
    + 'CONSTRUCTION: it asserts against a fixture, which is exactly what the criterion excludes.',
  control: 'A screenshot of a banner proves the banner can RENDER. It does not prove the banner '
    + 'MEANS what it says -- a banner that is always up would photograph identically. So the '
    + 'harness loads the same project with the pull ALLOWED and requires the banner to be ABSENT, '
    + 'and only then does the forced failure prove the banner tracks the pull rather than the page.',
  needs: 'CAPTURE_TOKEN, a production participant JWT for a student owning a real domain project.',
};

module.exports = {
  TICKET, PR, MERGED_ON, COST, PREMISE, PRIOR, TEST_LESSON, FIX,
  SECOND_PATH, THIRD_PATH, BANNER, RECOVERY, CRITERIA, HARNESS,
};
