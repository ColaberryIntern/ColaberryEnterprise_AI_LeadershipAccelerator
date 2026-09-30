/**
 * seedInterviewRubrics.ts — BC #9985688999 (Classroom Week View, Epic 3)
 *
 * Seeds one InterviewRubric row per week (1–12). Each rubric contains 3 questions
 * with keyword-based expected_topics used by scoreAnswer() for deterministic scoring.
 * Total max_points per week = 100 (30 + 40 + 30). computeInterviewScore() normalises
 * earned points to 0–100, so the sum must equal 100 for the display to be accurate.
 *
 * Idempotent: uses findOrCreate keyed on week_number. Re-running never duplicates rows.
 * To update questions for a specific week, pass --week <n> --overwrite.
 *
 * Usage:
 *   npx ts-node src/seeds/seedInterviewRubrics.ts
 *   npx ts-node src/seeds/seedInterviewRubrics.ts --week 3
 *   npx ts-node src/seeds/seedInterviewRubrics.ts --week 3 --overwrite
 */

import { connectDatabase } from '../config/database';
import '../models';
import InterviewRubric from '../models/InterviewRubric';
import type { RubricQuestion } from '../models/InterviewRubric';

// ─── Question bank ──────────────────────────────────────────────────────────

const RUBRICS: Record<number, RubricQuestion[]> = {
  1: [
    {
      id: 'w1-q1',
      text: 'How did you set up Claude Code on your project, and what role does the CLAUDE.md file play in governing Claude\'s autonomous behavior?',
      expected_topics: ['claude.md', 'init', 'settings', 'permissions', 'autonomous'],
      max_points: 30,
    },
    {
      id: 'w1-q2',
      text: 'Name at least three Claude Code tools you used this week (e.g., Read, Edit, Bash, Glob, Grep). When would you choose each one over the others?',
      expected_topics: ['read', 'edit', 'bash', 'glob', 'grep'],
      max_points: 40,
    },
    {
      id: 'w1-q3',
      text: 'Explain the Build→Break→Harden loop. Give a concrete example from your project work this week.',
      expected_topics: ['build', 'break', 'harden', 'test', 'failure'],
      max_points: 30,
    },
  ],

  2: [
    {
      id: 'w2-q1',
      text: 'What is an agent skill in Claude Code and how does it differ from a regular prompt? Describe a skill you created or used.',
      expected_topics: ['skill', 'slash', 'context', 'specialized', 'invoke'],
      max_points: 30,
    },
    {
      id: 'w2-q2',
      text: 'How do you structure a prompt to get Claude to take autonomous action on a multi-step task? What must the prompt include?',
      expected_topics: ['context', 'tools', 'autonomous', 'steps', 'goal'],
      max_points: 40,
    },
    {
      id: 'w2-q3',
      text: 'Describe a moment where Claude\'s autonomous behavior surprised you. How did you adjust your prompting or CLAUDE.md rules to get better results?',
      expected_topics: ['prompt', 'adjust', 'rules', 'claude.md', 'behavior'],
      max_points: 30,
    },
  ],

  3: [
    {
      id: 'w3-q1',
      text: 'Walk through how you make an API call to Claude using the Anthropic SDK. Which parameters matter most for a production use-case?',
      expected_topics: ['api', 'anthropic', 'model', 'messages', 'max_tokens'],
      max_points: 30,
    },
    {
      id: 'w3-q2',
      text: 'What is context window management and why does it matter when building a workflow assistant? How did you handle it in your project?',
      expected_topics: ['context', 'window', 'tokens', 'truncate', 'summarize'],
      max_points: 40,
    },
    {
      id: 'w3-q3',
      text: 'Describe a workflow you built using the Claude API: what was the input, what was the output, and how did you validate that it was correct?',
      expected_topics: ['workflow', 'input', 'output', 'validate', 'test'],
      max_points: 30,
    },
  ],

  4: [
    {
      id: 'w4-q1',
      text: 'Explain chain-of-thought prompting. When does it improve results and when is it unnecessary overhead?',
      expected_topics: ['chain-of-thought', 'reasoning', 'step', 'cot', 'think'],
      max_points: 30,
    },
    {
      id: 'w4-q2',
      text: 'What is few-shot prompting? Give a specific example where you used it in your project and explain why it produced better output.',
      expected_topics: ['few-shot', 'example', 'pattern', 'template', 'demonstrate'],
      max_points: 40,
    },
    {
      id: 'w4-q3',
      text: 'Describe your process for iterating on a prompt that isn\'t producing the results you need. What signals tell you it needs changing?',
      expected_topics: ['iterate', 'evaluate', 'output', 'adjust', 'test'],
      max_points: 30,
    },
  ],

  5: [
    {
      id: 'w5-q1',
      text: 'What is the Model Context Protocol (MCP) and what problem does it solve for AI systems? Why was it created?',
      expected_topics: ['mcp', 'protocol', 'tools', 'resources', 'server'],
      max_points: 30,
    },
    {
      id: 'w5-q2',
      text: 'Describe the client-server architecture of MCP. Who is the client, who is the server, and how do they communicate?',
      expected_topics: ['client', 'server', 'transport', 'stdio', 'request'],
      max_points: 40,
    },
    {
      id: 'w5-q3',
      text: 'What MCP tools or resources did you connect to Claude in your project? How did the connection change what Claude could do?',
      expected_topics: ['tool', 'resource', 'connect', 'capability', 'integrate'],
      max_points: 30,
    },
  ],

  6: [
    {
      id: 'w6-q1',
      text: 'How do you build a custom MCP server? What components must it implement and how does Claude discover its capabilities?',
      expected_topics: ['server', 'schema', 'tools', 'manifest', 'implement'],
      max_points: 30,
    },
    {
      id: 'w6-q2',
      text: 'What security considerations apply when exposing tools through MCP? How do you prevent misuse or unauthorized access?',
      expected_topics: ['security', 'authentication', 'authorization', 'validate', 'scope'],
      max_points: 40,
    },
    {
      id: 'w6-q3',
      text: 'How did composing multiple MCP servers together change the capability of your system? Describe a specific example from your project.',
      expected_topics: ['compose', 'multiple', 'orchestrate', 'capability', 'combine'],
      max_points: 30,
    },
  ],

  7: [
    {
      id: 'w7-q1',
      text: 'What is a subagent in Claude Code and when should you spawn one instead of handling a task in the main session?',
      expected_topics: ['subagent', 'context', 'isolate', 'parallel', 'spawn'],
      max_points: 30,
    },
    {
      id: 'w7-q2',
      text: 'Describe the pattern of using a read-only exploration subagent before editing. Why does this protect the main session\'s context window?',
      expected_topics: ['explore', 'read-only', 'context', 'research', 'main'],
      max_points: 40,
    },
    {
      id: 'w7-q3',
      text: 'How did you use subagents in your project this week? What did each subagent return and how did you use its output in the main session?',
      expected_topics: ['output', 'summary', 'verify', 'result', 'findings'],
      max_points: 30,
    },
  ],

  8: [
    {
      id: 'w8-q1',
      text: 'What is the difference between sequential and parallel agent execution? When would you choose each approach and why?',
      expected_topics: ['sequential', 'parallel', 'depend', 'independent', 'orchestrate'],
      max_points: 30,
    },
    {
      id: 'w8-q2',
      text: 'How do you share state or results between agents in a multi-agent system? What patterns prevent one agent\'s failure from corrupting another?',
      expected_topics: ['state', 'handoff', 'isolation', 'failure', 'message'],
      max_points: 40,
    },
    {
      id: 'w8-q3',
      text: 'Describe the multi-agent architecture you designed for your project: how many agents, what are their roles, and how do they coordinate?',
      expected_topics: ['architecture', 'role', 'coordinate', 'design', 'system'],
      max_points: 30,
    },
  ],

  9: [
    {
      id: 'w9-q1',
      text: 'What does idempotency mean for an AI system? Give a concrete example from your project where you designed for it.',
      expected_topics: ['idempotent', 'safe', 'replay', 'duplicate', 'twice'],
      max_points: 30,
    },
    {
      id: 'w9-q2',
      text: 'Describe your retry and circuit-breaker strategy for an external API call in your system. What triggers the circuit to open and how does it recover?',
      expected_topics: ['retry', 'circuit', 'backoff', 'timeout', 'recover'],
      max_points: 40,
    },
    {
      id: 'w9-q3',
      text: 'What is failure-first design? Walk through how you applied it to a specific component of your project.',
      expected_topics: ['failure', 'first', 'error', 'handle', 'fallback'],
      max_points: 30,
    },
  ],

  10: [
    {
      id: 'w10-q1',
      text: 'Why does an enterprise AI system need a governance layer? What does it contain and what would break without it?',
      expected_topics: ['governance', 'audit', 'log', 'compliance', 'policy'],
      max_points: 30,
    },
    {
      id: 'w10-q2',
      text: 'Describe the structured logging you implemented in your system. What fields appear in every log line and why is each field there?',
      expected_topics: ['structured', 'json', 'timestamp', 'event', 'correlation'],
      max_points: 40,
    },
    {
      id: 'w10-q3',
      text: 'A compliance team asks to audit all AI decisions made in your system over the last 30 days. Walk through exactly what data exists and how you\'d surface it.',
      expected_topics: ['audit', 'log', 'trace', 'correlation', 'decision'],
      max_points: 30,
    },
  ],

  11: [
    {
      id: 'w11-q1',
      text: 'If you had 5 minutes to present your AI system to a C-suite audience, what would you cover? What metrics or outcomes would you lead with?',
      expected_topics: ['roi', 'metric', 'business', 'value', 'outcome'],
      max_points: 30,
    },
    {
      id: 'w11-q2',
      text: 'How did you design your system for the scale it needs to operate at? What would you change to handle 10x the current load?',
      expected_topics: ['scale', 'architecture', 'bottleneck', 'design', 'performance'],
      max_points: 40,
    },
    {
      id: 'w11-q3',
      text: 'What was the hardest technical decision you made building your capstone system? What alternatives did you consider and why did you choose as you did?',
      expected_topics: ['tradeoff', 'decision', 'consider', 'alternative', 'reason'],
      max_points: 30,
    },
  ],

  12: [
    {
      id: 'w12-q1',
      text: 'Summarize the end-to-end architecture of your AI system. What are the key components and how do they connect?',
      expected_topics: ['architecture', 'component', 'connect', 'flow', 'service'],
      max_points: 30,
    },
    {
      id: 'w12-q2',
      text: 'A senior engineer asks why you chose Claude Code over a traditional scripted approach. Make the case for the architecture you built.',
      expected_topics: ['claude', 'autonomous', 'benefit', 'deterministic', 'agent'],
      max_points: 40,
    },
    {
      id: 'w12-q3',
      text: 'What would you do differently if you started this project again? What did you learn about building reliable AI systems that you didn\'t know at week 1?',
      expected_topics: ['learn', 'improve', 'reliable', 'test', 'iterate'],
      max_points: 30,
    },
  ],
};

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  await connectDatabase();

  const args = process.argv.slice(2);
  const weekArg = args.includes('--week') ? parseInt(args[args.indexOf('--week') + 1], 10) : null;
  const overwrite = args.includes('--overwrite');

  const weeksToSeed = weekArg ? [weekArg] : Object.keys(RUBRICS).map(Number);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const week of weeksToSeed) {
    const questions = RUBRICS[week];
    if (!questions) {
      console.error(JSON.stringify({ level: 'error', event: 'seed_rubric_skip', week, reason: 'no_questions_defined' }));
      continue;
    }

    const [rubric, wasCreated] = await InterviewRubric.findOrCreate({
      where: { week_number: week },
      defaults: { questions },
    });

    if (wasCreated) {
      created++;
      console.log(JSON.stringify({ level: 'info', event: 'seed_rubric_created', week }));
    } else if (overwrite) {
      await rubric.update({ questions });
      updated++;
      console.log(JSON.stringify({ level: 'info', event: 'seed_rubric_updated', week }));
    } else {
      skipped++;
      console.log(JSON.stringify({ level: 'info', event: 'seed_rubric_skipped', week, reason: 'already_exists_use_overwrite' }));
    }
  }

  console.log(JSON.stringify({
    level: 'info',
    event: 'seed_rubrics_complete',
    created,
    updated,
    skipped,
    total: weeksToSeed.length,
  }));

  process.exit(0);
}

run().catch((err) => {
  console.error(JSON.stringify({ level: 'error', event: 'seed_rubrics_fatal', error: String(err) }));
  process.exit(1);
});
