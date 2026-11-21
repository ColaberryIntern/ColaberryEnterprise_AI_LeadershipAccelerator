/**
 * STORY-900 — the Connected Demo every builder makes right after the Command Center.
 *
 * WHAT IT IS. A clickable preview of the FINISHED application: the screens the plan's
 * workspace stories describe, the split `scopeAgents` made between agents and people, and one
 * believable day of sample data shaped by the data model the Command Center proposed. It is
 * what a student, an intern or a client can put in front of someone in week one and say
 * "this is what we are building".
 *
 * WHY IT IS A SECOND STORY AND NOT A TENTH TAB. The Command Center's Trust criterion is "no
 * tab shows a number, a connection or a result the project has not actually produced". A demo
 * is nothing BUT numbers the project has not produced. Put on the same page, one of the two
 * has to lie. So the demo lives in its own directory, carries a permanent sample-data banner
 * on every screen, and the Command Center only ever LINKS to it.
 *
 * WHY IT IS INJECTED RATHER THAN GENERATED. Same reasons as STORY-000 (see
 * `commandCenterStory.ts`): identical in shape across a cohort so it can be taught and reviewed
 * in one sitting, impossible for the decomposer to rename or merge away, and outside the plan
 * and the traceability gate because it fulfils no requirement of the builder's system.
 *
 * WHY MOST OF IT IS CODE AND NOT PROMPT. The prompt asks an agent for judgement: one coherent
 * scenario, labels a person would use. Everything that must be TRUE is done by files the
 * platform ships (`docs/demo-kit/`): the engine that renders the screens, and the scaffold that
 * derives screens, navigation and the agent/person split from `.colaberry/plan.json`. A demo
 * that forgets the approval gate is a plausible demo of an unsafe system, and "please remember
 * the approval gate" is not a control.
 *
 * Pure functions only. No I/O. Type-only imports, so this module pulls in no model barrel.
 */
import type { BuildPlan, PlanRequirement, PlanStory, PlanAgent } from './planContract';

/** Stable. 900 keeps it clear of plan stories (STORY-001…) and still matches /^STORY-\d{3,4}$/. */
export const CONNECTED_DEMO_STORY_ID = 'STORY-900';
export const CONNECTED_DEMO_TITLE = 'STORY-900 · Build your connected demo';
export const CONNECTED_DEMO_NARRATIVE =
  'As a builder, I want a clickable preview of the finished application filled with sample data, '
  + 'so that anyone can see what I am building before it is built.';

/**
 * WHERE it lives. Not the repo root (that is the Command Center, see `commandCenterLocation.ts`)
 * and not `docs/` (the platform rewrites it on every sync). A Pages site served from `/` serves
 * `/demo/` with no extra configuration, so the demo URL is always `<command_center_url>demo/`.
 */
export const CONNECTED_DEMO_DIR = 'demo/';
export const CONNECTED_DEMO_ENTRY_PATH = `${CONNECTED_DEMO_DIR}index.html`;
export const CONNECTED_DEMO_SPEC_PATH = `${CONNECTED_DEMO_DIR}demo-spec.json`;
export const CONNECTED_DEMO_STANDALONE_PATH = `${CONNECTED_DEMO_DIR}standalone.html`;

/** The constant-content files `renderDocs` ships so the agent copies an engine instead of inventing one. */
export const DEMO_KIT_DIR = 'docs/demo-kit/';
export const DEMO_KIT_ENGINE_PATH = `${DEMO_KIT_DIR}index.html`;
export const DEMO_KIT_SCAFFOLD_PATH = `${DEMO_KIT_DIR}scaffold-demo-spec.mjs`;
export const DEMO_KIT_STANDALONE_PATH = `${DEMO_KIT_DIR}build-standalone.mjs`;
export const DEMO_KIT_CONTRACT_PATH = `${DEMO_KIT_DIR}DEMO_SPEC_CONTRACT.md`;

const PLAN_FILE_PATH = '.colaberry/plan.json';
const MANIFEST_FILE_PATH = '.colaberry/manifest.json';
const DATA_MODEL_PATH = 'command-center/data-model.json';

/**
 * Gherkin-style, exactly one line starting with "Trust", every path in a "then" clause so
 * `criterionPaths` can check it — the house pattern `COMMAND_CENTER_ACCEPTANCE` set.
 */
