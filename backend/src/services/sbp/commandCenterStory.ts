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
import { PROGRESS_FILE_PATH } from './verification/progressContract';
import { PROFILE_FILE_PATH } from './profileContract';

const MANIFEST_FILE_PATH = '.colaberry/manifest.json';

/** The id and title students see. Stable — republishing must not duplicate it. */
export const COMMAND_CENTER_STORY_ID = 'STORY-000';
export const COMMAND_CENTER_TITLE = 'STORY-000 · Build your Command Center';

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

  lines.push('## Acceptance — your stop condition');
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
  lines.push(bullet('Show me the Overview tab first and stop. Get that right before building the other eight.'));

  return lines.join('\n');
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
