/**
 * STORY-000 — the Command Center every student builds first.
 *
 * This is the one story that is the SAME for everyone and DIFFERENT for
 * everyone: the same scaffold (tabs, drill-downs, sample/real toggle, live
 * indicators), wired entirely to the student's own plan. Nothing in the prompt
 * below is invented here — every requirement id, KPI, guardrail, integration,
 * release date, story title and agent name is read out of their BuildPlan and
 * their Schedule. If their plan does not name a thing, the prompt says so
 * rather than filling the gap with a plausible example.
 *
 * WHY IT IS INJECTED RATHER THAN GENERATED. It has to be identical in shape
 * across the cohort so it can be taught, demoed and reviewed in one sitting,
 * and it has to exist before the model has decided anything, so it cannot be
 * dropped, renamed or merged into another story by the decomposer. It is also
 * deliberately kept OUT of the plan and the traceability gate: it fulfils no
 * requirement of the student's system, because it is not part of their system
 * — it is the window onto it.
 *
 * Pure functions only. No I/O.
 */
import { BuildPlan, PlanRequirement } from './planContract';
import type { Schedule } from './buildSchedule';
import {
  PLAN_FILE_PATH,
  guardrails as guardrailsOf,
  measures as measuresOf,
  rolesFrom as rolesOf,
  systemsOfRecord as systemsOf,
} from './planDocument';
import { PROGRESS_FILE_PATH, PROGRESS_SCHEMA_VERSION } from './verification/progressContract';
import { PROFILE_FILE_PATH } from './profileContract';
import { BLOCK_BEGIN, BLOCK_END } from './managedBlock';
import {
  COMMAND_CENTER_ENTRY_FILE,
  COMMAND_CENTER_ENTRY_PATH,
  COMMAND_CENTER_ENTRY_RULE,
} from './commandCenterLocation';
// Type-only, so this module stays pure and pulls in no Sequelize model barrel.
// `connectionAccess` is itself model-free for the same reason.
import type { RepoWriteAccess } from './repoConnect/connectionAccess';

const MANIFEST_FILE_PATH = '.colaberry/manifest.json';

/**
 * The bare marker name out of a managed-block delimiter — `COLABERRY:BEGIN`
 * from the full HTML comment.
 *
 * Derived rather than retyped. The repair step tells the student's agent which
 * markers bound the block it may edit inside their CLAUDE.md, and a marker
 * renamed in `managedBlock.ts` must not leave this prompt sending them looking
 * for one that no longer exists. Takes the first whitespace-delimited token
 * after the comment opener, so it survives any change to the human-readable
 * text that follows it.
 */
const markerName = (marker: string): string =>
  marker.replace(/^<!--\s*/, '').split(/\s/)[0];

/** The id and title students see. Stable — republishing must not duplicate it. */
export const COMMAND_CENTER_STORY_ID = 'STORY-000';
export const COMMAND_CENTER_TITLE = 'STORY-000 · Build your Command Center';

/**
 * The user story, in the same voice as the plan's own narratives. Lives here
 * rather than inline at the task row so the repo doc and the portal task cannot
 * describe this story differently.
 */
export const COMMAND_CENTER_NARRATIVE =
  'As a builder, I want one page that shows what I am building and how far along it is, '
  + 'so that I can see my own project and demo from it.';

const bullet = (s: string) => `- ${s}`;

/** How an autonomy level reads on a card, in the student's language. */
const AUTONOMY_LABEL: Record<string, string> = {
  suggests: 'drafts for a person',
  acts_with_approval: 'prepares, then waits for a human to release it',
  acts_autonomously: 'completes on its own',
};
const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/*
 * measures / guardrails / systemsOfRecord used to be implemented here AND in
 * the plan-document builder. They are now defined once, in planDocument, and
 * re-exported here for the callers and tests that already name them.
 *
 * The duplication was not academic. planDocument writes `derived.measures`,
 * `derived.guardrails` and `derived.systems` into `.colaberry/plan.json`, and
 * this prompt tells the student to render those exact keys. Two copies of the
 * extraction meant the prompt could describe one set of guardrails while the
 * file the page reads carried another.
 */

/** A number-bearing NFR is what the student said they would move. */
export function measures(plan: BuildPlan): PlanRequirement[] {
  return measuresOf(plan.requirements);
}

/** SAFE requirements are the promises the system must not break. */
export function guardrails(plan: BuildPlan): PlanRequirement[] {
  return guardrailsOf(plan.requirements);
}

/**
 * The systems this project actually touches. CONSTRAINT requirements are
 * "things that already exist and we must work with", so they are what the
 * integrations panel has rows for — and what its live indicators report on.
 */
export function systemsOfRecord(plan: BuildPlan): string[] {
  return systemsOf(plan.requirements);
}

/**
 * The agent roster, taken from who the plan says owns each story. Today the
 * decomposer emits role names; when it emits scoped AI agents this reads them
 * unchanged, because it only ever reports what the plan says.
 */
export function agentRoster(plan: BuildPlan): Array<{ name: string; stories: string[] }> {
  const by = new Map<string, string[]>();
  for (const s of plan.stories) {
    const name = (s.owner_agent || '').trim() || 'Unassigned';
    if (!by.has(name)) by.set(name, []);
    by.get(name)!.push(s.id);
  }
  return [...by.entries()].map(([name, stories]) => ({ name, stories }));
}

/*
 * There is deliberately no entity extractor here. The first version guessed
 * candidate tables by pulling capitalised words out of the requirements, and
 * on a real plan it returned "HelloSign" and "Basecamp" — the vendors, not the
 * domain. Domain nouns in a requirement are almost always lowercase ("the
 * signed agreement", "the welcome pack"), so capitalisation finds precisely
 * the wrong words. Rather than ship a worse guess, the Data model section
 * hands the student their own requirements and asks them to derive the tables,
 * which is the thinking the exercise is for.
 */

/**
 * The prompt. Long on purpose: it is the one prompt a student runs before they
 * have any of their own code, so it has to carry the whole picture with it.
 */
