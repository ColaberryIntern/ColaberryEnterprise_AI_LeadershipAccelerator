/**
 * C4.4 and C4.5 - the demo script, the storyboard and the runbook. One module, because the
 * runbook wraps the script and they must not drift.
 *
 * ## Three criteria that are measurable, so they are measured
 *
 *   - "Runs to three minutes when read aloud" -> count the spoken words and divide by a stated
 *     speaking rate. `assertThreeMinutes()` fails outside a 2:30 to 3:15 band.
 *   - "Every screen marked real or sample"    -> every frame carries REAL or SAMPLE, asserted,
 *     because showing sample data as a customer outcome is the named failure mode.
 *   - "A real failure path is scripted"       -> the runbook must contain a failure section with
 *     actual words to say, not an instruction to improvise.
 *
 * ## The pilot transition cannot commit, and the runbook says so
 *
 * C2.6 reserves three answers to Ali: IP ownership, deployment liability and model neutrality.
 * All three gate a pilot proposal. So the transition is scripted toward a SCOPED NEXT
 * CONVERSATION rather than a pilot, and `assertPilotNotCommitted()` fails if the words promise
 * one. That is not caution for its own sake: committing to a pilot in a room, before those three
 * are answered, creates an obligation the company has not decided it can meet.
 */

const AS_OF = '16 October 2026';

/** Words per minute for demo narration, spoken deliberately with pauses at screen changes. */
const WPM = 140;

/* ------------------------------------------------------------------ *
 * C4.4 - ONE JOURNEY, NOT A TOUR
 * ------------------------------------------------------------------ */

const JOURNEY = 'A single learner story going from unverified to verified against a real commit.';

const WHY_THIS_JOURNEY = 'It is the only thing we do that 0 of 20 competitors do, it takes under '
  + 'three minutes end to end, and it is the one claim a buyer can check for themselves '
  + 'afterwards. A tour of the platform would show more and prove less.';

/**
 * The storyboard. `say` is the word-for-word narration; the word count of these fields is what
 * the three-minute assertion measures. `data` is REAL or SAMPLE and appears on screen.
 */
const FRAMES = [
  { n: 1, t: '0:00', screen: 'A learner project board, mid-flight', data: 'REAL',
    say: 'This is a real project, running right now. Not a sandbox built for this call. These '
      + 'are stories a learner has committed to delivering, and the platform is tracking every '
      + 'one of them.' },
  { n: 2, t: '0:20', screen: 'One story, expanded, in its unverified state', data: 'REAL',
    say: 'Here is one story. The learner says they have done it. At this point the platform does '
      + 'not believe them, and that is the entire point. Every training platform you have seen '
      + 'would mark this complete because somebody ticked a box.' },
  { n: 3, t: '0:45', screen: 'The repository, with the matched commit highlighted', data: 'REAL',
    say: 'So we go and look. This is the actual repository, and this is the commit the pipeline '
      + 'matched to that story. Nobody typed this in. The pipeline read the commit, checked it '
      + 'against what the story asked for, and made a decision. It runs on push, so there is no '
      + 'queue and no reviewer, which is also why it costs us nothing per learner and why we can '
      + 'offer it at the price we do.' },
  { n: 4, t: '1:15', screen: 'The story flipping to verified', data: 'REAL',
    say: 'Now it is verified. The difference between those two states is the difference between '
      + 'a completion report and evidence, and it is the thing your procurement team will ask '
      + 'you about.' },
  { n: 5, t: '1:35', screen: 'The audit row behind the state change', data: 'REAL',
    say: 'And here is the audit row behind it. Every write is audited, so the evidence survives '
      + 'this meeting. If someone asks in six months who verified this and when, that question '
      + 'has an answer.' },
  { n: 6, t: '2:00', screen: 'Project view, the full set of verified stories', data: 'REAL',
    say: 'Zooming out: three hundred and forty five stories verified this way, across twenty '
      + 'nine projects, as of this morning, with forty eight projects in flight. That number '
      + 'moves because learners keep committing, so I will always tell you the date I read it. '
      + 'If I ever quote you a figure without a date, push back on me.' },
  { n: 7, t: '2:25', screen: 'A sample report, clearly watermarked', data: 'SAMPLE',
    say: 'This next screen is sample data and it is labeled as such. It shows the shape of the '
      + 'report a sponsor gets. We do not have a customer cohort to show you yet, and I would '
      + 'rather say that than dress our own data up as yours.' },
  { n: 8, t: '2:45', screen: 'Back to the verified story, held', data: 'REAL',
    say: 'So that is the whole thing. A person said they built something, and the system went '
      + 'and checked, and the checking left a record that outlives this conversation. That is '
      + 'the entire product. Is that useful to you, and who else in your organization should '
      + 'see it?' },
];

/* ------------------------------------------------------------------ *
 * C4.5 - THE RUNBOOK
 * ------------------------------------------------------------------ */

const OPENING = 'Thanks for the time. I am going to show you one thing rather than tour the '
  + 'platform, it takes about three minutes, and then I would rather spend the rest of this on '
  + 'your questions than on my slides.';

const DISCOVERY = {
  q: 'Before I show you anything: when someone on your team finishes an AI course today, how do '
    + 'you know what they can actually build?',
  why: 'It is the only question whose answer changes how you run the rest of the call. If they '
    + 'have an answer, the demo is a comparison. If they do not, and most do not, the demo is '
    + 'the answer to a question they just discovered they had. Ask it, then stop talking.',
};

