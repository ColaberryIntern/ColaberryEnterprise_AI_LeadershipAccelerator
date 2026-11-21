/**
 * commandCenterTabs — the nine tab specifications inside the Story 000 prompt.
 *
 * ## Why this was rewritten
 *
 * The first real end-to-end run (ShiftFill, 2026-11-20) handed this prompt to a
 * fresh Claude Code session and got back a Command Center that was correct and
 * shallow: nine tabs of text cards. Ali: "a very shallow Command Center. I did
 * not have a well detailed command center that I am used to seeing."
 *
 * The prompt was the cause. Every tab section said where the data was and what
 * NOT to fake (empty states, grey indicators, no invented numbers), and almost
 * none said what a good tab LOOKS like. An agent that is only told what not to
 * do builds the minimum that does none of it. So each tab now carries a
 * "what good looks like" paragraph: the visual, the drill-down, and which
 * `derived` field feeds it. Every honesty rule is kept, word for word where a
 * test pins it; the richness is added beside them, never instead of them.
 *
 * ## Split out of commandCenterStory.ts
 *
 * That file is past the CLAUDE.md ceiling, and the rule is that the next change
 * splits before adding. The tab sections were the obvious seam: they are the
 * part that changes with the product, while the steps around them (webhook,
 * take stock, Step 3) change with the verification protocol.
 *
 * PURE. Same plan and schedule in, byte-identical lines out.
 */
import type { BuildPlan } from './planContract';
import type { Schedule } from './buildSchedule';
import {
  guardrailGate,
  guardrails as guardrailsOf,
  measures as measuresOf,
  rolesFrom as rolesOf,
  systemsOfRecord as systemsOf,
} from './planDocument';
import { handoffsFor, artifactsFor } from './planDocumentInsights';
import { separateHardRules } from './planPeople';
import { rosterWithEveryStoryOwned } from './storyOwners';
import { bullet, fmt, good, type TabContext } from './commandCenterTabContext';
import { agentsTab } from './commandCenterAgentsTab';


function tabsIntro(_c: TabContext): string[] {
  const lines: string[] = [];

  lines.push('## Tabs, and what goes in each');
  lines.push(
    'Build it as a website, not a dashboard widget. Every tab is a real page, and every '
    + 'card on it drills down one level to its own detail view. A card with nothing behind '
    + 'it yet still drills down — to a page that says what will be there and what has to '
    + 'happen first.',
  );
  lines.push(
    'Each tab below has three parts. **Source** says which fields feed it. The honesty '
    + 'rules say what it must never fake. **What good looks like** says what it should be '
    + 'when it is done well, and that part matters as much as the other two: a page that '
    + 'fakes nothing and shows nothing is not finished. Prefer a picture to a paragraph '
    + 'wherever the data has a shape (a track, a matrix, a flow, a diagram). Inline SVG '
    + 'drawn from the data at runtime is enough; no charting library is required.',
  );
  lines.push(
    'One rule covers every "every" below: a "real page" means its own URL, so a hash route '
    + 'per tab and per detail view (`#/agents/<name>`) is a perfectly good answer.',
  );
  lines.push('');
  return lines;
}

function overviewTab(c: TabContext): string[] {
  const { plan } = c;
  const lines: string[] = [];
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
  lines.push(
    'The totals count every story in the progress file, and that includes this one, '
    + '`STORY-000`, which is not in `plan.stories`. So `stories_total` is one more than the '
    + `number of plan stories. Say so beside the number ("${plan.stories.length + 1} stories, `
    + 'including this Command Center") rather than letting a reader find two counts that disagree.',
  );
  lines.push(good(
    'a hero block that states the problem and the outcome in the student\'s OWN words, quoted '
    + 'from `plan.derived.understanding` (dimension `problem` for what it is, '
    + '`success_definition` for what good looks like), so the first thing a visitor reads is '
    + 'the student, not a template. Under it, a release track: one segment per release, in '
    + 'order, each coloured by how many of its stories are verified, the demo-target release '
    + 'marked, and "you are here" on the release that holds the next unverified story. Then '
    + 'the next story to build, as a card that opens it. Then the headline counts as large '
    + 'numbers, each drilling into its breakdown.',
  ));
  lines.push('');
  return lines;
}

