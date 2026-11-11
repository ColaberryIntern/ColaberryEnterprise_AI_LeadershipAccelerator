/**
 * promptBuilder - the thing a click puts on the clipboard.
 *
 * WHAT THIS IS FOR
 *
 * Ali clicks a list on the board and pastes. Whatever lands in the session has to be the entire
 * briefing, because there is no second round: he is looking at a picture, clicking, and moving on.
 * So the prompt carries four things a session would otherwise spend its first twenty minutes
 * assembling:
 *
 *   1. WHAT the list is, measured - size, state, phase, spearhead, how dead it is
 *   2. HOW to get more - the exact queries and scripts, so no part of it is a guess
 *   3. WHAT to decide - the real options with their consequences, not a vague "triage this"
 *   4. WHAT to produce - a branded HTML report, opened when it is done
 *
 * WHY IT IS LONG, DELIBERATELY
 *
 * Every short prompt this system has produced came back with questions. The expensive thing is
 * not tokens, it is a round trip through a human who has already moved on to the next thing. A
 * prompt that is three screens long and needs no reply beats one that is four lines and needs
 * three.
 *
 * Pure: (listSummary, context) -> string. No I/O.
 */

const BRAND = {
  cherry: '#FB2832',
  cherryDeep: '#C20E1E',
  cherryBg: '#FFF0F1',
  leaf: '#77BB4A',
  ink: '#2d3748',
  inkLight: '#718096',
  line: '#e2e8f0',
};

/** The measured facts. Nothing inferred, and anything unknown is said to be unknown. */
function factsBlock(s) {
  const L = [];
  L.push(`LIST: ${s.key}`);
  if (s.position) L.push(`  Phase ${s.position} of a numbered programme. The other phases are siblings; the programme may be live or dead as a whole.`);
  L.push(`  ${s.total} task(s) assigned to Ali: ${s.live} live, ${s.dormant} dormant (overdue by more than 60 days).`);
  if (s.oldestDue) L.push(`  Oldest due date in the list: ${s.oldestDue}${s.newestDue ? `; newest: ${s.newestDue}` : ''}.`);
  if (s.generatedShare != null) {
    const pct = Math.round(s.generatedShare * 100);
    L.push(`  ${pct}% carries a machine-generated signature (a "Type:"/"Done when:" description, a`
      + ` [BUILD]/[BREAK]/[HARDEN] prefix, or the task-split emoji).`
      + (pct >= 60 ? ' At this level treat it as scaffolding until proven otherwise.' : ''));
  }
  if (s.humanShare != null) {
    const pct = Math.round(s.humanShare * 100);
    L.push(`  ${pct}% is marked as needing a person (a filing, a signature, a decision, a payment).`
      + (pct >= 50 ? ' The leverage here is delegation, not automation.' : ''));
  }
  if (s.lead) {
    L.push(`  SPEARHEAD (most urgent live task, or the oldest if all dormant):`);
    L.push(`    ${s.lead.title}`);
    if (s.lead.id) L.push(`    id ${s.lead.id}${s.lead.dueOn ? `, due ${s.lead.dueOn}` : ''}`);
  }
  return L.join('\n');
}

/** Exactly how to get more, so nothing in the analysis has to be guessed. */
function accessBlock(s) {
  return `HOW TO GET THE REST OF IT

All of this runs inside the accelerator-backend container, where the database credentials live.

  # every task in this list, with its full description
  docker exec -w /app accelerator-backend node -e "
    const {sequelize}=require('/app/dist/config/database');
    const {QueryTypes}=require('/app/node_modules/sequelize');
    sequelize.query(\\\`SELECT bc_id, title, due_on, is_dismissed, description
      FROM ops_bc_todos WHERE todolist_name = :l AND status='active'
       AND assignee_ids::text LIKE '%17454835%' ORDER BY due_on\\\`,
      {type:QueryTypes.SELECT, replacements:{l:${JSON.stringify(s.key)}}})
      .then(r=>{console.log(JSON.stringify(r,null,2));process.exit(0)});"

  # the board and the machine-readable bundle, rebuilt from live data
  node scripts/ataTriageBoard.js --out /tmp/triage.html --days 60 --limit 3000

  # one ticket, claimed so no other tab takes it
  node scripts/ataWorkTask.js --task <projectId>/<todoId> --holder "<your tab>"

  # a batch of the ones needing nobody
  node scripts/ataWorkBatch.js --top 5 --holder "<your tab>"

Facts worth knowing before you read the data:
  - ops_bc_todos is a MIRROR of Basecamp. bc_id and project_id are VARCHAR, not integers.
  - due_on is back-dated on gov projects; due_baseline_on holds the real date where it exists.
  - dismissed_reason is VARCHAR(40). A short code, with the rationale recorded elsewhere.
  - 'Dismissed' means removed from Ali's queue ONLY. The ticket stays open in Basecamp and
    anyone else assigned still sees it. Never describe a dismissal as a closure.
  - last_human_action_at, ai_opportunity_score and downstream_blocked_count are all EMPTY in
    production. Do not build an argument on them.`;
}