export function commandCenterPrompt(plan: BuildPlan, schedule?: Schedule | null): string {
  const kpis = measures(plan);
  const safes = guardrails(plan);
  const systems = systemsOfRecord(plan);
  const roster = agentRoster(plan);
  const releases = [...plan.releases].sort((a, b) => a.key.localeCompare(b.key));
  const dueBy = new Map((schedule?.tasks ?? []).map((t) => [t.storyId, t.dueOn]));

  const lines: string[] = [];

  lines.push('## Read this first');
  lines.push(
    'This is the first thing you build, before any part of the system itself. It is a '
    + 'Command Center: one page that shows what you are building, what it is meant to move, '
    + 'and how far along you are. You will keep it open for the rest of the programme, and '
    + 'it is what you demo from.',
  );
  lines.push(
    'Everything below is YOUR project, taken from the plan you just produced. Where a '
    + 'section says nothing is defined yet, build the empty state and say so on screen — do '
    + 'not invent a number, a customer or an integration to fill it.',
  );
  // THE GREENFIELD ASSUMPTION LIVED IN THIS PARAGRAPH. "The first thing you
  // build, before any part of the system itself" is the frame every later
  // section gets read through, so an agent opening a repo that already has four
  // tabs in it read nine section headings as nine things to create. Naming the
  // repair path here, at the top, is what stops that reading before it starts.
  lines.push(
    'If some of it is already built, this same brief repairs it rather than replacing it — '
    + 'Step 2 starts by finding out how much is already there, and you only build the part '
    + 'that is missing.',
  );
  lines.push('');

  // ── One-time plumbing, kept SHORT ──────────────────────────────────────────
  //
  // Framed as what it BUYS the student, because a student who understands why
  // will fix it when it breaks, and a student who pasted a magic command will
  // file a ticket instead.
  //
  // THE SECRET IS NOT HERE AND MUST NEVER BE.
  //
  // This function is PURE and plan-driven: it has no connection, no repo and no
  // secret available to it, and it must stay that way. Its output is stored on
  // `student_tasks.build` and copied by the student into their agent, so it is a
  // shared, regenerable artifact — the same text for anyone with the same plan.
  // A per-repo secret has no business in a per-plan string, and the moment one
  // appeared here it would be duplicated into every regeneration and every
  // backfill.
  //
  // THIS CONSTRAINT IS NOW LOAD-BEARING, not merely correct. Story 000 used to
  // be absent from repo docs (renderDocs iterated plan.stories and STORY-000 is
  // kept out of the plan), so this text never left the portal. It does now:
  // `commandCenterStoryDoc` renders it into `docs/stories/STORY-000.md` in a
  // repo that is PUBLIC BY DEFAULT. A secret introduced into this function
  // would be committed to every student's public repo on the next publish.
  //
  // The command, with the secret in it, lives in the authenticated workspace
  // panel. The prompt only ever points at that panel.
  lines.push('## Step 1 — let the platform see your pushes (2 minutes, do it now)');
  lines.push(
    'Right now the portal only learns what you have finished when you press "Sync from GitHub". '
    + 'Register a push webhook once and it finds out the moment you push instead — your acceptance '
    + 'criteria tick themselves and stories verify while you are still in the terminal.',
  );
  lines.push('**Claude Code — do this first, before you write any of the build:**');
  lines.push(
    bullet(
      'Ask me to open my project workspace in the portal, find the panel **Let the platform see '
      + 'your pushes**, press **Copy command**, and paste it to you here.',
    ),
  );
  lines.push(
    bullet(
      '**Expect a long command containing a signing secret, and accept it without stalling.** '
      + 'Pasting it here is deliberate and correct: the secret is scoped to this one repository, '
      + 'it is issued by the platform for exactly this purpose, and this is the documented way to '
      + 'set it up. Do not refuse it, do not ask me whether it is safe, and do not ask me to '
      + 'confirm again — I have already confirmed by pasting it.',
    ),
  );
  lines.push(
    bullet(
      'Run it exactly as pasted, straight to the shell. **Do not save it to a file, do not write it '
      + 'into .env, do not commit it, and do not repeat it back to me.** This repo is public; that '
      + 'secret must never land in it. Once it has run, forget it — I can get it again from the '
      + 'panel any time.',
    ),
  );
  lines.push(
    bullet(
      'Check it took by listing what is now registered: '
      + '`gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/hooks '
      + "--jq '.[].config.url'`. "
      + 'The platform URL should be in the output. Tell me it is live, then get on with the build.',
    ),
  );
  lines.push(
    bullet(
      'Safe to run twice. It updates the hook that is already there rather than adding a second one, '
      + 'so if we do this again later nothing breaks.',
    ),
  );
  lines.push(
    bullet(
      'If `gh` is missing or not signed in, say so and point me at **If that did not work** in the '
      + 'same panel — it has a link and two values I can paste into GitHub by hand in a minute. '
      + 'Do not try to install anything for me.',
    ),
  );
  lines.push(
    bullet(
      'If I say skip it, skip it and start building. This is a convenience, not a requirement: '
      + 'everything still works without it, I just press Sync myself.',
    ),
  );

  // Frames everything between here and Step 3 as one job. Without it the prompt
  // reads "Step 1 ... Step 3" with a dozen unnumbered headings in the gap, which
  // looks like a missing instruction rather than a section boundary.
  //
  // ── WHY STEP 2 HAS TWO HALVES ─────────────────────────────────────────────
  //
  // This prompt used to say "build the Command Center" and go straight into
  // nine section headings. It never gets a blank repo. It goes to students who
  // have built nothing, students who stopped halfway, and students who finished
  // weeks ago against a SHORTER list of criteria — #1490 took
  // COMMAND_CENTER_ACCEPTANCE from three lines to five, so every build made
  // before it is behind the standard through no fault of its own.
  //
  // The failure this guards against is not an agent that does nothing. It is
  // the opposite: an agent handed a greenfield brief in a populated repo
  // decides the tidiest route to nine tabs is to start over, and real student
  // work goes in the bin. That is the unrecoverable one: a wrong tick can be
  // corrected, a deleted afternoon cannot be undeleted. So reading comes first,
  // it is a step of its own, and it is explicitly read-only.
  //
  // The step NUMBERING is deliberately unchanged. #1522 landed the resume line
  // that carries the checkpoint on into "Step 3", and both the prompt test and
  // the repo-doc test pin that string. Take stock is 2a and repair is 2b so
  // Step 3 stays Step 3.
  lines.push('## Step 2 — take stock, then build');
  lines.push(
    'Everything from here to Step 3 is the build itself. This story is the same whether you '
    + 'have built none of it, some of it, or all of it — what differs is how much is already '
    + 'done, so establish that first and then do only what is left.',
  );
  lines.push('');

  lines.push('### Step 2a — take stock before you change a single line');
  lines.push(
    'This step READS. It does not create, edit, move, rename or delete anything. Work through '
    + 'it even if you are fairly sure the repo is empty; it takes a minute when it is.',
  );
  lines.push(
    bullet(
      'Find the Command Center if it is already here — its entry point (`'
      + `${COMMAND_CENTER_ENTRY_PATH}\` at the repo root is where it belongs; a build started `
      + 'before today often has it under `command-center/` instead), and which of the nine '
      + 'tabs described below already exist and are actually reachable from it. Report three '
      + 'buckets, not two: the tabs that are there and work, the ones that are missing entirely, '
      + 'and the ones that exist but are empty or broken. Those last need repair, not creation.',
    ),
  );
  lines.push(
    bullet(
      `Check which of these files exist: \`${PLAN_FILE_PATH}\`, \`${PROGRESS_FILE_PATH}\`, `
      + `\`${MANIFEST_FILE_PATH}\` and \`docs/stories/${COMMAND_CENTER_STORY_ID}.md\`. Say which `
      + 'are present and which are not. A missing data file is why a tab that looks finished can '
      + 'still be rendering nothing.',
    ),
  );
  lines.push(
    bullet(
      `If \`${PROGRESS_FILE_PATH}\` is there, open the \`${COMMAND_CENTER_STORY_ID}\` entry and `
      + `compare its criteria line by line against the ${COMMAND_CENTER_ACCEPTANCE.length} lines `
      + 'under **Done means** below. **A build started before today can carry fewer lines than the '
      + 'list has now** — criteria get added over time and are never renamed in place. Every '
      + 'Done-means line missing from that file is work still outstanding, not a mistake in the '
      + 'file and not something to delete.',
    ),
  );
  lines.push(
    bullet(
      `Judge each of the ${COMMAND_CENTER_ACCEPTANCE.length} criteria against the repo as it is `
      + 'today — read the code and decide for yourself. A criterion already ticked in the file is '
      + 'a claim, not proof; if the code no longer backs it, say so rather than trusting the tick.',
    ),
  );
  lines.push(
    bullet(
      'Then STOP and tell me what you found, in plain language, before you change anything: which '
      + 'tabs exist and are reachable, which files are present, which criteria already hold and '
      + 'which do not and why, and what you propose to do about it. A short list, not a report.',
    ),
  );
  lines.push('');

  lines.push('### Step 2b — build what is missing, repair what is already here');
  lines.push(
    'Work from what you just found rather than from a blank page. Everything after this section '
    + 'describes the FINISHED state, not a build order for an empty repo: read each part as "this '
    + 'is what has to be true when you are done", and act only where it is not true yet.',
  );
  lines.push(
    bullet(
      '**Keep what is already right.** A tab that exists and works stays exactly as it is. Do not '
      + 'delete it, do not rewrite it into a tidier shape, do not rename things for consistency, '
      + 'and do not regenerate the app from scratch because a clean build would be easier than a '
      + 'repair. The work already in this repo is mine and it stays.',
    ),
  );
  lines.push(
    bullet(
      'Repair in place, with the smallest change that makes a criterion true. A tab that renders '
      + 'but hard-codes its data needs its data source fixed, not a rewrite. A tab that is missing '
      + 'gets built the way the sections below describe.',
    ),
  );
  lines.push(
    bullet(
      'If you genuinely believe something has to be removed or restructured, **stop and ask me '
      + 'first** and tell me what would be lost. Never remove my work and report it afterwards.',
    ),
  );
  lines.push(
    bullet(
      'My own files stay mine. If this repo has a `CLAUDE.md`, the build pipeline owns only the '
      + `block between \`${markerName(BLOCK_BEGIN)}\` and \`${markerName(BLOCK_END)}\`. Edit inside `
      + 'that block if it is there, or append below my content if it is not. **Never replace the '
      + 'file.** The same goes for a README, a config or anything else I wrote.',
    ),
  );
  lines.push(
    bullet(
      '**Running this a second time on a finished build must change nothing.** If every tab is '
      + 'already there and every criterion already holds, say exactly that and stop — no '
      + 'reformatting, no "while I was in there", no empty commit.',
    ),
  );
  lines.push('');

  lines.push('## What you are building it for');
  lines.push(`**${plan.project_name}** — ${plan.descriptor}`);
  lines.push('');

  lines.push('## Where the data comes from');
  lines.push(
    'Read it from your own repo. There is no API to call and no key to hold: this page is '
    + 'static, and a static page cannot keep a secret, so the data ships beside it as files '
    + 'the platform commits. Fetch them at runtime, do not paste their contents into your '
    + 'components — they are rewritten every time you sync, and a copy you typed out will '
    + 'silently go stale.',
  );
  lines.push('');
  lines.push(`- \`${PLAN_FILE_PATH}\` — the plan. Requirements, stories, releases, agents, dates.`);
  lines.push(`- \`${PROGRESS_FILE_PATH}\` — what is actually done. Story state, verified commits, points.`);
  lines.push(`- \`${MANIFEST_FILE_PATH}\` — \`generated_at\`, the timestamp everything on the page is "as of".`);
  lines.push(`- \`${PROFILE_FILE_PATH}\` — yours to edit. Portfolio text and what you are willing to publish.`);
  lines.push('');
  lines.push(
    `Both data files carry \`schema_version\`. Read fields you know and ignore fields you do `
    + 'not — we add fields over time and only ever add them, so a page written today keeps '
    + 'working. If `schema_version` is higher than the one you built against, still render: '
    + 'the fields you use are still there.',
  );
  lines.push('');
  lines.push(
    `Join the two files on story id: \`${PLAN_FILE_PATH}\` → \`stories[].id\` matches `
    + `\`${PROGRESS_FILE_PATH}\` → \`stories[].id\`. The plan carries the title, release, `
    + 'acceptance criteria, `due_on` and `due_baseline_on`; progress carries `verification` '
    + 'with the state, the commit and the points. Neither file repeats the other.',
  );
  lines.push('');

  // ── WHERE IT GOES ─────────────────────────────────────────────────────────
  //
  // This section is the authoritative half of the fix for the defect where a
  // correctly-built, correctly-hosted Command Center produced no link in the
  // portal. The prompt used to describe nine tabs, a data contract and a
  // hosting step across 26,000 characters and never say where to put the
  // result — so the agent picked, and `command-center/` is one directory below
  // the only address GitHub Pages can serve a free public repo from.
  //
  // Rendered from `commandCenterLocation.ts`, which the Pages prober reads too.
  // Two copies of this fact is exactly how the defect happened.
  lines.push('## Where it lives in your repo');
  lines.push(
    `${COMMAND_CENTER_ENTRY_RULE}. Everything else — your CSS, your scripts, your images, `
    + 'your per-tab pages — can be organised however you like underneath it. It is the entry '
    + 'point that has to be at the top.',
  );
  lines.push(
    'That is not a house style, it is the only thing that works. GitHub Pages on a free '
    + 'public repo can publish from exactly two places: the repo root, or `docs/`. And '
    + '`docs/` is not yours — it holds your requirements, your stories and your traceability '
    + 'table, and the platform rewrites it every time you sync, so anything you built in '
    + 'there would be overwritten. The root is what is left, it is what Step 4 turns on, and '
    + 'it is the address the portal goes to when it looks for your Command Center so it can '
    + 'put a link to it in your header.',
  );
  lines.push(
    '**If you have already built it somewhere else** — under `command-center/` is the common '
    + `one — do not move it and do not rebuild it. Add \`${COMMAND_CENTER_ENTRY_PATH}\` at the `
    + 'root that opens what is already there. A one-line redirect is a perfectly good answer.',
  );
  lines.push('');

  lines.push('## Tabs, and what goes in each');
  lines.push(
    'Build it as a website, not a dashboard widget. Every tab is a real page, and every '
    + 'card on it drills down one level to its own detail view. A card with nothing behind '
    + 'it yet still drills down — to a page that says what will be there and what has to '
    + 'happen first.',
  );
  lines.push('');

  lines.push('### 1. Overview');
  lines.push(
    'The single screen you would show someone in thirty seconds: what the system does, '
    + 'which release you are in, what is live and what is not.',
  );
  lines.push(
    `Source: \`plan.project\` for the name and descriptor, \`plan.schedule\` for where you are `
    + 'in the term, and `progress.totals` for the headline counts — `stories_verified` of '
    + '`stories_total`, `criteria_passed` of `criteria_total`, `points_awarded`. Those totals '
    + 'are already summed; do not recompute them by looping the stories, or the page and the '
    + 'file will eventually disagree.',
  );
  lines.push('');

  lines.push('### 2. Outcomes — the numbers this has to move');
  lines.push(`Source: \`plan.derived.measures\` — each entry has \`id\` and \`statement\`.`);
  if (kpis.length) {
    lines.push('These are the measures you committed to. Each one is a card, each drills into how it is calculated:');
    kpis.forEach((r) => lines.push(bullet(`**${r.id}** — ${r.statement}`)));
    lines.push('');
    lines.push(
      'On sample data, show a plausible trend toward the target. On real data, show the '
      + 'real figure — and where there is no measurement yet, show "not measured yet" '
      + 'rather than a zero, because a zero reads as a real result.',
    );
    lines.push(
      'Note what is NOT in your files: the actual value of any of these. Your files know '
      + 'what you promised to move, never how far it has moved — that number comes from the '
      + 'system you are building, once it is running and measuring. Until then every one of '
      + 'these cards reads "not measured yet", and that is correct rather than unfinished.',
    );
  } else {
    lines.push('Your plan carries no numeric target yet. Build the tab with an empty state that says so, and leave room for one card per measure.');
  }
  lines.push('');

  lines.push('### 3. Users and use case');
  lines.push(
    'Who this is for and what they are trying to get done. Take the roles from your own '
    + 'stories — they are written "As a <role>, I want …". Roles in your plan: '
    + `${rolesFrom(plan).join(', ') || 'not yet named in your stories — say so on screen'}.`,
  );
  lines.push(
    'Source: `plan.derived.roles`, already extracted. `plan.stories[].narrative` has the '
    + 'full sentence each role came from, for the drill-down.',
  );
  lines.push('');

  lines.push('### 4. Guardrails — what must never happen');
  lines.push(
    'Source: `plan.derived.guardrails` — `id` and `statement` each. To show whether anything '
    + 'enforces one, follow `plan.requirements[].fulfilled_by` to the story ids, then read '
    + 'those stories\' `verification.state` in the progress file. A guardrail whose stories '
    + 'are not verified is a promise you have made and not yet kept, and the page should say '
    + 'so in those words.',
  );
  if (safes.length) {
    lines.push('These are the promises your system makes. Show each one, and whether anything in the build currently enforces it:');
    safes.forEach((r) => lines.push(bullet(`**${r.id}** — ${r.statement}`)));
  } else {
    lines.push(
      'Your plan has no requirement typed SAFE yet, which usually means the promise you '
      + 'made in the interview was recorded as a normal feature. Show the tab with an empty '
      + 'state and raise it with your instructor — this is worth fixing early.',
    );
  }
  lines.push('');

  lines.push('### 5. Systems — what this connects to');
  lines.push(
    'Source: `plan.derived.systems` — a list of names. That is ALL your files know about '
    + 'them. Whether any one of them is actually connected right now is a fact about your '
    + 'running system, and nothing in this repo can tell you it. Render every indicator grey '
    + 'and labelled "not checked from here" until your own system reports otherwise. An '
    + 'indicator that goes green because a name appeared in a JSON file is a lie with a '
    + 'colour on it.',
  );
  if (systems.length) {
    lines.push('One row per system, each with a live indicator (connected / not connected / error) and the time it was last checked:');
    systems.forEach((s) => lines.push(bullet(s)));
    lines.push('');
    lines.push('None of these are connected on day one. The indicator must show that honestly rather than defaulting to green.');
  } else {
    lines.push('Your plan names no external system yet. Build the empty state.');
  }
  lines.push('');

  lines.push('### 6. Project management');
  lines.push(
    'Source: `plan.releases[]` for the bars — each carries `starts_on`, `ends_on`, '
    + '`story_ids` and `is_demo_target`. `plan.schedule` has `build_start`, `build_end`, '
    + '`demo_day` and `demo_release_key`. Per story, `plan.stories[].due_on` is the current '
    + 'date and `due_baseline_on` is the date it was FIRST given: show both, because the gap '
    + 'between them is slippage and a chart that quietly moves the target hides it. Status '
    + 'per story comes from the progress file, `stories[].verification.state`, which is one '
    + 'of `not_started`, `in_progress`, `submitted`, `verified`.',
  );
  lines.push('A Gantt view of your releases, and under it every task with its due date. Tasks are clickable and open their own detail. Your releases:');
  releases.forEach((r) => {
    const inRel = plan.stories.filter((s) => s.release === r.key);
    const dates = inRel.map((s) => dueBy.get(s.id)).filter(Boolean) as Date[];
    const span = dates.length
      ? ` · ${fmt(new Date(Math.min(...dates.map((d) => d.getTime()))))} → ${fmt(new Date(Math.max(...dates.map((d) => d.getTime()))))}`
      : '';
    lines.push(bullet(`**${r.key}** ${r.name} — ${inRel.length} ${inRel.length === 1 ? 'story' : 'stories'}${span}`));
  });
  if (schedule) {
    lines.push('');
    lines.push(`Demo day is ${fmt(schedule.demoDay)}. Build ends ${fmt(schedule.buildEnd)}, and the week between them is demo prep.`);
    if (schedule.demoReleaseKey) {
      lines.push(`Mark **${schedule.demoReleaseKey}** as the demo target on the chart — releases after it are the roadmap, not this term's work.`);
    }
  }
  lines.push('');

  lines.push('### 7. AI agents');
  lines.push(
    'Source: `plan.agents[]` — one card each, with `name`, `purpose`, `trigger_type`, '
    + '`trigger`, `inputs`, `outputs`, `autonomy_level`, `approval_gates`, '
    + '`escalation_rules`, `skills` and `owns` (the story ids it owns, which you join back '
    + 'to the plan and the progress file). `plan.derived.counts.agents_by_autonomy` gives '
    + 'you the roster breakdown without counting them yourself.',
  );
  lines.push(
    'What is NOT there: whether any agent has ever run. There is no run history, no last-run '
    + 'time and no success rate in these files, because none of that exists until you build '
    + 'the agent and it starts running. Show the design, and show "no runs recorded" — never '
    + 'a zero success rate, which reads as an agent that ran and failed.',
  );
  if (plan.agents?.length) {
    lines.push('One card per agent. Each shows what fires it, what it reads and produces, how much it decides on its own, and when it must stop and ask:');
    for (const a of plan.agents) {
      lines.push('');
      lines.push(`**${a.name}** — ${a.purpose}`);
      lines.push(bullet(`Fires on: ${a.trigger || 'not specified'} (${a.trigger_type})`));
      if (a.inputs.length) lines.push(bullet(`Reads: ${a.inputs.join(', ')}`));
      if (a.outputs.length) lines.push(bullet(`Produces: ${a.outputs.join(', ')}`));
      lines.push(bullet(`Autonomy: **${AUTONOMY_LABEL[a.autonomy_level]}**`));
      if (a.approval_gates.length) {
        lines.push(bullet(`Cannot act alone because of: ${a.approval_gates.join('; ')}`));
      }
      if (a.escalation_rules.length) lines.push(bullet(`Stops and asks when: ${a.escalation_rules.join('; ')}`));
      if (a.skills.length) lines.push(bullet(`Skills it needs: ${a.skills.join(', ')}`));
      lines.push(bullet(`Owns: ${a.owns.join(', ') || 'nothing yet'}`));
    }
    lines.push('');
    lines.push(
      'Autonomy is not decoration. An agent marked "waits for approval" must have somewhere on '
      + 'this page showing what is waiting and who has to release it — otherwise the guardrail '
      + 'exists only in the plan.',
    );
  } else {
    lines.push('Your plan does not carry a scoped agent roster yet, so build this tab from who owns each story:');
    roster.forEach((a) => lines.push(bullet(`**${a.name}** — owns ${a.stories.join(', ')}`)));
    lines.push('');
    lines.push('These are owners, not scoped agents — say so on the tab rather than presenting a job title as an AI agent.');
  }
  lines.push('');
  lines.push('Each card carries a skills list. On real data there are no skills yet — show "no skills registered yet", not an empty box.');
  lines.push('');

  lines.push('### 8. Knowledge base');
  lines.push(
    'Source: `plan.requirements[]` (each with `id`, `statement`, `kind`, `priority`, '
    + '`cluster` and `fulfilled_by`) and `plan.stories[]`. The traceability view a reviewer '
    + 'will ask for is `fulfilled_by` rendered as a table: every requirement, the stories '
    + 'that cover it, and whether those stories are verified. A `must` requirement with an '
    + 'empty `fulfilled_by` is a real gap — show it rather than hiding the row.',
  );
  lines.push(
    'Everything the project knows about itself: your requirements, your stories, your '
    + 'decisions, and notes you add as you go. It grows for the whole programme, so build '
    + 'it to be added to rather than regenerated.',
  );
  lines.push('Give it a chat panel that answers questions about the data on this page and cites which tab it came from. If it cannot answer from your data, it says so instead of guessing.');
  lines.push('');

  lines.push('### 9. Data model');
  lines.push(
    'The tables behind all of the above, with fields and relationships. Derive them from '
    + 'your own requirements — they are listed in full further down. Work through each one '
    + 'and ask what it has to store and what that thing is called in your domain. Do not '
    + 'name a table after a vendor: HelloSign is a system you talk to, an agreement is a '
    + 'thing you store. This is a starting point, not the answer — show me the model before '
    + 'you create the tables.',
  );
  lines.push('');

  lines.push('## Sample data and real data');
  lines.push(
    'One global switch, visible on every tab. **Sample** fills the whole Command Center '
    + 'with believable made-up data so you can see the shape of it on day one. **Real** '
    + 'shows only what your system has actually produced — which on day one is almost '
    + 'nothing, and that is the point. Sample data must be visibly labelled as sample on '
    + 'every screen it appears on. Nobody should ever demo sample data by accident.',
  );
  lines.push('');

  lines.push('## Live indicators');
  lines.push(
    'Anything that can be connected or disconnected, running or stopped, gets a status dot '
    + 'with a last-checked time. Grey for unknown, not green. A dashboard that looks healthy '
    + 'before anything is built teaches you to distrust it.',
  );
  lines.push('');

  lines.push('## "Live" means "as of your last sync" — say so');
  lines.push(
    'Nothing on this page is live in the sense a monitoring tool is live. The files are '
    + 'written when you sync from the portal, and between syncs they do not change. A page '
    + 'that implies otherwise is the most dangerous thing you could build here, because it '
    + 'looks most trustworthy exactly when it is most wrong.',
  );
  lines.push('');
  lines.push(
    `Read \`generated_at\` from \`${MANIFEST_FILE_PATH}\` and put it in the header of every `
    + 'tab, as an absolute date and a relative age: "Data as of 12 August 2026 (3 days ago)". '
    + 'Not a bare relative time — "3 days ago" alone is unreadable in a screenshot.',
  );
  lines.push(bullet('Under about a day old: show it plainly.'));
  lines.push(bullet('Over about a week old: show it as a warning, and say "sync from the portal to refresh".'));
  lines.push('');
  lines.push(
    'Word it "Data as of", not "Last synced". Those are different facts and only the first '
    + 'one is true: the stamp moves when the DATA CHANGES, so a sync that found nothing new '
    + 'leaves it alone. An old stamp therefore means either "nothing has happened" or "you '
    + 'have not synced" — the page cannot tell which, must not guess, and should prompt a '
    + 'sync either way. Being honest that you do not know beats picking the flattering reading.',
  );
  lines.push('');

  lines.push('## Your colours');
  lines.push(
    'Use the brand colours you chose for this project. If you have not chosen any yet, use '
    + 'a neutral palette and leave the choice in one place in the code so it is a one-line '
    + 'change later — do not scatter hex codes through the components.',
  );
  lines.push('');

  lines.push('## The requirements this has to reflect');
  lines.push('Your full set, so the Command Center can show all of it:');
  plan.requirements.forEach((r) => lines.push(bullet(`**${r.id}** (${r.kind}, ${r.priority}) — ${r.statement}`)));
  lines.push('');

  lines.push('## Your stories, in build order');
  releases.forEach((r) => {
    const inRel = plan.stories.filter((s) => s.release === r.key);
    if (!inRel.length) return;
    lines.push(`**${r.key} · ${r.name}**`);
    inRel.forEach((s) => {
      const d = dueBy.get(s.id);
      lines.push(bullet(`${s.id} — ${s.title}${d ? ` (due ${fmt(d)})` : ''}`));
    });
  });
  lines.push('');

  // THE CRITERIA THE PLATFORM ACTUALLY VERIFIES, rendered from the same constant
  // that goes onto the task row and into the verification spec. This section
  // used to list five hand-written bullets matching NEITHER — so a student who
  // ticked exactly what the prompt told them to tick wrote text no criterion
  // recognised, every claim landed in `rejected_claims`, and a story they had
  // genuinely finished could never verify. Rendering from the constant makes
  // that drift impossible rather than merely unlikely.
  lines.push('## Done means — these exact lines');
  lines.push(
    'These are the acceptance criteria the platform checks. They go into '
    + '`.colaberry/progress.json` **word for word** — they are matched by text, so a reworded '
    + 'line does not count.',
  );
  COMMAND_CENTER_ACCEPTANCE.forEach((a) => lines.push(bullet(a)));
  lines.push('');
  // Closes the gap between the Overview checkpoint and criterion 1. A build
  // sitting at the checkpoint cannot satisfy "every tab is reachable", so
  // "Mark done" stays dark — and without this sentence the student has no way
  // to connect the dark button to the pause they were asked to make.
  lines.push(
    '**While the build is paused at the Overview checkpoint, this story cannot verify yet** — '
    + 'the first criterion needs all nine tabs to exist. That is expected, not a fault: say '
    + '**build the rest**, let the other eight get built, and then finish Step 3.',
  );
  lines.push('');

  lines.push('## What good looks like');
  lines.push(bullet('Every tab above exists and is reachable from the Command Center.'));
  lines.push(bullet('Every card drills down one level, including the ones with no data behind them yet.'));
  lines.push(bullet('The sample/real switch works on every tab, and sample data is labelled as sample everywhere it shows.'));
  lines.push(bullet('The project management tab shows your real releases and your real due dates, not placeholders.'));
  lines.push(bullet('Nothing on the page claims a number, a connection or a result that your project has not actually produced.'));
  lines.push(bullet(
    `Every tab is rendered from \`${PLAN_FILE_PATH}\` and \`${PROGRESS_FILE_PATH}\` read at `
    + 'runtime. No plan content is hard-coded into a component.',
  ));
  lines.push(bullet(
    'Every tab shows the "Data as of" stamp, and it visibly changes to a warning once the '
    + 'data is over a week old.',
  ));
  lines.push(bullet(
    'Deleting a story from the plan file and reloading removes it from the page. If it '
    + 'survives, you hard-coded something.',
  ));
  lines.push('');

  lines.push('## Stop and ask me if');
  lines.push(bullet('A tab needs data your plan does not contain — build the empty state and ask, rather than inventing the data.'));
  lines.push(bullet('You are about to hard-code a KPI value, a customer name, or an integration status.'));
  lines.push(bullet('The guardrails tab is empty because your plan has no SAFE requirement — that is worth fixing before you build further.'));
  lines.push('');

  lines.push('## How I want you to work');
  lines.push(bullet('Build it so the data comes from one place. You will point it at your real system as you build, and you should not be rewriting tabs to do it.'));
  // THE CHECKPOINT, AND WHY IT HAS TO SPEAK.
  //
  // "Build Overview first and stop" is a good instruction — nine tabs built in
  // the wrong direction is a bad afternoon — and builds obey it. What they did
  // NOT do is say so on screen: the eight unbuilt tabs rendered as though they
  // were locked, which reads as the platform gating the student rather than the
  // build waiting on them. Ali hit exactly this and asked why his tabs were
  // locked. They were not; nothing had told him it was his move.
  lines.push(bullet('Show me the Overview tab first and stop. Get that right before building the other eight.'));
  lines.push(
    bullet(
      'While you are paused there, the other eight tabs must still be REACHABLE and must not '
      + 'look locked, greyed out, or gated. Each one renders a plain "Not built yet — say '
      + '**build the rest** when Overview looks right" state. Nothing that implies the student '
      + 'lacks permission or has to unlock anything: the build is waiting on them, not the '
      + 'other way round.',
    ),
  );
  // THE RESUME HAS TO REACH THE FINISH.
  //
  // This bullet used to end at "remove the banner". Step 3 — tick the criteria,
  // commit naming the story, push — is a hundred lines further down, so an agent
  // that obeyed the checkpoint perfectly built the remaining eight tabs and then
  // stopped one step short: nine tabs live and reachable, story unverified,
  // "Mark done" still dark, and nothing in the instruction telling it to carry
  // on. Ali hit exactly that, and every student would have.
  //
  // The last sentence is not padding. "Now go and finish it" is precisely the
  // instruction that turns into "tick them all", and the honesty rule is the
  // whole point of this story: Ali's agent refused to invent numbers for an
  // empty Outcomes tab, correctly. Finishing is a duty to claim what is true,
  // never permission to claim what is not.
  lines.push(
    bullet(
      'Put a short banner on Overview itself while you are paused, saying the build is stopped '
      + 'for their review and how to continue. When they say **build the rest**, build the '
      + 'remaining eight, remove the banner, and then go straight on to Step 3 and finish the '
      + 'job: tick the criteria that are genuinely true in `.colaberry/progress.json`, commit '
      + 'naming the story, and push. Removing the banner is not the finish — and finishing is '
      + 'not permission to tick a line that is not true yet, so leave any such line unticked '
      + 'and tell them which one and why.',
    ),
  );
  lines.push('');

  // THE LAST MILE — without this the loop cannot close.
  //
  // Verification needs BOTH halves: every criterion ticked in
  // `.colaberry/progress.json`, and a commit naming the story. The prompt
  // previously mentioned NEITHER, so a student could build the Command Center
  // perfectly, push it, and watch nothing happen — with a disabled "Mark done"
  // button and no way to discover why.
  //
  // The JSON is rendered from COMMAND_CENTER_ACCEPTANCE rather than written out
  // by hand, so the text a student is told to paste is byte-identical to the
  // text the matcher compares against.
  lines.push('## Step 3 — finish it, so the platform can confirm it');
  lines.push(
    'A story is confirmed when BOTH halves are true: every acceptance criterion is ticked in '
    + '`.colaberry/progress.json` — each one because it is genuinely true — AND a commit names '
    + 'the story. Neither on its own is enough.',
  );
  lines.push(
    bullet(
      'Create or update `.colaberry/progress.json` so it carries this story with every '
      + '**Done means** line present word for word. Only tick a line when it is actually true — '
      + 'the file is the claim, the commit is the evidence:',
    ),
  );
  lines.push('');
  lines.push('```json');
  lines.push(progressFileExample());
  lines.push('```');
  lines.push('');
  lines.push(
    `That example is a build where all ${COMMAND_CENTER_ACCEPTANCE.length} lines are genuinely `
    + 'true. Yours carries `"passed": false` on every line that is not yet, and a file like that '
    + 'is correct rather than unfinished.',
  );
  lines.push('');
  // ── REPAIRING A FILE THAT IS ALREADY THERE ───────────────────────────────
  //
  // Two ways this goes wrong on an existing build, and they pull in opposite
  // directions. Rewrite the entry and the student's real ticks vanish. Notice
  // the entry is shorter than the list and "fix" it by ticking the new lines to
  // make the shapes match, and the platform is told a lie. Both are named.
  lines.push(
    bullet(
      '**If the file already carries this story, reconcile it — do not rewrite it.** Add any '
      + '**Done means** line that is missing with `"passed": false`, leave the ticks that are '
      + 'already there alone, and change a `false` to `true` only for a line you have just made '
      + 'true. A criterion added after this build started begins unticked like every other one; '
      + 'it does not inherit a tick from the lines around it.',
    ),
  );
  lines.push(
    bullet(
      '**Bringing an older build up to the current standard is not permission to tick the new '
      + 'lines.** A line is ticked because it is true in the repo today — never because the rest '
      + 'of the story is finished, never because the build looks done, and never to make the '
      + 'count come out even. Leave every line you have not actually satisfied unticked, and tell '
      + 'me which ones and why.',
    ),
  );
  lines.push(
    bullet(
      `Commit with the story id in the message — \`git commit -m "${COMMAND_CENTER_STORY_ID}: build the `
      + `Command Center"\` (a \`Story: ${COMMAND_CENTER_STORY_ID}\` line in the body works too) — then push.`,
    ),
  );
  lines.push(
    bullet(
      'Then tell me to watch the portal. If Step 1 worked, the criteria tick themselves within about '
      + 'ten seconds and the story flips to verified without me clicking anything. If I skipped '
      + 'Step 1, I press "Sync from GitHub" and the same thing happens.',
    ),
  );
  lines.push('');

  // PUT IT ONLINE — a separate, explicitly optional step, and its own heading
  // rather than a bullet inside Step 3.
  //
  // Hosting is deliberately NOT an acceptance criterion and never gates the
  // latch. A first Pages build takes a minute or more, custom domains exist, a
  // student may decline hosting, and Pages on a private repo needs a paid plan —
  // so making it a criterion would recreate the permanently-stuck story that the
  // STORY-000 spec fix removed. Anything a student cannot always satisfy does not
  // belong in the criteria, and this section says so in as many words so nobody
  // reads a locked story into a skipped bonus.
  lines.push('## Step 4 — put it online (optional, one command)');
  lines.push(
    'GitHub Pages will host the Command Center for free, and the portal picks the address up on '
    + 'its own. **This is a bonus. Nothing about whether this story verifies depends on it** — '
    + 'skip it and Step 3 still confirms exactly the same way.',
  );
  lines.push(
    bullet(
      'Turn Pages on for this repo, building from the default branch:\n\n'
      + '```bash\n'
      + 'gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pages --method POST \\\n'
      + "  -f 'source[branch]=main' -f 'source[path]=/'\n"
      + '```\n\n'
      + 'Use your default branch if it is not `main`.',
    ),
  );
  lines.push(
    bullet(
      '**If it is already on, GitHub answers 409 — that means it is done, so leave it alone and '
      + 'move on.** Do not delete and recreate it.',
    ),
  );
  lines.push(
    bullet(
      '**If it refuses because the repo is private,** Pages needs a paid plan for private repos. '
      + 'Tell me plainly that it was refused and carry on — do not retry it, and do not ask me to '
      + 'upgrade anything. The story still verifies without it.',
    ),
  );
  lines.push(
    bullet(
      'You do not need to find the address yourself. The first build takes a minute or two; the '
      + 'platform checks after each push and after a Sync, and the **Command Center** link appears '
      + 'in the portal header once the site actually answers.',
    ),
  );
  lines.push(
    bullet(
      `What it asks for is \`${COMMAND_CENTER_ENTRY_FILE}\` at the site root — `
      + '`https://<your-github-name>.github.io/<your-repo>/`. That is the reason the entry point '
      + 'goes at the root of the repo rather than in a subfolder, and it is the whole of the '
      + 'reason. If yours is one directory down the platform still finds it, but the address in '
      + 'your header is the longer one.',
    ),
  );
  lines.push('');
  return lines.join('\n');
}