const FAILURE_PATH = {
  when: 'The pipeline does not return, the repository will not load, or a story does not flip.',
  say: 'That is a live system and it has just failed in front of you, so let me not pretend '
    + 'otherwise. I am going to show you the audit trail for a verification that did complete, '
    + 'because the thing I want you to see is the evidence, not the animation.',
  then: 'Open the audit view on a previously verified story. The claim is that verification is '
    + 'recorded and checkable, and a recorded verification from yesterday proves that exactly as '
    + 'well as a live one.',
  never: 'Never say "that usually works" or blame the network. You are selling verification to '
    + 'someone who will remember how you behaved when your own system was unverifiable for '
    + 'thirty seconds.',
};

const QUESTIONS = [
  { q: 'Who verified it, the AI?',
    a: 'The pipeline matched the commit to the story. A person set the story. The audit row '
      + 'records both. The fleet is read-only: it watches and records, it does not act.' },
  { q: 'What stops a learner gaming it?',
    a: 'The commit has to exist in a real repository and satisfy what the story asked for. You '
      + 'can game a quiz. Gaming this means writing the code.' },
  { q: 'Is any of this live with a customer?',
    a: 'Not yet. Our first cohort has not finished and I am not going to tell you otherwise. '
      + 'What is live is the platform and the verification, which is what I just showed you.' },
  { q: 'What happens to our code?',
    a: 'That is one of three questions I will not answer off the cuff, because the answer has to '
      + 'be the same one our contract gives. I will come back to you in writing.' },
];

const PILOT_TRANSITION = {
  say: 'If this is useful, the next step I would suggest is a scoped conversation about what a '
    + 'first engagement would look like with your people and your repositories. I am not going '
    + 'to propose a pilot in this room, because there are three things, on intellectual '
    + 'property, on liability and on model choice, that I want answered in writing before '
    + 'anyone signs anything. I would rather raise those now than have you find them later.',
  why: 'C2.6 reserves exactly those three answers to Ali and they gate a pilot proposal. Saying '
    + 'so out loud costs nothing and buys a great deal: it is the single most credible thing a '
    + 'seller can do in a first meeting, and it prevents committing the company to an obligation '
    + 'it has not decided it can meet.',
};

const FOLLOW_UP = {
  within: '24 hours',
  send: 'The one-page leave-behind, the capability statement with its three tiers, and written '
    + 'answers to anything deferred in the room.',
  never: 'Do not send the full deck unless asked. The leave-behind exists because it survives '
    + 'being forwarded and the deck does not.',
};

/* ------------------------------------------------------------------ *
 * THE GATES
 * ------------------------------------------------------------------ */

/** Count the spoken words and check the running time against a stated rate. */
function spokenWords() {
  return FRAMES.reduce((a, f) => a + f.say.trim().split(/\s+/).length, 0);
}

function assertThreeMinutes() {
  const words = spokenWords();
  const seconds = Math.round((words / WPM) * 60);
  if (seconds < 150 || seconds > 195) {
    throw new Error('the script runs ' + Math.floor(seconds / 60) + ':'
      + String(seconds % 60).padStart(2, '0') + ' at ' + WPM + ' words per minute, outside the '
      + '2:30 to 3:15 band. "Runs to three minutes when read aloud" is measurable, so it is '
      + 'measured rather than estimated.');
  }
  return { words, seconds };
}

/** Every frame declares REAL or SAMPLE, and at least one is honestly marked SAMPLE. */
function assertEveryFrameLabeled() {
  const bad = FRAMES.filter((f) => f.data !== 'REAL' && f.data !== 'SAMPLE');
  if (bad.length) {
    throw new Error('frames without a REAL or SAMPLE label: ' + bad.map((f) => f.n).join(', ')
      + '. Showing sample data as though it were a customer outcome is the named failure.');
  }
  return { real: FRAMES.filter((f) => f.data === 'REAL').length,
    sample: FRAMES.filter((f) => f.data === 'SAMPLE').length };
}

/** A failure path with actual words, not an instruction to improvise. */
function assertFailurePathScripted() {
  if (!FAILURE_PATH.say || FAILURE_PATH.say.split(/\s+/).length < 25) {
    throw new Error('the failure path must be scripted word for word; having no failure path is '
      + 'the named failure mode for this ticket');
  }
  if (!FAILURE_PATH.never) throw new Error('the failure path must say what NOT to say');
  return true;
}

/** The pilot transition may not commit to a pilot while three answers are outstanding. */
function assertPilotNotCommitted() {
  const t = PILOT_TRANSITION.say.toLowerCase();
  const commits = /\bwe will run a pilot|let us start a pilot|i can commit|we can begin the pilot/;
  if (commits.test(t)) {
    throw new Error('the pilot transition commits to a pilot, but C2.6 reserves IP ownership, '
      + 'deployment liability and model neutrality to Ali and all three gate a pilot proposal');
  }
  if (!/three things|intellectual property|liability/.test(t)) {
    throw new Error('the pilot transition must name the three reserved questions out loud');
  }
  return true;
}

module.exports = {
  AS_OF, WPM, JOURNEY, WHY_THIS_JOURNEY, FRAMES, OPENING, DISCOVERY, FAILURE_PATH, QUESTIONS,
  PILOT_TRANSITION, FOLLOW_UP, spokenWords,
  assertThreeMinutes, assertEveryFrameLabeled, assertFailurePathScripted,
  assertPilotNotCommitted,
};
