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

/** The id and title students see. Stable — republishing must not duplicate it. */
export const COMMAND_CENTER_STORY_ID = 'STORY-000';
export const COMMAND_CENTER_TITLE = 'STORY-000 · Build your Command Center';

const bullet = (s: string) => `- ${s}`;
const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** A number-bearing NFR is what the student said they would move. */
export function measures(plan: BuildPlan): PlanRequirement[] {
  return plan.requirements.filter((r) => r.kind === 'NFR' && /\d/.test(r.statement));
}

/** SAFE requirements are the promises the system must not break. */
export function guardrails(plan: BuildPlan): PlanRequirement[] {
  return plan.requirements.filter((r) => r.kind === 'SAFE');
}

/**
 * The systems this project actually touches. CONSTRAINT requirements are
 * "things that already exist and we must work with", so they are what the
 * integrations panel has rows for — and what its live indicators report on.
 */
export function systemsOfRecord(plan: BuildPlan): string[] {
  // Verb-anchored matching ("read the X", "write to X") misses the phrasing
  // students actually use — "read the signed agreement FROM HelloSign" puts the
  // system at the end of the clause, and the words in between are lowercase.
  // Proper nouns are the reliable signal instead: a CONSTRAINT statement names
  // the systems, and systems are capitalised. CamelCase (HelloSign) and
  // two-word names (Google Calendar) both have to survive.
  const names: string[] = [];
  for (const r of plan.requirements.filter((x) => x.kind === 'CONSTRAINT')) {
    for (const m of r.statement.matchAll(/\b([A-Z][A-Za-z0-9.]*(?:\s+[A-Z][A-Za-z0-9.]*)?)\b/g)) {
      const name = m[1].trim();
      if (!NOT_A_SYSTEM.has(name) && name.length > 2) names.push(name);
    }
  }
  return [...new Set(names)];
}

/**
 * Capitalised words that start sentences or name the actor rather than a
 * system. Kept deliberately short: a name wrongly listed shows up as an
 * integration row the student can delete, while a name wrongly dropped is a
 * system that silently never appears on the page.
 */
const NOT_A_SYSTEM = new Set([
  'The', 'This', 'That', 'It', 'A', 'An', 'System', 'Nothing', 'No', 'Every', 'Each',
  'All', 'Any', 'When', 'If', 'Only', 'Never', 'Always', 'Must', 'Should',
]);

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
  lines.push('');

  lines.push('### 2. Outcomes — the numbers this has to move');
  if (kpis.length) {
    lines.push('These are the measures you committed to. Each one is a card, each drills into how it is calculated:');
    kpis.forEach((r) => lines.push(bullet(`**${r.id}** — ${r.statement}`)));
    lines.push('');
    lines.push(
      'On sample data, show a plausible trend toward the target. On real data, show the '
      + 'real figure — and where there is no measurement yet, show "not measured yet" '
      + 'rather than a zero, because a zero reads as a real result.',
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
  lines.push('');

  lines.push('### 4. Guardrails — what must never happen');
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
  lines.push('One card per agent, showing what it owns and what it is allowed to decide on its own. From your plan:');
  roster.forEach((a) => lines.push(bullet(`**${a.name}** — owns ${a.stories.join(', ')}`)));
  lines.push('');
  lines.push('Each card carries a skills list. On real data there are no skills yet — show "no skills registered yet", not an empty box.');
  lines.push('');

  lines.push('### 8. Knowledge base');
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
  const roles = plan.stories
    .map((s) => s.narrative.match(/^\s*As an?\s+([^,]{2,40}),/i)?.[1]?.trim())
    .filter((x): x is string => Boolean(x))
    .filter((r) => !/^system$/i.test(r));
  return [...new Set(roles)].slice(0, 6);
}

/** Acceptance lines stored on the task row, mirroring the prompt's stop condition. */
export const COMMAND_CENTER_ACCEPTANCE: readonly string[] = [
  'Given the Command Center, when it is opened, then every tab is reachable and every card drills down one level.',
  'Given sample mode, when any tab is shown, then the sample data is visibly labelled as sample.',
  'Trust — no tab shows a number, a connection or a result the project has not actually produced.',
] as const;
