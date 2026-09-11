import { ENRICHMENT_SCHEMA_VERSION, enrichmentPathFor } from './storyEnrichmentContract';

/**
 * enrichmentPromptBlock - the paragraph every story prompt carries so the
 * story participates in continuous enrichment. PURE.
 *
 * One shared block rather than a sentence per prompt, because the brief's
 * requirement is that EVERY story prompt invokes the same protocol through
 * one mechanism, and a test (`buildStoryPrompt.test.ts`) holds each prompt
 * to it. The wording is written for the agent that will read it, which is
 * why it is concrete about the path, the shape and the two things it must
 * not do, and says nothing about why the platform wants it.
 */

export const ENRICHMENT_BLOCK_HEADING = '## When you finish: record what this story taught the project';

export function enrichmentPromptBlock(input: { projectId: string; storyId: string }): string {
  const path = enrichmentPathFor(input.storyId);
  const example = {
    schemaVersion: ENRICHMENT_SCHEMA_VERSION,
    projectId: input.projectId,
    storyId: input.storyId,
    projectTruthBaseRevision: 0,
    observedAt: '<ISO timestamp>',
    sourceCommitSha: '<sha of your last commit, or null>',
    factProposals: [
      { dimension: 'integrations', value: 'Reads open tickets from the Zendesk API.', evidence: 'src/zendesk/client.ts' },
    ],
    decisions: [
      { statement: 'Poll every 5 minutes rather than subscribe to webhooks.', rationale: 'no webhook access in the sandbox', evidence: 'src/poll.ts' },
    ],
    limitations: [
      { statement: 'Attachments over 10MB are skipped.', evidence: 'src/zendesk/client.ts#L40' },
    ],
    demonstrationEvidence: [{ kind: 'test', ref: 'zendesk.client.test.ts' }],
    measurementEvents: [],
  };

  return [
    ENRICHMENT_BLOCK_HEADING,
    `Before you start, read \`.colaberry/plan.json\` and \`docs/stories/STORY-000.md\` (the section`,
    '"What the platform understands about this project"). That is the current truth. Note anything',
    'this story adds to it: a system it turns out to talk to, a decision you had to make, a limit you',
    'discovered, a role or approval point that appeared.',
    '',
    `When the acceptance criteria pass, write \`${path}\` with exactly this shape:`,
    '',
    // A plain fence, not ```json: the STORY-000 prompt tests extract THE json
    // block for progress.json and hold the prompt to exactly one of them.
    '```',
    JSON.stringify(example, null, 2),
    '```',
    '',
    'Rules for that file:',
    '- Only what this story\'s work actually shows. Each entry names the file, commit or test that',
    '  proves it. No evidence, no entry.',
    '- `dimension` is one of: problem, desired_outcome, actors, current_workflow, inputs, outputs,',
    '  data, systems, integrations, pain_points, exceptions, approval_points, security_context,',
    '  ai_opportunities, human_only_decisions, assumptions, unknowns, constraints,',
    '  success_definition, delivery_profile.',
    '- Never claim a business result. What the business wanted, what hurt before, what "success"',
    '  means: those are the student\'s statements, not the build\'s, and the platform refuses them',
    '  from this file.',
    '- If you found something that contradicts the truth, still write it: the platform files it as',
    '  a question for the student rather than replacing what they confirmed.',
    '- `projectTruthBaseRevision` is `truth_revision` from `.colaberry/manifest.json`, or 0 if absent.',
    '- Commit it with the story. The platform reads it on push; pushing it twice changes nothing.',
  ].join('\n');
}