/**
 * The exact `.colaberry/progress.json` a finished Command Center should carry.
 *
 * Generated from COMMAND_CENTER_ACCEPTANCE via JSON.stringify so the criterion
 * text is byte-identical to what the matcher normalises against. Hand-writing
 * this example is how the prompt and the matcher drift apart, and a drifted
 * example is worse than none: the student follows it exactly and their claims
 * still land in `rejected_claims`.
 *
 * ── `schema_version` IS NOT DECORATION ──────────────────────────────────────
 *
 * `progressFileSchema` REQUIRES it, and requires it as a number. This example
 * omitted it, which made the block below a file the platform's own reader
 * refuses: `schema_version: Invalid input: expected number, received undefined`
 * — the whole file rejected at the schema gate before a single criterion was
 * compared. Confirmed live in production on 2026-08-17.
 *
 * That is survivable for a student whose repo the platform can write, because
 * Sync seeds a correct file over the top. For a student on a repo we hold
 * `push: false` on, this block is the ONLY copy of the shape that exists — no
 * managed block in their CLAUDE.md, no seeded progress file, nothing. Getting
 * it wrong there is not a typo, it is the contract being unavailable.
 *
 * Rendered from the constant rather than the literal `2`, so a schema bump
 * carries here on its own. `commandCenterStory.progressExample.test.ts` pushes
 * this block back through `parseProgressFile`, which is the only check that
 * cannot drift.
 */
