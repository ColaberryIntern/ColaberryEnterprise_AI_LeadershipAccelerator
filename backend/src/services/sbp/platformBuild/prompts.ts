/**
 * platformBuild/prompts - the two briefs the platform's build runner hands to the agent. PURE.
 *
 * ## Why these wrap the student prompts instead of replacing them
 *
 * STORY-000 (`commandCenterPrompt`) and STORY-900 (`connectedDemoPrompt`) are the briefs that
 * produced the Command Centers and demos Ali reviewed on the ShiftFill runs. They carry every
 * "what good looks like" paragraph and every honesty rule. A second, platform-only brief would
 * be a weaker copy that drifts. So the platform build sends the SAME brief, preceded by one
 * block that changes only what is different about running unattended:
 *
 *   - nobody is there to answer, so it never stops to ask;
 *   - there is no remote, so no webhook, no commit, no push, no GitHub Pages;
 *   - the platform serves the result in a sandbox, so storage access is guarded and nothing
 *     loads from another origin;
 *   - only the files the platform will accept are written.
 *
 * The block says it wins where the two disagree, and it is first so it is read first.
 *
 * ## Why the file rules are this narrow
 *
 * They mirror `uploadContract.ts` exactly: the runner uploads index.html + command-center/** +
 * demo/demo-spec.json and nothing else, and only .html/.css/.js/.json/.md, because nginx's
 * static-file regex claims .svg/.png/.txt paths even under /api/ and would 404 them.
 */
import type { BuildPlan } from '../planContract';
import type { Schedule } from '../buildSchedule';
import { commandCenterPrompt } from '../commandCenterStory';
import { connectedDemoPrompt } from '../connectedDemoStory';
import { PLATFORM_BUILD_MAX_CC_BYTES } from './uploadContract';

/** The agent's last line when it believes it is finished. The runner checks for it. */
export const PLATFORM_BUILD_DONE = 'PLATFORM_BUILD_DONE';

const SHARED_RULES: readonly string[] = [
  'You are running unattended on the Colaberry platform build runner, not in a student\'s session. '
    + 'Nobody is watching and nobody will answer a question. The brief below was written for a '
    + 'student\'s session. Where it disagrees with this block, THIS BLOCK WINS.',
  '- Never stop to ask, confirm, or wait. Where the brief says to stop and ask, make the most '
    + 'reasonable choice the plan supports and carry on.',
  '- Do not run git, gh, curl, npm install, or anything that needs the network. There is no remote '
    + 'and no webhook. Skip every step about committing, pushing, syncing, webhooks or GitHub Pages.',
  '- The platform serves your work itself, inside a sandbox, from beside `index.html`. Keep every '
    + 'path relative. Load nothing from another origin: no CDNs, no web fonts, no external scripts.',
  '- Wrap every `localStorage` and `sessionStorage` access in try/catch.',
  '- Write only `.html`, `.css`, `.js`, `.json` or `.md` files. Draw icons and charts as inline SVG '
    + 'inside HTML or JS, never as separate image files.',
  '- Never modify anything under `.colaberry/` or `docs/`. They are inputs, and the platform '
    + 'replaces them with live data when it serves the page.',
];

/** Brief 1: the Command Center. Writes `index.html` and `command-center/**` only. */
export function platformCommandCenterPrompt(
  plan: BuildPlan,
  schedule: Schedule | null,
  opts: { projectId?: string } = {},
): string {
  return [
    '# PLATFORM BUILD MODE: read this block first',
    '',
    ...SHARED_RULES,
    '- Build everything the brief\'s build steps describe: the root `index.html` and everything under '
      + '`command-center/`, including `command-center/data-model.json` (the demo is built from it next).',
    `- Keep \`index.html\` plus \`command-center/\` under ${Math.floor(PLATFORM_BUILD_MAX_CC_BYTES / 1000)} KB in total.`,
    '- Create no other files.',
    `- When the Command Center is complete, end with this exact line on its own: ${PLATFORM_BUILD_DONE}`,
    '',
    '---',
    '',
    commandCenterPrompt(plan, schedule ?? undefined, { projectId: opts.projectId }),
  ].join('\n');
}

/** Brief 2: the Connected Demo. Writes `demo/demo-spec.json` only; the platform hosts the engine. */
export function platformDemoPrompt(plan: BuildPlan): string {
  return [
    '# PLATFORM BUILD MODE: read this block first',
    '',
    ...SHARED_RULES,
    '- The Command Center is already built beside you, including `command-center/data-model.json`.',
    '- Your only output is `demo/demo-spec.json`. Start from the scaffold the brief names '
      + '(`node docs/demo-kit/scaffold-demo-spec.mjs --repo .`) and refine it as the brief describes. '
      + 'It must satisfy `docs/demo-kit/DEMO_SPEC_CONTRACT.md`.',
    '- Do not write `demo/index.html` or `demo/standalone.html`, and do not run the standalone '
      + 'builder. The platform serves its own copy of the engine around your spec.',
    '- Set `app.command_center_href` to `../index.html`.',
    `- When the spec is complete and valid JSON, end with this exact line on its own: ${PLATFORM_BUILD_DONE}`,
    '',
    '---',
    '',
    connectedDemoPrompt(plan),
  ].join('\n');
}
