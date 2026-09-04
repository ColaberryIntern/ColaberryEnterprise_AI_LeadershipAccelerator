import { DraftRevisionInput } from '../../services/certPrep/certQuestionBankService';

/**
 * CCAR-F practice items — Colaberry-authored, sample bank v0.
 *
 * PROVENANCE. Every item here was written for Colaberry against the PUBLISHED
 * CCAR-F blueprint (five domains, thirty task statements, six named scenarios).
 * None derives from any purchased or third-party question bank: no wording,
 * explanation or answer key has been copied, paraphrased or reworked from
 * another product. That is a hard rule for this file — if an item cannot be
 * traced to the public blueprint and our own labs, it does not belong here.
 *
 * DOMAIN NUMBERING IS ANTHROPIC'S, NOT THE COMMUNITY'S. D2 is Tool Design & MCP
 * (18%) and D3 is Claude Code Configuration (20%), so D2 carries LESS weight
 * than D3. Community guides imply descending-weight order and get this
 * backwards; these items were re-tagged on 2026-09-03 after the official exam
 * guide was read. Check the label, never the digit, when adding items.
 *
 * EVERY ITEM SHIPS AS A DRAFT. `createDraftRevision` refuses to write anything
 * else, and `setReviewStatus` refuses to approve without a named reviewer. These
 * have NOT been through a second reader; loading them does not make them
 * servable, and it must not.
 *
 * On difficulty: the items that behave like the real exam are the ones where two
 * options are defensible and one is merely better. A `hard` item here should
 * always have at least one strong distractor a competent practitioner would
 * seriously consider — see A5, B2 and D2.
 */

const TRACK = 'ccar-f';
const BP = '1.0-2026-07';

const item = (
  key: string,
  domain: string,
  objective: string,
  scenario: string,
  difficulty: 'easy' | 'medium' | 'hard',
  stem: string,
  options: [string, string][],
  correct: string[],
  rationale: string,
  distractors: Record<string, string>,
): DraftRevisionInput => ({
  question_key: key,
  track_id: TRACK,
  blueprint_version: BP,
  domain_id: domain,
  objective_id: objective,
  scenario_family: scenario,
  stem,
  options: options.map(([k, text]) => ({ key: k, text })),
  correct_keys: correct,
  select_count: correct.length,
  rationale,
  distractor_rationales: distractors,
  difficulty,
  author: 'colaberry',
});