function outcomesTab(c: TabContext): string[] {
  const { kpis } = c;
  const lines: string[] = [];
  lines.push('### 2. Outcomes — the numbers this has to move');
  lines.push(
    `Source: \`plan.derived.measures\` — each entry has \`id\` and \`statement\`. Also `
    + '`plan.derived.understanding.entries` with dimension `success_definition` and '
    + '`pain_points`: what the student said good looks like and what it costs today, in their '
    + 'words.',
  );
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
    lines.push(
      'Your plan carries no numeric target yet. Build the tab with an empty state that says so, '
      + 'and leave room for one card per measure. If `plan.derived.understanding` holds a '
      + '`success_definition` the student stated, show it, quoted and labelled "as you stated '
      + 'it, not yet a measured target", which is honest and far more useful than a blank tab.',
    );
  }
  lines.push(good(
    'one card per outcome showing BASELINE → TARGET as a visual (a bar or a gauge with both '
    + 'ends labelled), the baseline taken from what the student said it costs today and the '
    + 'target from the measure, each end labelled with where it came from. Under each card: '
    + 'how it will be measured, which stories move it (requirements that share its cluster), '
    + 'and the current value, which on real data is "not measured yet".',
  ));
  lines.push('');
  return lines;
}

function usersTab(c: TabContext): string[] {
  const { roles } = c;
  const lines: string[] = [];
  lines.push('### 3. Users and use case');
  lines.push(
    'Who this is for and what they are trying to get done. Take the roles from your own '
    + 'stories — they are written "As a <role>, I want …". Roles in your plan: '
    + `${roles.join(', ') || 'not yet named in your stories — say so on screen'}.`,
  );
  lines.push(
    'Source: `plan.derived.roles`, already extracted. `plan.stories[].narrative` has the '
    + 'full sentence each role came from, for the drill-down. `plan.derived.understanding` '
    + 'entries with dimension `actors` say who uses it and how comfortable they are with '
    + 'tools; `current_workflow` says how the work starts today and how often.',
  );
  lines.push(good(
    'a card per role, not a list of names. Each card: what this person does today, what '
    + 'changes for them, how comfortable they are with tools (quoted from the student where '
    + 'it was said), and HOW they touch the system (a page they open, a message they '
    + 'receive, an approval they give). A person who never opens the system, only receives a '
    + 'text, is still a user, and the card says so. Drill down to that role\'s stories.',
  ));
  lines.push('');
  return lines;
}

function guardrailsTab(c: TabContext): string[] {
  const { safes } = c;
  const lines: string[] = [];
  lines.push('### 4. Guardrails — what must never happen');
  lines.push(
    'Source: `plan.derived.guardrails` — `id`, `statement`, `kind` and `approver` each. '
    + '`kind` is `hard_rule` (nobody can let it through: show it as "never, no exceptions") or '
    + '`approval` (a person can: show who in `approver`). An approval whose `approver` is null '
    + 'is a real gap: show "approver not named yet" and list it with the questions for your '
    + 'instructor. Never put an approver column against a hard rule. To show whether anything '
    + 'enforces one, follow `plan.requirements[].fulfilled_by` to the story ids, then read '
    + 'those stories\' `verification.state` in the progress file. A guardrail whose stories '
    + 'are not verified is a promise you have made and not yet kept, and the page should say '
    + 'so in those words.',
  );
  if (safes.length) {
    lines.push('These are the promises your system makes. Show each one, and whether anything in the build currently enforces it:');
    safes.forEach((r) => {
      const gate = guardrailGate(r.statement, c.allRoles);
      const tag = gate.kind === 'hard_rule' ? 'hard rule'
        : `approval: ${gate.approver ?? 'approver not named yet'}`;
      lines.push(bullet(`**${r.id}** (${tag}) — ${r.statement}`));
    });
  } else {
    lines.push(
      'Your plan has no requirement typed SAFE yet, which usually means the promise you '
      + 'made in the interview was recorded as a normal feature. Show the tab with an empty '
      + 'state and raise it with your instructor — this is worth fixing early.',
    );
  }
  lines.push(good(
    'an enforcement matrix. One row per guardrail; columns for the stories that fulfil it, '
    + 'the agent that owns those stories (`plan.stories[].owner_agent`), and whether those '
    + 'stories are verified. A row with no story, or with no verified story, is highlighted, '
    + 'not hidden. Beside it, the approval points: every agent `approval_gates` entry and every '
    + '`approval_points` statement in `plan.derived.understanding`, each with WHO approves '
    + 'where the plan or the student names a person, and "approver not named" where nobody did.',
  ));
  lines.push('');
  return lines;
}