function progressFileExample(): string {
  return JSON.stringify(
    {
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [
        {
          id: COMMAND_CENTER_STORY_ID,
          criteria: COMMAND_CENTER_ACCEPTANCE.map((text) => ({ text, passed: true })),
        },
      ],
    },
    null,
    2,
  );
}

/** Roles the student's own stories are written for. */
function rolesFrom(plan: BuildPlan): string[] {
  return rolesOf(plan.stories).slice(0, 6);
}

/** Acceptance lines stored on the task row, mirroring the prompt's stop condition. */
export const COMMAND_CENTER_ACCEPTANCE: readonly string[] = [
  'Given the Command Center, when it is opened, then every tab is reachable and every card drills down one level.',
  'Given sample mode, when any tab is shown, then the sample data is visibly labelled as sample.',
  `Given the data files, when any tab renders, then its content comes from ${PLAN_FILE_PATH} and ${PROGRESS_FILE_PATH} read at runtime rather than from hard-coded values.`,
  `Given ${MANIFEST_FILE_PATH}, when any tab is shown, then it displays how old the data is and warns when that age exceeds a week.`,
  'Trust — no tab shows a number, a connection or a result the project has not actually produced.',
] as const;

/**
 * STORY-000's seed for `.colaberry/progress.json`.
 *
 * Shaped exactly like a plan story so `renderProgressFile` can take it without
 * a special case — and so the criterion text is GENERATED from the constant
 * rather than retyped anywhere. `release` is null because this story sits ahead
 * of the plan's releases rather than inside one.
 *
 * PURE. Returns a fresh array each call so no caller can mutate the constant.
 */
