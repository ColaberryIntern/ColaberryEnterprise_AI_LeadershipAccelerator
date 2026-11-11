/**
 * l19StateMatrixDocument — DOC 19's generated Markdown and the checks that make it trustworthy.
 *
 * THE LOAD-BEARING CHECK IS THAT EVERY ROW'S TEST EXISTS. A state matrix is the easiest document
 * here to write as fiction: every cell is a sentence about behavior, nothing forces the
 * behavior to match, and it stays plausible long after the code moves. So this does not merely
 * require a `provenIn` field to be present - it opens the named file and requires the named test
 * to be in it. Deleting a test leaves the document unbuildable rather than quietly wrong.
 *
 * THE STATE LIST COMES FROM THE MACHINE, not from this data. If someone adds a ninth editorial
 * state and does not decide what each surface shows, the build fails. That is the specific
 * failure that left the canceled state sitting in the fall-through, telling viewers a
 * called-off class was about to start.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l19StateMatrixData');

const ROOT = path.join(__dirname, '..', '..', '..');

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The machine's own state list, read rather than restated. */
function machineStates() {
  const src = fs.readFileSync(path.join(ROOT, D.META.machine), 'utf8');
  const m = src.match(/EDITORIAL_STATES\s*=\s*\[([^\]]+)\]/);
  if (!m) throw new Error('l19: EDITORIAL_STATES not found in the state machine');
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function selfCheck() {
  const fail = (msg) => { throw new Error(`l19StateMatrix: ${msg}`); };

  // 1. Every state the machine can hold has a row, and no row invents one.
  const machine = machineStates().sort();
  const documented = D.STATES.map((s) => s.state).sort();
  if (machine.join(',') !== documented.join(',')) {
    fail(`the machine holds [${machine}] and the matrix documents [${documented}]. A state with `
      + 'no decided treatment is how a canceled class came to tell viewers it had not '
      + 'started yet.');
  }

  // 2. Every row covers all four surfaces. A blank cell is an undecided surface.
  D.STATES.forEach((s) => {
    ['presenter', 'phone', 'producer', 'viewer', 'moment'].forEach((k) => {
      if (!s[k] || !String(s[k]).trim()) fail(`state ${s.state} has no ${k}`);
    });
  });

  // 3. Every row names a test, and THAT TEST EXISTS. The difference between this and checking
  //    the field is non-empty is the difference between a matrix and a wish.
  D.STATES.forEach((s) => {
    if (!s.provenIn || !s.provenIn.file || !s.provenIn.test) fail(`state ${s.state} names no test`);
    const abs = path.join(ROOT, s.provenIn.file);
    if (!fs.existsSync(abs)) fail(`state ${s.state} names ${s.provenIn.file}, which is not on disk`);
    if (!fs.readFileSync(abs, 'utf8').includes(s.provenIn.test)) {
      fail(`state ${s.state} says it is proved by "${s.provenIn.test}" in ${s.provenIn.file}, `
        + 'and no test by that name is there');
    }
  });

  // 4. Backstage is marked as the security row and says so on the viewer surface. If this is ever
  //    softened, the one row that is not a matter of taste stops reading like one.
  const backstage = D.STATES.find((s) => s.state === 'backstage');
  if (!backstage.security) fail('backstage must be marked as a security row');
  if (!/identical to scheduled/i.test(backstage.viewer)) {
    fail('backstage must state that the viewer surface is identical to scheduled');
  }
  const scheduled = D.STATES.find((s) => s.state === 'scheduled');
  if (backstage.moment !== scheduled.moment) {
    fail(`backstage resolves to "${backstage.moment}" and scheduled to "${scheduled.moment}". `
      + 'Two different moments means the surface CAN tell them apart, and the rule is broken.');
  }

  // 5. Nothing promises a replay unconditionally, because processing can fail back to ended.
  const processing = D.STATES.find((s) => s.state === 'processing');
  if (!/fail BACK to ended/i.test(processing.note || '')) {
    fail('the processing row must record that it can fail back to ended');
  }
  D.STATES.forEach((s) => {
    if (/replay will appear|replay is published\b(?!.*if)/i.test(s.viewer)) {
      fail(`state ${s.state} promises a replay unconditionally`);
    }
  });

  // 6. The never-zero rule keeps its nuance. Collapsing it into "never show 0" would be wrong:
  //    a genuine zero is a real, correct reading.
  const measurement = D.CONDITIONS.find((c) => /measurement/i.test(c.condition));
  if (!/about unmeasurable, not\s*about zero/i.test(measurement.detail)) {
    fail('the measurement row must keep the distinction between unmeasurable and zero');
  }

  return D.TOTALS;
}