export const CONNECTED_DEMO_ACCEPTANCE: readonly string[] = [
  `Given the demo, when ${CONNECTED_DEMO_ENTRY_PATH} is opened, then every screen in its navigation is reachable and every record opens one level down.`,
  'Given any demo screen, when it is shown, then a permanent banner says the data is sample data and names the plan version the demo was built from.',
  `Given the demo, when any screen renders, then ${CONNECTED_DEMO_SPEC_PATH} is committed in this repo and every screen, row and count comes from that file rather than from values typed into the page.`,
  `Given ${PLAN_FILE_PATH}, when the demo is built, then every story with a workspace has a screen or a stated reason for having none, and every agent and every guardrail in the plan appears in the demo.`,
  'Given the Command Center, when it is opened, then it links to the demo and shows none of the demo\'s sample values as its own.',
  'Trust — no sample row breaks a guardrail in the plan, and no restricted field holds a value.',
] as const;

export function connectedDemoStorySeed(): { id: string; release: null; acceptance: string[] } {
  return { id: CONNECTED_DEMO_STORY_ID, release: null, acceptance: [...CONNECTED_DEMO_ACCEPTANCE] };
}

const bullet = (s: string): string => `- ${s}`;

const AUTONOMY_LABEL: Record<string, string> = {
  suggests: 'drafts for a person',
  acts_with_approval: 'prepares, then waits for a person to release it',
  acts_autonomously: 'completes on its own',
};

const guardrailsOf = (plan: BuildPlan): PlanRequirement[] =>
  (plan.requirements ?? []).filter((r) => r.kind === 'SAFE');

const workspaceStories = (plan: BuildPlan): PlanStory[] =>
  (plan.stories ?? []).filter((s) => s.workspace?.kind === 'workspace');

const headlessStories = (plan: BuildPlan): PlanStory[] =>
  (plan.stories ?? []).filter((s) => s.workspace?.kind !== 'workspace');

/**
 * The prompt the builder copies into their agent. Plan-driven and PURE: the same plan gives the
 * same text, so it is a shared, regenerable artifact and must never carry a secret or a clock.
 */