export const CCAR_F_SAMPLE_ITEMS: DraftRevisionInput[] = [
  // ── Scenario S3 · Multi-Agent Research System ─────────────────────────────
  item('CCARF-A1', 'D1', 'D1.3', 'S3', 'medium',
    'Each researcher runs as a subagent rather than as a loop inside the orchestrator. What is the primary architectural reason this helps?',
    [['A', 'Subagents execute in parallel, so wall-clock time is always lower'],
     ['B', "Each subagent has an isolated context window; only its returned summary enters the orchestrator's context"],
     ['C', 'Subagents share the orchestrator context, so retrieved documents are available to synthesis automatically'],
     ['D', 'Subagents can call tools the orchestrator is not permitted to call']],
    ['B'],
    'The isolation is the point. The researcher spends its own context on raw retrieved text and returns a condensed finding, so the orchestrator only ever sees the summary — which is exactly what fixes context filling before synthesis.',
    { A: 'Parallelism is often a benefit but not the architectural reason, and is not guaranteed — subagents can run sequentially. This is the common mistake of treating subagents as a performance feature rather than a context-management one.',
      C: 'The opposite of how subagent context works, and a misconception that leads to orchestrators assuming they can see documents they were never passed.',
      D: 'Permissions are configured, not inherited. A subagent does not acquire capability the parent lacks.' }),

  item('CCARF-A2', 'D1', 'D1.6', 'S3', 'medium',
    'Which two tasks in this system are appropriate to delegate to a subagent?',
    [['A', 'Broad search across the corpus where most retrieved text will be discarded'],
     ['B', 'Independent verification of a drawn conclusion by a differently-prompted agent'],
     ['C', 'A step where the orchestrator must reason over every intermediate document itself'],
     ['D', 'Formatting the final citation list from a fixed set of fields']],
    ['A', 'B'],
    'A is the canonical subagent case: high token volume in, small answer out. B is a genuine check because a second agent with a different prompt and a clean context can disagree; the same agent in the same context cannot meaningfully check itself.',
    { C: 'If the orchestrator genuinely needs every document, delegating hides the very material it must reason over. Recognising when NOT to delegate is the harder half of this skill.',
      D: 'Fixed fields to fixed output is deterministic work. A model in this path adds cost, latency and a failure mode for no benefit.' }),

  item('CCARF-A3', 'D1', 'D1.2', 'S3', 'hard',
    'The team wants researchers to compare findings with each other before synthesis, and proposes moving from hub-and-spoke to peer-to-peer across twelve researcher agents. What is the strongest objection?',
    [['A', 'Peer-to-peer topologies are not supported by the Agent SDK'],
     ['B', 'Cross-agent message volume grows quadratically and errors propagate with no single point of arbitration'],
     ['C', 'Peer-to-peer requires all agents to share one context window'],
     ['D', 'Twelve agents exceeds the maximum concurrent subagent limit']],
    ['B'],
    'Twelve peers is up to sixty-six pairwise channels, and a wrong finding circulates instead of being caught. The orchestrator already occupies the arbitration role, so comparison belongs there, over the condensed findings.',
    { A: 'Nothing prevents building it. "The tool will not let me" avoids the architectural argument rather than making it.',
      C: 'Peers exchange messages; they do not share context. This confuses communication with context sharing.',
      D: 'Invents a limit. Concurrency is a resource question, not the design flaw here.' }),

  item('CCARF-A4', 'D1', 'D1.1', 'S3', 'hard',
    'Occasionally a run ends with a half-written synthesis and no error raised. Logs show the final response carried stop_reason "max_tokens". What is the defect?',
    [['A', 'The loop treats any stop reason other than tool_use as successful completion, so a truncated response is accepted as final'],
     ['B', 'The model exceeded its context window and silently dropped the earliest messages'],
     ['C', 'max_tokens is not a valid stop reason and indicates a malformed request'],
     ['D', 'The loop is missing a maximum turn limit']],
    ['A'],
    'The loop continues while the stop reason is tool_use and exits otherwise, so end_turn and max_tokens are handled identically. Truncation is a failure and needs explicit handling: continue generation, or fail loudly. This is the most common silent-corruption bug in agent loops.',
    { B: 'A different failure that would not produce this stop reason — plausible enough to catch people who conflate output-length limits with context limits.',
      C: 'max_tokens is a normal stop reason meaning the output-token ceiling was reached.',
      D: 'A turn cap protects against runaway loops, not truncated output. The run terminated; that is the problem.' }),

  item('CCARF-A5', 'D5', 'D5.3', 'S3', 'medium',
    'One researcher subagent fails on a corpus timeout. What should the handoff contract specify?',
    [['A', 'The subagent retries until it succeeds, so the orchestrator never sees failure'],
     ['B', 'The subagent returns a structured result with an explicit status, and the orchestrator decides whether to proceed, retry, or report the gap'],
     ['C', 'The orchestrator aborts the entire run so no partial answer can mislead the user'],
     ['D', 'The subagent returns its best guess without noting the timeout, so synthesis is not disrupted']],
    ['B'],
    'Failure is data. A typed status field lets the orchestrator degrade deliberately — synthesise from eleven of twelve and say so. The decision belongs at the level that can see the whole picture.',
    { A: 'Unbounded retry inside a subagent is how a run hangs forever with no visibility. Retries need a cap and must surface.',
      C: 'Defensible but too blunt: one timeout out of twelve does not invalidate the answer provided the gap is disclosed. This is the strongest distractor, and should catch anyone over-applying fail-fast.',
      D: 'Silently converting a failure into a confident answer — the worst option, and the one systems drift into by default.' }),

  item('CCARF-A6', 'D1', 'D1.7', 'S3', 'medium',
    'A user wants to see two different synthesis approaches over the same completed research. What is the appropriate mechanism?',
    [['A', 'Re-run the whole pipeline twice with different synthesis prompts'],
     ['B', 'Fork the session after the research phase and run each synthesis from that shared state'],
     ['C', 'Ask the orchestrator to produce both syntheses in a single response'],
     ['D', 'Persist the findings to a database and start two unrelated sessions']],
    ['B'],
    'Forking is exactly this: shared history up to the branch point, independent continuations after it. The expensive research runs once.',
    { A: 'Pays for the whole research phase twice and risks the two runs retrieving different documents, so the syntheses stop being comparable.',
      C: 'One response producing both lets them contaminate each other — the second is written having seen the first.',
      D: 'Workable but discards conversational state and reasoning context. A genuine distractor for anyone who reaches for a database by reflex.' }),

  item('CCARF-A7', 'D1', 'D1.1', 'S3', 'easy',
    'Which part of this system should NOT be agentic?',
    [['A', "Decomposing the user's question into sub-questions"],
     ['B', 'Deciding which corpus sections a researcher explores'],
     ['C', 'Rendering the citation list into the house reference format'],
     ['D', 'Judging whether retrieved findings actually answer the question']],
    ['C'],
    'Known inputs, fixed rules, one right answer. Deterministic code is cheaper, testable, and cannot hallucinate a reference. The general rule: if you can write the rules down, write the rules.',
    { A: 'Genuinely open-ended and varies per question — agentic.',
      B: 'Requires judgement against what has already been found — agentic.',
      D: 'Relevance judgement over unstructured text is precisely what the model is for.' }),

  // ── Scenario S1 · Customer Support Resolution Agent ────────────────────────
  item('CCARF-B1', 'D2', 'D2.1', 'S1', 'medium',
    'A support agent issued a $180 refund despite the system prompt stating a $50 limit clearly. Where does the cap belong?',
    [['A', 'Repeated more forcefully in the system prompt, in capitals'],
     ['B', "Enforced inside the refund tool's implementation, which rejects any amount over $50"],
     ['C', 'Added as a few-shot example showing a refund being declined'],
     ['D', 'Handled by instructing the model to double-check the amount before calling the tool']],
    ['B'],
    'A business rule with money attached is enforced where it cannot be talked around. The tool validates its own input and returns an error the agent must handle. Prompts express intent; code enforces limits.',
    { A: 'The instinct to fix a prompt-adherence problem with more prompt. It raises compliance and never reaches certainty, which is not good enough at $180 a time.',
      C: 'Few-shot examples shape behaviour, and behaviour is probabilistic. Same failure as A with extra steps.',
      D: 'Asking the model to check itself inside the same context: if it misread the limit once it can misread it twice.' }),

  item('CCARF-B2', 'D1', 'D1.5', 'S1', 'hard',
    'Compliance wants every refund over $20 logged to an audit system before it executes, without changing the refund tool. What is the right mechanism?',
    [['A', 'A PreToolUse hook that inspects the call, writes the audit record, and can block execution'],
     ['B', 'A PostToolUse hook that records what happened after the refund is issued'],
     ['C', 'A wrapper agent that reviews each refund before the tool is called'],
     ['D', 'Instructing the model to call an audit tool before calling the refund tool']],
    ['A'],
    'It fires before execution, sees the arguments, can write the record and deny the call. Deterministic, outside the model\'s discretion, and requires no change to the tool — exactly the stated constraint.',
    { B: 'Right mechanism, wrong moment. "Before it executes" is the requirement and post-hoc logging cannot block anything. The strongest distractor here.',
      C: 'Puts a model in a control path that needs a guarantee, plus latency and cost.',
      D: 'Makes an audit obligation depend on the model choosing to comply — the same class of error as B1.' }),

  item('CCARF-B3', 'D5', 'D5.2', 'S1', 'medium',
    'Which two changes best prevent an agent spending forty turns on a ticket it can never resolve?',
    [['A', 'A maximum turn limit that ends the run and escalates when reached'],
     ['B', 'An explicit escalation tool the model can call as soon as it judges the ticket unresolvable'],
     ['C', 'Raising max_tokens so the agent can finish its reasoning'],
     ['D', 'Adding "do not loop" to the system prompt']],
    ['A', 'B'],
    'A is the hard backstop every agentic loop needs — a bound that does not depend on the model\'s judgement. B is the graceful path: most looping happens because no legitimate exit was offered.',
    { C: 'Confuses output length with turn count. More tokens per turn does not reduce turns.',
      D: 'An instruction where a control is needed — the same reflex as B1 option A.' }),

  item('CCARF-B4', 'D1', 'D1.4', 'S1', 'medium',
    'When the agent escalates, what must the handoff carry for the human to be effective?',
    [['A', 'The full untruncated transcript of every turn'],
     ['B', 'A structured summary: what was attempted, what the customer wants, what blocked resolution, and the actions already taken'],
     ['C', 'The ticket ID alone, so the human forms an independent view'],
     ['D', "The agent's confidence score for each candidate resolution"]],
    ['B'],
    'A handoff is a contract with defined fields. "Actions already taken" is the one people forget, and the one that stops a human re-issuing a refund that already went out.',
    { A: 'Technically complete and practically useless — it makes the human do the summarisation the agent should have done.',
      C: 'Discards everything already learned and guarantees the customer repeats themselves.',
      D: 'Self-reported confidence is not calibrated and is not what the human needs in order to act.' }),

  // ── Scenario S2 · Code Generation with Claude Code ─────────────────────────
  item('CCARF-C1', 'D3', 'D3.1', 'S2', 'hard',
    'A security rule must apply on every developer machine and must not be overridable by anything a developer can edit. Where does it go?',
    [['A', "The project's .claude/settings.json, committed to the repo"],
     ['B', 'An enterprise managed policy settings file, deployed by IT'],
     ['C', 'The root CLAUDE.md, stated as a mandatory rule'],
     ['D', "Each developer's ~/.claude/settings.json, distributed at onboarding"]],
    ['B'],
    'Managed policy sits at the top of the settings precedence chain and is not editable by the developer. It is the only option here that survives someone deciding otherwise locally.',
    { A: 'The right home for team defaults, but settings.local.json takes precedence over it — so a developer can override it.',
      C: 'A very common wrong answer. CLAUDE.md is instruction to the model, not enforcement; guidance the model usually follows is not a security control.',
      D: 'User settings sit lowest in precedence, and a file in the developer\'s home directory is by definition developer-editable.' }),

  item('CCARF-C2', 'D3', 'D3.1', 'S2', 'medium',
    'A monorepo\'s frontend and backend have different conventions. How should it be structured so each applies when relevant?',
    [['A', 'One root CLAUDE.md containing every convention for every area'],
     ['B', 'A root CLAUDE.md for shared rules, plus a CLAUDE.md in each subtree, loaded additively when working there'],
     ['C', 'Separate CLAUDE.md files swapped in by a script depending on the task'],
     ['D', 'Conventions moved into slash commands invoked per area']],
    ['B'],
    'Subdirectory files load in addition to the root when work happens in that subtree. Shared rules stay in one place; local conventions live next to the code they govern.',
    { A: 'Works, but every session pays the context cost of every area, and the file rots as it grows. Right at small scale, wrong here.',
      C: 'Reinvents a built-in mechanism with a fragile script, and is wrong whenever the script does not run.',
      D: 'Confuses standing conventions with invoked procedures. A convention that applies only when someone remembers to invoke it is not a convention.' }),

  item('CCARF-C3', 'D3', 'D3.2', 'S2', 'medium',
    'A team has a six-step release checklist run a few times a week, and a naming convention that applies to all code. Which belongs in a slash command?',
    [['A', 'The naming convention, so it can be invoked when writing new files'],
     ['B', 'The release checklist, because it is a repeated procedure with a defined start and end'],
     ['C', 'Both, so all standards live in one place'],
     ['D', 'Neither — both belong in CLAUDE.md']],
    ['B'],
    'A slash command packages a procedure you deliberately start. The release checklist has a beginning, an end, and is invoked on purpose.',
    { A: 'Inverts the distinction. A convention must hold on every edit, and one requiring invocation will be forgotten exactly when it matters.',
      C: 'Collapsing the distinction produces either bloated commands or conventions nobody applies.',
      D: 'A six-step procedure in CLAUDE.md means every session carries it whether or not a release is happening.' }),

  item('CCARF-C4', 'D3', 'D3.4', 'S2', 'easy',
    'A developer must understand how authentication flows across fourteen files before changing anything. Which mode fits?',
    [['A', 'Plan mode, which investigates without making edits and presents an approach first'],
     ['B', 'A mode that auto-accepts edits, to move quickly through the files'],
     ['C', 'Bypassing permissions, so no prompts interrupt the investigation'],
     ['D', 'Normal mode, approving each change as it is proposed']],
    ['A'],
    'Read-only by design. You get the map and an approach before a single line changes, which is exactly what "understand before changing" asks for.',
    { B: 'Auto-accepting edits during an investigation that should produce no edits is the opposite of the requirement.',
      C: 'Removes the guardrail rather than the need for it — a habit worth breaking early.',
      D: 'Workable but weaker: it invites edits during a phase whose whole purpose is understanding.' }),

  item('CCARF-C5', 'D3', 'D3.1', 'S2', 'easy',
    'A developer adds personal tool permissions to .claude/settings.local.json. What should happen to that file?',
    [['A', 'Commit it, so the team shares the same permissions'],
     ['B', 'Keep it out of version control — it is per-developer and takes precedence over shared project settings'],
     ['C', 'Delete it and move everything into .claude/settings.json'],
     ['D', 'Commit it but document that others should ignore it']],
    ['B'],
    'It exists precisely so individual preference can override shared defaults without touching the team file. Committing it defeats the purpose.',
    { A: "Shared settings belong in settings.json. Committing the local file forces one developer's setup on everyone, at higher precedence.",
      C: 'Loses the ability to hold personal preference at all, and pushes individual choices into the shared file.',
      D: 'A convention that fails the first time somebody does not read the note.' }),

  // ── Scenario S5 · Claude Code for Continuous Integration ───────────────────
  item('CCARF-D1', 'D3', 'D3.6', 'S5', 'medium',
    'A Claude Code review job hangs and times out on a CI runner. What is the most likely cause?',
    [['A', 'It was invoked interactively rather than in print mode, so it is waiting on input that will never arrive'],
     ['B', 'The runner lacks sufficient memory for the model'],
     ['C', 'CI runners cannot make outbound network calls by default'],
     ['D', 'The repository is too large to review in one pass']],
    ['A'],
    'The defining constraint of CI is that nobody is there to answer. A non-interactive invocation with a machine-readable output format is the whole pattern; an interactive session on a runner waits until the job is killed.',
    { B: 'Inference is remote. Local memory is not the constraint, though it sounds plausible if you assume a local model.',
      C: 'Would produce a connection error, not a hang.',
      D: 'Would surface as poor coverage or context pressure, not an indefinite wait.' }),

  item('CCARF-D2', 'D3', 'D3.6', 'S5', 'hard',
    'With no human to approve tool use, how should permissions be configured for an unattended CI job?',
    [['A', 'Bypass permissions entirely, since no one can approve anything'],
     ['B', 'An explicit allowlist of only the tools the review needs, with everything else denied'],
     ['C', 'Leave defaults and let denied calls fail, then read the errors'],
     ['D', 'Grant broad permissions but audit the logs afterwards']],
    ['B'],
    'Absence of a human is a reason for tighter bounds, not looser ones. Enumerate what a review legitimately needs — read files, run tests, post a comment — and deny the rest.',
    { A: 'The tempting answer and the dangerous one: it grants an unattended process holding repository credentials the widest possible authority. The most consequential mistake in this scenario.',
      C: 'Turns permission design into trial and error, with a flaky pipeline while the list is discovered.',
      D: 'A detective control where a cheap preventive one exists. Auditing tells you what already happened.' }),

  item('CCARF-D3', 'D1', 'D1.5', 'S5', 'medium',
    'Which two are appropriate uses of hooks in a CI review pipeline?',
    [['A', 'Blocking any attempt to write outside the checked-out workspace'],
     ['B', 'Emitting a structured log line for every tool call, for later triage'],
     ['C', 'Deciding whether a given finding is genuinely blocking'],
     ['D', 'Summarising the review into the final comment']],
    ['A', 'B'],
    'A is a deterministic boundary check on tool arguments, which holds regardless of what the model attempts. B is deterministic side-effect work that should not depend on the model remembering to log.',
    { C: 'A judgement over unstructured findings. Hooks are code and cannot make it.',
      D: 'Also judgement. Both wrong options share one root error: treating hooks as a place for reasoning rather than enforcement.' }),

  item('CCARF-D4', 'D3', 'D3.6', 'S5', 'medium',
    'The build must fail when a blocking defect is found. How should the job be wired?',
    [['A', 'Parse the structured output for a blocking verdict and exit non-zero on that condition'],
     ['B', 'Grep the natural-language review text for the word "blocking"'],
     ['C', 'Always exit zero and let reviewers read the comment'],
     ['D', 'Fail the build whenever the review produces any finding at all']],
    ['A'],
    'Request a machine-readable output format, read the verdict field, and map it to an exit code. The pipeline gets a typed contract instead of a guess.',
    { B: 'Parsing prose for a keyword is brittle in both directions — "no blocking issues found" contains the word.',
      C: 'Makes the gate advisory. A check that never fails gets ignored, which is how a required check becomes noise.',
      D: 'Fails on every minor nit, so the team disables it within a week. Over-strict and under-strict fail the same way in the end.' }),
];