function markdown() {
  const T = D.TOTALS;
  const out = [];
  const p = (s) => out.push(s);

  p('# DOC 19 - Colaberry Live state matrix');
  p('');
  p(`**${T.states} editorial states x ${T.surfaces} surfaces** - every cell decided, and every `
    + 'row naming the test that proves it.');
  p('');
  p(`Generated from \`scripts/artifacts/tickets/l19StateMatrixData.js\`. **Do not hand-edit** - `
    + 'the build reads the state list out of the state machine and refuses if a state has no '
    + 'treatment, and opens each named test file and refuses if the named test is not there.');
  p('');
  p('## Why each row names a test');
  p('');
  p('A state matrix is the easiest document in this repository to write as fiction. Every cell is '
    + 'a sentence about behavior, nothing forces the behavior to match, and it stays plausible '
    + 'for months after the code moves. P1-07 asked for this document and never got one; DOC 18 '
    + 'recorded the sharper version of the gap, that **no test asserted what a viewer actually '
    + 'sees**.');
  p('');
  p('So a row that cannot name a passing test is a row describing an intention, and the build '
    + 'treats it as a failure rather than printing it.');
  p('');
  p('## The four surfaces');
  p('');
  p('| Surface | Who | Where |');
  p('|---|---|---|');
  p('| Presenter | whoever is teaching | Class Kit, projected |');
  p('| Phone | the room | `/portal/live/:id/companion` |');
  p('| Producer | staff, not the presenter | `/portal/live/:id` |');
  p('| Viewer | remote, often not signed in | `/portal/live/:id`, public |');
  p('');
  p('## The matrix');
  p('');
  p('`moment` is what the server resolves the state to, and it is the whole of what the viewer '
    + 'surface receives. **Two states sharing a moment are indistinguishable downstream** - which '
    + 'is the mechanism behind the backstage rule rather than a convention anyone has to '
    + 'remember.');
  p('');
  p('| State | Moment | Presenter | Phone | Producer | Viewer |');
  p('|---|---|---|---|---|---|');
  D.STATES.forEach((s) => {
    p(`| \`${s.state}\`${s.security ? ' **(security)**' : ''} | \`${s.moment}\` | `
      + `${cell(s.presenter)} | ${cell(s.phone)} | ${cell(s.producer)} | ${cell(s.viewer)} |`);
  });
  p('');
  p('### Rows with something to say beyond the cells');
  p('');
  D.STATES.filter((s) => s.note).forEach((s) => {
    p(`- **\`${s.state}\`** - ${s.note}`);
  });
  p('');
  p('### The one row that is a security property');
  p('');
  p('`backstage` is the staff rehearsal state: the producer can see the program picture. A viewer '
    + 'who could tell it from `scheduled` would know when staff were in the room, which is exactly '
    + 'what the state was designed to avoid.');
  p('');
  p('It holds in two places, and both are tested. The resolver maps both states to the same '
    + 'moment, so the surface never receives anything that could distinguish them; and the waiting '
    + 'copy is asserted to carry no staff vocabulary, because the only way this screen can leak is '
    + 'by saying something it should not.');
  p('');
  p('> The first version of that second test rendered `not_started` twice and asserted the two '
    + 'were byte-identical. That compares the state to itself and proves nothing - adding "(staff '
    + 'are in the room)" to the copy passed it. A mutation found it. A matrix row backed by a '
    + 'vacuous test is worse than one backed by none, because it reads as covered.');
  p('');
  p('## Conditions that are not states');
  p('');
  p('Kept separate deliberately. Conflating the two is how a twelve-row table came to describe a '
    + 'machine with eight states: half its rows were scenarios.');
  p('');
  D.CONDITIONS.forEach((c) => {
    p(`### ${c.condition}`);
    p('');
    p(`**${c.rule}**`);
    p('');
    p(c.detail);
    p('');
  });
  p('## Where each row is proved');
  p('');
  p('| State | Test |');
  p('|---|---|');
  D.STATES.forEach((s) => {
    p(`| \`${s.state}\` | \`${s.provenIn.file}\` - "${cell(s.provenIn.test)}" |`);
  });
  p('');
  return out.join('\n');
}

module.exports = { selfCheck, markdown, machineStates };