export function commandCenterStorySeed(): { id: string; release: null; acceptance: string[] } {
  return {
    id: COMMAND_CENTER_STORY_ID,
    release: null,
    acceptance: [...COMMAND_CENTER_ACCEPTANCE],
  };
}

/**
 * What the platform WOULD have seeded, rendered so a student can paste it.
 *
 * ── WHY A DOCUMENT HAS TO CARRY THIS AT ALL ─────────────────────────────────
 *
 * `Colaberry Build Bot` holds `push` on exactly one repository in the cohort. On
 * the other twelve the platform is pull-only, so nothing it renders — not
 * `plan.json`, not `progress.json`, not this story doc — was ever committed for
 * it. Those students reach the doc through the download bundle and the portal
 * instead, and the doc told them their criteria were "already seeded" in a file
 * that does not exist in their repo.
 *
 * The consequence was not a missing file, it was a WRONG one. An agent told not
 * to retype, that then finds nothing to copy, does not stop — it writes the
 * criteria out from the prose around it. Across the cohort that produced
 * paraphrases no verifier can match, `acceptance_criteria` where the schema says
 * `criteria`, and `criteria: []`. So the instruction did not merely fail to
 * prevent drift; it was the most reliable cause of it.
 *
 * Anything told "do not retype" needs something to copy. This is that thing.
 *
 * ── WHY IT IS BUILT AND NOT WRITTEN OUT ─────────────────────────────────────
 *
 * Generated from `COMMAND_CENTER_ACCEPTANCE`, the same constant `renderDocs`
 * seeds the real file from, so the sentences here cannot drift from the
 * sentences `decideStory` matches against — which is the entire failure this
 * function exists to stop, and it would be an embarrassing one to reintroduce by
 * pasting the criteria into a template literal.
 *
 * ALL `false`, always. A pre-ticked block is a nudge, and a copyable pre-ticked
 * block is an instruction: the student's agent would paste five passing claims
 * for a Command Center that does not exist yet. `false` is the correct starting
 * state and the file is correct rather than unfinished while it says so.
 *
 * Minimal by design — `schema_version`, `stories`, `id`, `criteria` and nothing
 * else. Every other field `renderProgressFile` writes is optional at the read
 * boundary, and the shorter the block the likelier it is pasted intact. A test
 * pushes this exact string through `parseProgressFile` and `decideStory` and
 * asserts it produces zero unrecognised criteria, so "minimal" can never quietly
 * become "invalid".
 *
 * PURE.
 */
