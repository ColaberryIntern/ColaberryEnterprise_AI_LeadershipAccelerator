import { StudentProject, ProjectTask } from './projectsStore';
import { getMode, DeliveryModeId } from '../../../services/deliveryModes';
import { WorkspaceRepoView } from '../../../services/workspaceRepoApi';

// buildProjectTaskPrompt — assembles the full Claude Code prompt the student
// copies for a single build task. Pure string composition (no side effects):
//   base build guidance
//   + the build task (project / release / story / owner / requirement)
//   + acceptance (= demo script + build-loop stop)
//   + task.prompt (the story's "vibe-code it" prompt)
//   + the selected delivery mode's "## How I want you to work" block
//   + a "your repo" pointer (when the student has provisioned one)
//   + the student's own context notes
//   + "Begin."
//
// The drawer shows a TRUNCATED, scrollable preview of this (never the whole
// thing at once); the full string is what lands on the clipboard.

/** A trimmed view of the repo the prompt needs — url + owner/name is enough. */
export type PromptRepo = Pick<WorkspaceRepoView, 'repo_url' | 'repo_owner' | 'repo_name'>;

function block(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

export function buildProjectTaskPrompt(
  project: StudentProject,
  task: ProjectTask,
  listName: string,
  modeId: DeliveryModeId,
  notes: string,
  repo?: PromptRepo | null,
): string {
  const mode = getMode(modeId);
  const sections: string[] = [];

  // Base build guidance — how we build here.
  sections.push(
    block(
      'Build context',
      [
        `You are helping me build "${project.name}" — ${project.descriptor}.`,
        'We build the walking skeleton first, then harden it. Work in small, testable, reversible steps.',
        'Every external call gets a timeout + capped retries. Every side effect is idempotent (safe to run twice).',
      ].join('\n'),
    ),
  );

  // The build task (project / release / story / owner / requirement).
  const taskLines: string[] = [`Section: ${listName}`, `Task: ${task.title}`];
  if (task.what) taskLines.push(`Story: ${task.what}`);
  if (task.release) taskLines.push(`Release: ${task.release}`);
  if (task.storyId) taskLines.push(`Story ID: ${task.storyId}`);
  if (task.owner) taskLines.push(`Owning agent(s): ${task.owner}`);
  if (task.req) {
    const req = project.reqs.find((r) => r.id === task.req);
    taskLines.push(
      `Requirement: ${task.req}${req ? ` — ${req.name} (currently ${req.state.toUpperCase()})` : ''}`,
    );
  }
  sections.push(block('Build task', taskLines.join('\n')));

  // Acceptance = demo script + build-loop stop.
  if (task.acceptance && task.acceptance.length > 0) {
    sections.push(
      block(
        'Acceptance — demo script + build-loop stop',
        task.acceptance.map((a) => `- ${a}`).join('\n') +
          '\n\nWhen every line above passes, the task is done — stop the build loop and show me the demo.',
      ),
    );
  }

  // The story's own Claude Code prompt.
  if (task.prompt) {
    sections.push(block('What to do', task.prompt));
  }

  // The selected delivery mode's working block (already an "## ..." block).
  sections.push(mode.workingBlock);

  // "Your repo" pointer — only when a workspace repo exists.
  if (repo && repo.repo_url) {
    sections.push(
      block(
        'Your workspace repo',
        [
          `Point Claude Code at this repo — it is your private workspace for this build:`,
          repo.repo_url,
          repo.repo_owner && repo.repo_name
            ? `Clone it, commit your work, and push. Then use "Commit & sync" in the portal to pull your latest state.`
            : `Clone it and commit your work there.`,
        ].join('\n'),
      ),
    );
  }

  // The student's own context notes.
  const trimmedNotes = notes.trim();
  if (trimmedNotes) {
    sections.push(block('My context', trimmedNotes));
  }

  sections.push('Begin.');

  return sections.join('\n\n');
}
