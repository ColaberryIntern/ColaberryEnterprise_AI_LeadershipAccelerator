/**
 * Project workspace prompt composer.
 *
 * Assembles the ready-to-paste Claude Code prompt for a single build task,
 * mirroring the advisor "Copy prompt" workspace but for a portal-native build:
 *
 *   [ base build guidance ]
 *   [ the build task: project, release, story, owner, requirement ]
 *   [ acceptance = demo script + build-loop stop ]
 *   [ the task's own "vibe-code" prompt ]
 *   [ selected delivery mode: "## How I want you to work" ]
 *   [ your repo — where your files live, commit when acceptance passes ]
 *   [ my context — the student's typed notes ]
 *
 * Kept deliberately separate from the curriculum promptBuilder: a build task is
 * a "make it work in the repo" prompt, not the artifact-submission flow the
 * global workstation prompt drives. The base guidance below can later be swapped
 * for an admin-configured `projects_workstation_prompt` setting.
 */
import { StudentProject, ProjectTask } from './projectsStore';
import { workingBlock } from '../../../services/deliveryModes';

const BASE_GUIDANCE =
  'You are helping me build this task in Claude Code, working inside my own project repo. ' +
  'This is a real build: write and run code, use what is already in the repo, and stop when the ' +
  'acceptance below is genuinely met — that acceptance is your demo script and your build-loop stop.';

export interface RepoRef {
  /** git clone/https URL of the student\'s workspace repo, if provisioned */
  url?: string;
  /** owner/name, for display */
  fullName?: string;
}

export function buildProjectTaskPrompt(
  project: StudentProject,
  task: ProjectTask,
  listName: string,
  modeId: string,
  notes: string,
  repo?: RepoRef,
): string {
  const parts: string[] = [];

  parts.push(`# ${task.title}`);
  parts.push(BASE_GUIDANCE);

  // The build task
  const req = task.req ? project.reqs.find((r) => r.id === task.req) : undefined;
  const taskLines = [
    `Project: ${project.name} — ${project.descriptor}`,
    `Release: ${task.release || listName}`,
  ];
  if (task.what) taskLines.push(`Story: ${task.what}`);
  if (task.owner) taskLines.push(`Owner agent(s): ${task.owner}`);
  if (req) taskLines.push(`Requirement: ${req.id} — ${req.name} (${req.state})`);
  else if (task.req) taskLines.push(`Requirement: ${task.req}`);
  parts.push(`## The build task\n${taskLines.join('\n')}`);

  // Acceptance = demo script + build-loop stop
  if (task.acceptance && task.acceptance.length > 0) {
    parts.push(
      '## Acceptance — your demo script and build-loop stop\n' +
        task.acceptance.map((a) => `- ${a}`).join('\n'),
    );
  }

  // The task's own build prompt
  if (task.prompt) {
    parts.push(`## Build prompt\n${task.prompt}`);
  }

  // Selected delivery mode — the "parameters" that change how the response comes back
  parts.push(workingBlock(modeId));

  // Your repo — where the files live and where work gets committed
  if (repo?.url) {
    parts.push(
      '## Your files\n' +
        `Work in my repo: ${repo.url}\n` +
        'My existing files and artifacts are there — read them before writing new code, and commit ' +
        'your work (a small, clear commit) when the acceptance passes so the portal can sync it.',
    );
  } else {
    parts.push(
      '## Your files\n' +
        'Connect your workspace repo in the portal so this prompt can point Claude Code at your files ' +
        'and your commits sync back here.',
    );
  }

  // The student's own context
  const trimmed = notes.trim();
  if (trimmed) {
    parts.push(`## My context\n${trimmed}`);
  }

  parts.push('Begin.');

  return parts.join('\n\n');
}