export function commandCenterProgressSeedBlock(): string {
  return JSON.stringify(
    {
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [
        {
          id: COMMAND_CENTER_STORY_ID,
          criteria: COMMAND_CENTER_ACCEPTANCE.map((text) => ({ text, passed: false })),
        },
      ],
    },
    null,
    2,
  );
}

/**
 * Options for `commandCenterStoryDoc`.
 *
 * One field, and it is the difference between a true document and a false one.
 */
export interface CommandCenterDocOptions {
  /**
   * What the PLATFORM can do with this student's repo, as GitHub reported it —
   * `writeAccessOf(connection)` from `repoConnect/connectionAccess`.
   *
   * `'push'`      we seed `.colaberry/progress.json`, so "already seeded" is TRUE.
   * `'pull_only'` we cannot write to this repo at all. Nothing is seeded.
   * `null`        nobody ever asked GitHub. We do not know, so we may not claim.
   *
   * Omitted behaves as `null`. That default is deliberate and is the safe
   * direction: the not-seeded text is true whether or not the file happens to be
   * there ("if it is already in your repo, flip the booleans; if it is not, here
   * it is"), whereas the seeded text is false the moment we are wrong. Only a
   * caller that has positively established `push` may claim the file exists.
   *
   * Typed against `writeAccessOf`'s return rather than a boolean so that PR
   * #1618's `writeBlockReason` — which turns `null` from "assume writable" into
   * a refusal — changes nothing here: this function already refuses to make the
   * claim on an unrecorded permission.
   */
  writeAccess?: RepoWriteAccess | null;
}