function systemsTab(c: TabContext): string[] {
  const { systems } = c;
  const lines: string[] = [];
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
  lines.push(good(
    'a data-flow diagram above the status table: systems on the left, your agents in the '
    + 'middle, what they produce on the right, with arrows from `plan.agents[].inputs` and '
    + '`outputs` (`plan.derived.artifacts` already lists every named thing with who produces '
    + 'and who reads it). A reader should see in one glance where data enters, which agent '
    + 'touches it, and where it leaves. Each system row drills into which agents and stories '
    + 'use it.',
  ));
  lines.push('');
  return lines;
}

function projectManagementTab(c: TabContext): string[] {
  const { plan, schedule, releases, dueBy } = c;
  const lines: string[] = [];
  lines.push('### 6. Project management');
  lines.push(
    'Source: `plan.releases[]` for the bars — each carries `starts_on`, `ends_on`, '
    + '`story_ids`, `is_demo_target` and `is_roadmap` (after the demo: post-class work, dated '
    + 'after `demo_day`; draw it past the demo line, lighter, never squeezed inside the build '
    + 'window). `plan.schedule` has `build_start`, `build_end`, '
    + '`demo_day` and `demo_release_key`. Per story, `plan.stories[].due_on` is the current '
    + 'date and `due_baseline_on` is the date it was FIRST given: show both, because the gap '
    + 'between them is slippage and a chart that quietly moves the target hides it. Status '
    + 'per story comes from the progress file, `stories[].verification.state`, which is one '
    + 'of `not_started`, `in_progress`, `submitted`, `verified`.',
  );
  lines.push(
    'Read every date from the file at runtime. The dates listed below are a copy for your '
    + 'reference only, and the file wins: if `plan.json` carries no dates (`schedule` is null), '
    + 'the chart is undated and says so, it does not borrow these.',
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
  lines.push(good(
    'a Gantt with one bar per release on a real date axis, today as a vertical line, the demo '
    + 'target release marked and the roadmap releases visibly lighter. Under it, a story table '
    + 'with status, due date, baseline date and slippage in days, sortable. Then a dependency '
    + 'view from `plan.stories[].blocked_by`: which story is waiting on which, so the next '
    + 'unblocked story is obvious. Every story row opens its detail: narrative, acceptance '
    + 'criteria with their ticks, failure paths, and the requirements it fulfils.',
  ));
  lines.push('');
  return lines;
}

function knowledgeBaseTab(_c: TabContext): string[] {
  const lines: string[] = [];
  lines.push('### 8. Knowledge base');
  lines.push(
    'Source: `plan.requirements[]` (each with `id`, `statement`, `kind`, `priority`, '
    + '`cluster` and `fulfilled_by`) and `plan.stories[]`. The traceability view a reviewer '
    + 'will ask for is `fulfilled_by` rendered as a table: every requirement, the stories '
    + 'that cover it, and whether those stories are verified. A `must` requirement with an '
    + 'empty `fulfilled_by` is a real gap — show it rather than hiding the row. The one '
    + 'exception is `kind` CONSTRAINT ("use Gmail and Twilio"): constraints never get a story '
    + 'of their own, by design, because they are the tools the other stories are built with. '
    + 'Show them in their own group labelled "built with, not built", never flagged as a gap.',
  );
  lines.push(
    'Everything the project knows about itself: your requirements, your stories, your '
    + 'decisions, and notes you add as you go. It grows for the whole programme, so build '
    + 'it to be added to rather than regenerated.',
  );
  lines.push(
    'Where each part lives, so nothing has to be hard-coded: decisions and limits come from '
    + 'the enrichment files your stories write, `.colaberry/enrichment/<story id>.json` '
    + '(fetch one per story id in the plan; a missing file just means that story has not '
    + 'recorded anything yet). Notes the student writes by hand live in '
    + '`command-center/notes.json`, which is theirs, not plan content. What the student said '
    + 'at intake is `plan.derived.understanding`.',
  );
  lines.push(
    'Give it a question box that answers from the data on this page and cites which tab it '
    + 'came from. A static page cannot hold an API key, so this is a LOCAL search across the '
    + 'loaded files, not a model: match the question against requirement, story, agent and '
    + 'understanding text, show the matching entries with a link to their tab, and when '
    + 'nothing matches, say so plainly instead of guessing.',
  );
  lines.push(good(
    'a traceability matrix (requirements down the side, stories across the top, a filled cell '
    + 'where a story fulfils a requirement, coloured by verification state), with filters by '
    + 'kind and priority and a text filter. Beside it, three panels: what the student told us '
    + '(`derived.understanding`, grouped by heading, each marked confirmed or not yet, with '
    + '`derived.understanding.unanswered` listed as open questions), the decisions log from '
    + 'the enrichment files, and the notes.',
  ));
  lines.push('');
  return lines;
}

function dataModelTab(c: TabContext): string[] {
  const { artifacts } = c;
  const lines: string[] = [];
  lines.push('### 9. Data model');
  lines.push(
    'The tables behind all of the above, with fields and relationships. Derive them from '
    + 'your own requirements — they are listed in full further down. Work through each one '
    + 'and ask what it has to store and what that thing is called in your domain. Do not '
    + 'name a table after a vendor: HelloSign is a system you talk to, an agreement is a '
    + 'thing you store. This is a starting point, not the answer — show me the model before '
    + 'you create the tables.',
  );
  if (artifacts.length) {
    lines.push(
      'Your agents already name the things that move through the system '
      + '(`plan.derived.artifacts`, each with who produces and who reads it). A thing one '
      + 'agent produces and another reads has to be stored somewhere, so these are your '
      + 'candidate entities:',
    );
    artifacts.forEach((a) => {
      const by = a.produced_by.length ? `made by ${a.produced_by.join(', ')}` : 'arrives from outside';
      const to = a.read_by.length ? `read by ${a.read_by.join(', ')}` : 'leaves the system';
      lines.push(bullet(`${a.name}: ${by}; ${to}`));
    });
  }
  lines.push(
    'Draw the diagram at runtime from `plan.derived.artifacts`, so it follows the plan. The '
    + 'proposed tables and fields are the student\'s own design, not plan content, so they live '
    + 'in `command-center/data-model.json` and are labelled "proposed, not built" on screen. '
    + 'That file is the one place this tab may read besides the plan, and it does not break '
    + 'the rule that plan content is never hard-coded.',
  );
  lines.push(good(
    'an entity-relationship diagram: a box per entity with its key fields, lines for the '
    + 'relationships with their cardinality, external inputs and outputs drawn at the edges. '
    + 'Each entity drills into its fields, which agents write it, which read it, and which '
    + 'requirements it serves.',
  ));
  lines.push('');
  return lines;
}

export function commandCenterTabSections(source: BuildPlan, schedule?: Schedule | null): string[] {
  // The same repair and re-sort plan.json gets, so the brief and the data never disagree.
  const plan = rosterWithEveryStoryOwned(source);
  const agents = separateHardRules(plan.agents ?? [], rolesOf(plan.stories));
  const c: TabContext = {
    plan,
    schedule,
    kpis: measuresOf(plan.requirements),
    safes: guardrailsOf(plan.requirements),
    systems: systemsOf(plan.requirements),
    roles: rolesOf(plan.stories).slice(0, 6),
    allRoles: rolesOf(plan.stories),
    agents,
    handoffs: handoffsFor(agents),
    artifacts: artifactsFor(agents),
    releases: [...plan.releases].sort((a, b) => a.key.localeCompare(b.key)),
    dueBy: new Map((schedule?.tasks ?? []).map((t) => [t.storyId, t.dueOn])),
  };
  return [
    ...tabsIntro(c),
    ...overviewTab(c),
    ...outcomesTab(c),
    ...usersTab(c),
    ...guardrailsTab(c),
    ...systemsTab(c),
    ...projectManagementTab(c),
    ...agentsTab(c),
    ...knowledgeBaseTab(c),
    ...dataModelTab(c),
  ];
}