/** The decision, with real options rather than an instruction to "triage". */
function optionsBlock(s) {
  const allDormant = s.dormant === s.total && s.total > 0;
  const mostlyGenerated = (s.generatedShare || 0) >= 0.6;
  const mostlyHuman = (s.humanShare || 0) >= 0.5;

  const opts = [];
  if (allDormant && mostlyGenerated) {
    opts.push(`A. DISMISS THE LIST. Every task is dormant and most of it is machine-generated.
     node scripts/ataListAction.js --list ${JSON.stringify(s.key)} --dismiss --reason "<=40 chars"
     Dry run first. Reversible. Does not touch Basecamp.`);
  }
  if (allDormant && !mostlyGenerated) {
    opts.push(`A. RE-DATE THE LIST AS A BLOCK. It is dormant but hand-authored, so the dates are
     wrong rather than the work.
     node scripts/ataListAction.js --list ${JSON.stringify(s.key)} --redate-from <YYYY-MM-DD> --per-week 3
     Spreads across working days in the order the tasks were originally promised.
     NOTE: this writes to Basecamp, so the script plans it and refuses to apply. Hand Ali the plan.`);
  }
  if (!allDormant && s.dormant > 0) {
    opts.push(`A. SPLIT IT. Work the ${s.live} live; re-date or dismiss the ${s.dormant} dormant.
     One decision for each half beats one decision for the list.`);
  }
  if (mostlyHuman) {
    opts.push(`B. DELEGATE THE LIST. Most of it needs a person, so the leverage is an owner, not a
     session. --assign adds an owner and KEEPS existing assignees, so nobody loses work.`);
  } else if (s.total >= 5) {
    opts.push(`B. RUN IT UNATTENDED. Little or none of it needs a person.
     node scripts/ataWorkBatch.js --top 5 --holder "<tab>" --list ${JSON.stringify(s.key)}`);
  }
  opts.push(`C. WORK THE SPEARHEAD ONLY. Leave the list decision for later and move the one thing
     that matters most today.`);
  opts.push(`D. SOMETHING ELSE. If the evidence points somewhere none of the above covers, say so
     and say why. The options above are derived from counts, and counts do not know the business.`);

  return `THE DECISION

${opts.join('\n\n')}

Recommend ONE, with the evidence for it. Do not apply anything destructive without showing Ali the
dry run first and getting a yes.`;
}

/** What to produce. The report is the deliverable, not a chat answer. */
function deliverableBlock(s) {
  return `WHAT TO PRODUCE

A single self-contained HTML file, written to disk and OPENED in the browser as soon as it is
done. Not a chat summary: Ali is deciding from a picture.

  Open it with:  Start-Process <path>    (PowerShell)  or  xdg-open/open <path>

It must contain, in this order:

  1. A verdict line at the top. What you recommend, in one sentence, before any evidence.
  2. The story of this list: what it is FOR, what it was meant to achieve, when it was created,
     what has happened since, and why it is in the state it is in. Read the task descriptions to
     get this - do not infer it from the list name alone.
  3. Where it stands now, as VISUALS rather than paragraphs:
     - a gauge or progress arc for how much is live vs dormant
     - a bar chart of tasks by age band (not due / overdue / aging / dormant)
     - a timeline or Gantt-style strip of the due dates, so the shape of the schedule is visible
     - a comparison against the backlog as a whole, so "is this bad" has an answer
     - a Mermaid diagram where structure matters: the phase sequence, or dependencies
  4. The options, each as a card: what it means, what it costs, what it affects, and the exact
     command. Make the recommended one visually dominant.
  5. What happens next once the option is chosen.

BRANDING. This is Colaberry. Use these values, not generic chart colours:

  --cherry      ${BRAND.cherry}   primary, headings, the recommended option
  --cherry-deep ${BRAND.cherryDeep}   pressed and active states
  --cherry-bg   ${BRAND.cherryBg}   tinted backgrounds
  --leaf        ${BRAND.leaf}   positive progress
  --ink         ${BRAND.ink}   body text
  --ink-light   ${BRAND.inkLight}   secondary text
  --line        ${BRAND.line}   borders

  Font: 'Segoe UI', system-ui, -apple-system, sans-serif. Headings 700 weight.
  Define the colours as CSS custom properties on :root and redefine them under
  @media (prefers-color-scheme: dark) guarded by :root:not([data-theme="light"]).
  Give body an explicit background. The page must work at phone width.

RULES THAT ARE NOT NEGOTIABLE

  - Every number on the page must come from a query you actually ran. If you could not measure
    something, say "not measured" rather than estimating it.
  - Conditional formatting must encode something real. Colour by state, never by rank.
  - Charts carry direct labels and a text alternative. A chart nobody can read is decoration.
  - Say what you did NOT check. An analysis that lists its own blind spots is worth more than one
    that implies it has none.`;
}

/**
 * Build the whole prompt.
 * @param {object} s a list summary from listLens
 * @param {{category?:{label:string}, totals?:{tasks:number,lists:number,dormant:number}}} ctx
 */
function buildListPrompt(s, ctx = {}) {
  const head = `Work the backlog list below. Decide what happens to it as a whole, then produce a
branded HTML report and open it.

You are working in the Colaberry Enterprise AI Accelerator repo. The backlog lives in the
ops_bc_todos mirror of Basecamp. Ali is the assignee on everything here.`;

  // A zero-task total would print "Infinity%"; say nothing rather than something false.
  const context = ctx.totals && ctx.totals.tasks > 0
    ? `\nCONTEXT: Ali's whole queue is ${ctx.totals.tasks} active task(s) across ${ctx.totals.lists}`
      + ` list(s), ${ctx.totals.dormant} of them dormant. This list is`
      + ` ${Math.round((s.total / ctx.totals.tasks) * 100)}% of that.`
      + (ctx.category ? ` It sits under "${ctx.category.label}".` : '')
    : '';

  return [
    head + context,
    '',
    factsBlock(s),
    '',
    accessBlock(s),
    '',
    optionsBlock(s),
    '',
    deliverableBlock(s),
    '',
    `Start by reading every task description in this list. The descriptions are the only rich
signal in this data - they average 648 characters and carry the author's own framing, including
"Source of truth", "Decide by", "Required skill" and "Done when" where they exist.`,
  ].join('\n');
}

module.exports = { buildListPrompt, factsBlock, accessBlock, optionsBlock, deliverableBlock, BRAND };