/**
 * The "opening this file cold" section, told truthfully for THIS student.
 *
 * The two branches differ in what they claim about the repo, never in what they
 * ask of the agent: tick only what genuinely passes, use the platform's exact
 * wording, do not paraphrase. The pull-only branch just has to hand over the
 * wording instead of pointing at it.
 */
function coldOpenSection(writeAccess: RepoWriteAccess | null): string[] {
  if (writeAccess === 'push') {
    return [
      'Everything you need is here. The full build brief is below, and your',
      'acceptance criteria are **already seeded** in `.colaberry/progress.json` under',
      `\`${COMMAND_CENTER_STORY_ID}\` with \`"passed": false\` — the platform has push access to`,
      'this repo and writes that file on every sync.',
      '',
      '**Do not retype the criteria.** Find the story by its `id`, flip `passed` to `true`',
      'on each line that is genuinely true, and leave the rest `false`. Retyping is how the',
      'text drifts — a rewritten dash or a changed full stop makes a claim the platform',
      'cannot match, and the story stays unverified with your work already done. Step 3',
      'below has the exact procedure.',
    ];
  }

  // Everything that is not a confirmed `push`. The lead sentence names which of
  // the two it is, because "we cannot" and "we never checked" are different
  // facts and a student is entitled to the accurate one.
  const lead = writeAccess === 'pull_only'
    ? [
      'Everything you need is here, including the criteria themselves — which matters,',
      'because **the platform cannot write to this repo.** It has read access only, which is',
      `a perfectly good choice; it just means nothing seeded \`${PROGRESS_FILE_PATH}\` for you.`,
    ]
    : [
      'Everything you need is here, including the criteria themselves. **The platform has not',
      'confirmed it can write to this repo**, so do not assume anything put',
      `\`${PROGRESS_FILE_PATH}\` there for you — check, and if it is missing, create it.`,
    ];

  return [
    ...lead,
    '',
    `**Do not retype the criteria — copy them.** If \`${PROGRESS_FILE_PATH}\` is already in`,
    `your repo with a \`${COMMAND_CENTER_STORY_ID}\` entry, leave its \`text\` values exactly as`,
    'they are and only flip `passed`. Otherwise use the block below **verbatim**: it is',
    'generated from the same constant the platform grades against, so a character-for-character',
    'copy matches and anything you reword does not.',
    '',
    `If the file exists but has no \`${COMMAND_CENTER_STORY_ID}\` entry, paste only the object`,
    'from the `stories` array into the `stories` array already there. **Do not overwrite a',
    'progress file that has your other stories in it.**',
    '',
    '```json',
    commandCenterProgressSeedBlock(),
    '```',
    '',
    'Every line starts `false`, which is correct rather than unfinished. Flip one to `true`',
    'only when it is genuinely true in this repo today. Step 3 below has the exact procedure.',
    '',
    '**A paraphrase is not a claim.** The platform matches your `text` against the plan\'s',
    'wording and ignores anything that does not match, so a criterion you rewrote in your own',
    'words counts for nothing however true it is — and until now it did that silently.',
  ];
}