export function connectedDemoPrompt(plan: BuildPlan): string {
  const byId = <T extends { id: string }>(xs: T[]): T[] => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  const screens = byId(workspaceStories(plan));
  const background = byId(headlessStories(plan));
  const agents: PlanAgent[] = byId(plan.agents ?? []);
  const safes = byId(guardrailsOf(plan));
  const lines: string[] = [];

  lines.push('## Read this first');
  lines.push(
    'Your Command Center shows what is TRUE about this project today. This story builds the other '
    + 'half: a clickable preview of what the FINISHED application will look like, filled with sample '
    + 'data, so you can show someone the destination before you have built the road.',
  );
  lines.push(
    `It lives in \`${CONNECTED_DEMO_DIR}\`, apart from the Command Center, and every screen says it is `
    + 'sample data. Keep it that way. The Command Center must never show a made-up number as its own; '
    + 'the demo is made of nothing else. They link to each other and share nothing.',
  );
  lines.push(
    'If some of the demo is already built, this brief repairs it rather than replacing it. Step 1 '
    + 'finds out how much is there, and you only build what is missing.',
  );
  lines.push('');

  lines.push('## Step 1 — take stock before you change a single line');
  lines.push(bullet(`Read \`${PLAN_FILE_PATH}\`, \`${MANIFEST_FILE_PATH}\` and \`${DATA_MODEL_PATH}\`. Read \`${DEMO_KIT_CONTRACT_PATH}\`, which says what every field of the demo spec means.`));
  lines.push(bullet(`**If \`${DATA_MODEL_PATH}\` does not exist, STOP.** The sample data takes its shape from the data model, and the data model is the last tab of the Command Center. Tell me STORY-000 is not finished; do not invent tables.`));
  lines.push(bullet(`If \`${CONNECTED_DEMO_SPEC_PATH}\` already exists, read it and compare its \`source.plan_sha256\` with the manifest. Tell me whether the demo was built from the current plan or an older one, which screens exist, and what you propose to do. Then wait for me.`));
  lines.push('');

  lines.push('## Step 2 — lay the floor (two commands, no judgement)');
  lines.push('The platform ships the parts that must be right. Use them; do not rewrite them.');
  lines.push('```');
  lines.push(`mkdir -p ${CONNECTED_DEMO_DIR.replace(/\/$/, '')}`);
  lines.push(`cp ${DEMO_KIT_ENGINE_PATH} ${CONNECTED_DEMO_ENTRY_PATH}`);
  lines.push(`node ${DEMO_KIT_SCAFFOLD_PATH} --repo . --out ${CONNECTED_DEMO_SPEC_PATH}`);
  lines.push('```');
  lines.push(
    `\`${CONNECTED_DEMO_ENTRY_PATH}\` is the engine. It draws whatever \`${CONNECTED_DEMO_SPEC_PATH}\` describes and `
    + 'contains nothing about this project, so **you never edit it**. The scaffold reads the plan and the '
    + 'data model and writes a first spec: a screen per table, navigation, an approval queue for every '
    + 'agent that may not act alone, the agent and person roster, the guardrails, and seeded sample rows. '
    + 'It is correct and connected, and it reads like a database. Step 3 is where it becomes a product.',
  );
  lines.push(bullet(`Skip the scaffold if \`${CONNECTED_DEMO_SPEC_PATH}\` exists and \`source.refined\` is true: running it again would overwrite refined work. Repair that file in place instead.`));
  lines.push('');

  lines.push('## Step 3 — turn the floor into one believable day');
  lines.push(`Edit \`${CONNECTED_DEMO_SPEC_PATH}\` only. When you are done set \`source.refined\` to true.`);
  lines.push(bullet('**Pick one moment.** One person, one day, one time of day, with something in flight: a thing just finished, a thing in progress, and a decision waiting on a person. Every row on every screen must be consistent with that moment. If a row says a gap is open, nobody has filled it.'));
  lines.push(bullet('**Pick the person the home screen is for** from the roles below, and write the home screen for the first thing they need to know when they open it.'));
  lines.push(bullet('**Name things the way that person would.** Screen titles, column labels and status words come from the stories and requirements, not from table names. "Gaps", not "gap". "Waiting on Dana", not "pending".'));
  lines.push(bullet('**Never type a total.** A count on a tile is a `where` over the rows, so it is always right and it changes when someone clicks. If you want a tile to say 3, there must be three rows.'));
  lines.push(bullet('**Keep the navigation short.** A table a person would go looking for gets a place in it. A join table does not; it is reached from the record it belongs to.'));
  lines.push(bullet('**Make one decision ripple.** The approval a person gives must change something somewhere else (the `also` field): the held row is released, the badge clears, the log gains a line signed by a person.'));
  lines.push(bullet('**Sample people are fictional.** Invented names, `555-01xx` phone numbers, `@example.com` addresses. No real customer, employee or company of yours or anyone else\'s.'));
  lines.push(bullet(`**Fill in \`coverage\`:** one row per story in the plan, pointing at the screen that shows it, or saying in a sentence why nothing does. An honest "not shown" passes; a missing row does not.`));
  lines.push('');

  lines.push('## Your project');
  lines.push(`**${plan.project_name}.** ${plan.descriptor ?? ''}`.trim());
  lines.push('');
  lines.push('### Screens the plan promises');
  if (screens.length) {
    lines.push('Each of these stories gives a person something to open. Each needs a screen, or a row in `coverage` saying why it has none.');
    screens.forEach((s) => lines.push(bullet(`**${s.id}** ${s.title} — ${s.workspace?.ref ?? 'workspace not named'}${s.workspace?.action ? ` (action: ${s.workspace.action})` : ''}, release ${s.release}`)));
  } else {
    lines.push('No story in your plan names a workspace, so the plan promises no screens. Build the roster and rules screens, say so on the home screen, and stop there. Do not invent an application the plan does not describe.');
  }
  lines.push('');
  lines.push('### Work that happens in the background');
  if (background.length) {
    lines.push('These have no screen of their own. They show up as lines in the activity log and as agents on the "Who does what" screen.');
    background.forEach((s) => lines.push(bullet(`**${s.id}** ${s.title}${s.workspace?.ref ? ` — ${s.workspace.ref}` : ''}`)));
  } else {
    lines.push('None. Every story in your plan has a screen.');
  }
  lines.push('');
  lines.push('### Who does what');
  if (agents.length) {
    lines.push('This is the split your plan made between agents and people. The demo must show it: every log line is signed by an agent or a person, and every agent that may not act alone has something waiting in an approval queue.');
    agents.forEach((a) => {
      const stops = a.escalation_rules?.length ? ` Stops and asks when: ${a.escalation_rules.join('; ')}.` : '';
      lines.push(bullet(`**${a.name}** — ${AUTONOMY_LABEL[a.autonomy_level] ?? a.autonomy_level}. ${a.purpose}${stops}`));
    });
  } else {
    lines.push('Your plan has no scoped agents yet. Show who owns each story instead, and say on the roster screen that the agent team is not scoped.');
  }
  lines.push('');
  lines.push('### What the sample data must never show');
  if (safes.length) {
    lines.push('Guardrails apply to made-up data too. A demo in which the system breaks its own promise is worse than no demo.');
    safes.forEach((r) => lines.push(bullet(`**${r.id}** ${r.statement}`)));
    lines.push('For each one, the sample must contain a case where the guardrail visibly HOLDS, and write where in `guardrails[].shown_as`. A field the data model marks RESTRICTED has type `private` and no value in any row.');
  } else {
    lines.push('Your plan has no SAFE requirement, so there is nothing to show here. Say so on the rules screen.');
  }
  lines.push('');

  lines.push('## Step 4 — connect it to the Command Center, one way');
  lines.push(bullet(`On the Command Center's Overview tab add one card, "Preview the finished app", linking to \`${CONNECTED_DEMO_ENTRY_PATH}\`. A link only. Do not read \`${CONNECTED_DEMO_SPEC_PATH}\` from any Command Center tab.`));
  lines.push(bullet(`Run \`node ${DEMO_KIT_STANDALONE_PATH} ${CONNECTED_DEMO_DIR.replace(/\/$/, '')}\`. It writes \`${CONNECTED_DEMO_STANDALONE_PATH}\`: the whole demo in one file that opens with a double-click and attaches to an email.`));
  lines.push('');

  lines.push('## Step 5 — check it the way a stranger would, then tell me');
  lines.push(bullet('Open the demo. Click every navigation item, then one row on every list. Nothing may be a dead end.'));
  lines.push(bullet('Make the decision that is waiting. Confirm something else on screen changed because of it, then press Reset demo.'));
  lines.push(bullet('Read every guardrail above against the rows. If one is broken, fix the rows, not the guardrail.'));
  lines.push(bullet('Commit and push. Then tell me in plain language which person and which moment you chose, and which stories are not shown and why.'));
  lines.push('');

  lines.push('## Done means');
  CONNECTED_DEMO_ACCEPTANCE.forEach((a) => lines.push(bullet(a)));
  lines.push('');
  return lines.join('\n');
}

/** `docs/stories/STORY-900.md`. Same header shape as `commandCenterStoryDoc`. */
export function connectedDemoStoryDoc(plan: BuildPlan): string {
  return [
    `# ${CONNECTED_DEMO_STORY_ID} — Build your connected demo`,
    '',
    CONNECTED_DEMO_NARRATIVE,
    '',
    '**Release:** ahead of the plan — right after the Command Center, before your own stories',
    '**Owner:** you, with Claude Code',
    '**Blocked by:** STORY-000 — the demo takes its data shape from the Command Center\'s data model',
    '',
    '## The requirement this satisfies',
    '',
    'None of yours, and that is deliberate. Like the Command Center, the demo is not part of your',
    'system. The Command Center is the window onto what exists; the demo is the picture of what',
    'will. It has no row in `docs/TRACEABILITY.md`.',
    '',
    connectedDemoPrompt(plan),
  ].join('\n');
}

/** Both task columns from ONE call, the rule `commandCenterTaskColumns.ts` exists to enforce. */
export function connectedDemoTaskColumns(plan: BuildPlan): {
  story_id: string; title: string; narrative: string; build: string; acceptance: string[];
} {
  return {
    story_id: CONNECTED_DEMO_STORY_ID,
    title: CONNECTED_DEMO_TITLE,
    narrative: CONNECTED_DEMO_NARRATIVE,
    build: connectedDemoPrompt(plan),
    acceptance: [...CONNECTED_DEMO_ACCEPTANCE],
  };
}