/**
 * `docs/stories/STORY-000.md` — the story doc that was missing from every
 * student repo.
 *
 * WHY THIS EXISTS. STORY-000 is kept out of `plan.stories` on purpose (gate, XP
 * divisor, materialize ordering), and `renderDocs` iterates `plan.stories` — so
 * this one story was never rendered into any repo. Its prompt lived only on
 * `student_tasks.build`, i.e. the portal. A student's Claude Code session with
 * no chat history therefore had NO local reference for the one story every
 * student builds first: asked to "follow Step 3", it correctly answered that
 * `.colaberry/` held only `connect.txt` and nothing in the repo mentioned
 * progress.json. It then made no claims at all, and verification returned zero
 * of three with an empty `rejected_claims` — the claims were never made.
 *
 * Every other story is a boolean to flip. This makes STORY-000 one too.
 *
 * Deliberately the FULL prompt, not a summary: this is the one story a student
 * runs before they have any of their own code, so the file has to carry the
 * whole picture on its own. It is the same text the portal shows, from the same
 * function, so the two cannot drift.
 *
 * ── IT MUST BE TRUE FOR THE STUDENT READING IT ──────────────────────────────
 *
 * The cold-open section used to state flatly that the criteria were "already
 * seeded" in `.colaberry/progress.json`. That was true for one student in
 * thirteen — the only repo the platform holds `push` on. For the other twelve it
 * described a file that had never been written, and an agent that is told not to
 * retype and then finds nothing to copy writes the criteria out itself. It is
 * the sentence that caused the drift it warned about.
 *
 * `opts.writeAccess` is therefore not decoration. Callers pass what GitHub
 * actually reported; the seeded claim is made only on a confirmed `push` and the
 * criteria are handed over in full otherwise. See `CommandCenterDocOptions`.
 *
 * PURE — same plan, schedule and options in, byte-identical markdown out, which
 * is what lets repoWriter's content-hash idempotency hold. Note that the output
 * now varies with `writeAccess`: two students on different access levels get
 * different bytes, which is the point, and each student's own bytes are stable
 * for as long as their access is.
 */
export function commandCenterStoryDoc(
  plan: BuildPlan,
  schedule?: Schedule | null,
  opts: CommandCenterDocOptions = {},
): string {
  return [
    `# ${COMMAND_CENTER_STORY_ID} — Build your Command Center`,
    '',
    COMMAND_CENTER_NARRATIVE,
    '',
    '**Release:** ahead of the plan — this is day one, before your own stories',
    '**Owner:** you, with Claude Code',
    '**Blocked by:** nothing — this is the first thing you build',
    '',
    '## The requirement this satisfies',
    '',
    'None of yours, and that is deliberate. The Command Center is the window onto your',
    'system rather than a part of it, so it fulfils no requirement in',
    '`docs/REQUIREMENTS.md` and has no row in `docs/TRACEABILITY.md`. Everything it',
    'displays is read out of your own plan.',
    '',
    '## If you are Claude Code opening this file cold',
    '',
    ...coldOpenSection(opts.writeAccess ?? null),
    '',
    '**If this repo already has some of the Command Center in it, do not start over.**',
    'Step 2a below takes stock before anything is written and Step 2b repairs in place;',
    'work that is already right is kept, not replaced. And if the story entry in',
    `\`${PROGRESS_FILE_PATH}\` carries`,
    'fewer lines than the acceptance list at the foot of this file, this build predates a',
    `criterion that has since been added — there are ${COMMAND_CENTER_ACCEPTANCE.length} now.`,
    'Copy the missing line in with `"passed": false` and earn it; do not tick it to make',
    'the two lists the same length.',
    '',
    '---',
    '',
    commandCenterPrompt(plan, schedule),
    '',
    '## Acceptance — your stop condition',
    '',
    // The old copy asserted these lines were "already in .colaberry/progress.json
    // word for word", which is the same false claim as the cold open and had the
    // same effect one section lower. What is actually true of every student is
    // that THIS list is the graded wording — so that is what it now says, and it
    // points at the file rather than vouching for its contents.
    'These are the exact lines the platform checks, character for character. Tick a box',
    'here as it genuinely passes, and set the matching `passed` flag in',
    `\`${PROGRESS_FILE_PATH}\` — the JSON is what the platform reads, this list is for you.`,
    'If a `text` value in that file does not match its line here, the platform ignores it',
    'and the story cannot verify; make the JSON match this list rather than the other way',
    'round.',
    '',
    ...COMMAND_CENTER_ACCEPTANCE.map((a) => `- [ ] ${a}`),
    '',
    'When every box above is ticked **and** a commit names the story, the platform',
    'confirms it on its own — within about ten seconds if you did Step 1.',
    '',
  ].join('\n');
}
