import { DraftRevisionInput } from '../../services/certPrep/certQuestionBankService';
import { item } from './items/itemFactory';

/**
 * CCAR-F practice items — Colaberry-authored, sample bank v0.
 *
 * Rewritten to the published shape on 2026-09-08, completing the pass that
 * covered D1 through D5. Same keys, domains, objectives, scenario families,
 * difficulties and correct concepts; each item now opens with an attributed
 * observation and offers four articulated approaches. See `ccarRubric.ts` for
 * what that means and where the numbers come from.
 *
 * THESE TWENTY WERE THE WORST OFFENDERS ON THE LENGTH CUE. Before this rewrite,
 * 19 of 20 had the correct answer as the longest option, averaging five words
 * longer than the mean distractor — a candidate who read nothing but the option
 * lengths would have scored 95% on this block. That happened because this file
 * carried its OWN copy of the `item` constructor, which predated the shared one
 * and never got the answer-position assignment. It now imports the shared
 * factory like every other item file, so the position guarantees apply here too.
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
 * THREE ITEMS HERE ARE MULTI-SELECT (A2, B3, D3) and are deliberately left that
 * way. Anthropic's twelve published samples are all four-option single-select,
 * so these three will always score `absent` on the rubric's option_count
 * dimension and can never reach all six. That is a declared residual, not an
 * oversight: twelve samples cannot prove the exam contains no multi-select item,
 * and converting a "which two" judgement into a single-select one to make a
 * metric go green would be reshaping the question to fit the ruler.
 */

export const CCAR_F_SAMPLE_ITEMS: DraftRevisionInput[] = [
  item('CCARF-A1', 'D1', 'D1.3', 'S3', 'medium',
    'A research system runs each researcher as a subagent rather than as a loop inside the orchestrator. Monitoring shows the orchestrator\'s context stays roughly flat as the number of researchers grows, where the earlier in-loop design grew until it truncated. What is the primary architectural reason?',
    [['A', 'Each researcher spends its own context on raw retrieved text and returns only a condensed finding'],
     ['B', 'Subagents run concurrently, so the total wall-clock time of the research phase falls sharply'],
     ['C', 'Subagents can be retried individually, so one failure does not require re-running the whole phase'],
     ['D', 'Each subagent can be given a different model, so cheaper models handle the simpler searches']],
    ['A'],
    'The isolation is the point. The researcher spends its own context on raw retrieved text and returns a condensed finding, so the orchestrator only ever sees the summary — which is why its context stays flat as researchers are added.',
    { B: 'A real benefit of fan-out and unrelated to the flat context. The strongest distractor.',
      C: 'True of any isolated unit of work.',
      D: 'Possible and not what the observation shows.' }),

  item('CCARF-A2', 'D1', 'D1.6', 'S3', 'medium',
    'A research system has four candidate steps and a limited budget for subagents. Metrics show two of the four read a great deal and return little, and two are short calls whose results the orchestrator needs in full. Which TWO steps are appropriate to delegate to a subagent?',
    [['A', 'Reading forty retrieved documents and returning a one-paragraph finding with its citations'],
     ['B', 'Checking a drafted claim against its cited source from a clean context, with the ability to disagree'],
     ['C', 'Formatting the final report into the house template once the synthesis is complete'],
     ['D', 'Calling the pricing API and returning the figure the orchestrator will quote directly']],
    ['A', 'B'],
    'A is the canonical subagent case: high token volume in, small answer out. B is a genuine check, because a second agent with a different prompt and a clean context can disagree with the first, which an agent reviewing its own work cannot.',
    { C: 'Deterministic formatting that belongs in code, not a model call.',
      D: 'A single call whose result is needed verbatim; delegating it only adds a hop. The strongest distractor, because it is a discrete task.' }),

  item('CCARF-A3', 'D1', 'D1.2', 'S3', 'hard',
    'A team wants researchers to compare findings with each other before synthesis, and proposes moving from hub-and-spoke to peer-to-peer across twelve researcher agents. Engineers report that the orchestrator currently arbitrates every conflict without difficulty. What is the strongest objection to the proposal?',
    [['A', 'Twelve peers create up to sixty-six channels, and a wrong finding circulates rather than being caught'],
     ['B', 'Peer-to-peer messaging costs more tokens, since each finding is transmitted several times over'],
     ['C', 'Peer-to-peer makes the system harder to debug, since no single log holds the whole conversation'],
     ['D', 'Researchers would finish at different times, so early peers would compare against incomplete work']],
    ['A'],
    'Twelve peers is up to sixty-six pairwise channels, and a wrong finding circulates instead of being caught. The orchestrator already occupies the arbitration role, so comparison can happen there without the combinatorics.',
    { B: 'A cost that would be worth paying if the design were sound.',
      C: 'True and an operability concern rather than a correctness one. The strongest distractor.',
      D: 'A scheduling problem with a scheduling fix.' }),

  item('CCARF-A4', 'D1', 'D1.1', 'S3', 'hard',
    'A research run occasionally ends with a half-written synthesis and no error raised. Logs show the final response carried a stop reason of max_tokens, and the agent loop exited normally. The loop continues while the stop reason is tool_use and exits otherwise. What is the defect?',
    [['A', 'The loop treats end_turn and max_tokens identically, so a truncated response is read as a finished one'],
     ['B', 'The output token limit is set too low for a synthesis of this length and should be raised'],
     ['C', 'The synthesis prompt does not instruct the model to keep its response within the token budget'],
     ['D', 'The loop does not validate that the synthesis is well formed before returning it to the caller']],
    ['A'],
    'The loop continues while the stop reason is tool_use and exits otherwise, so end_turn and max_tokens are handled identically. Truncation is a failure and needs explicit handling; without it, a broken run is indistinguishable from a complete one.',
    { B: 'Moves the boundary and leaves the silent failure at the new one. The strongest distractor.',
      C: 'An instruction the model cannot reliably honour, standing in for a check.',
      D: 'A useful backstop that does not name the misread stop reason.' }),

  item('CCARF-A5', 'D5', 'D5.3', 'S3', 'medium',
    'One researcher subagent out of twelve fails on a corpus timeout. The orchestrator receives an empty result and synthesises from what it has, and reviewers report the published summary gave no sign that a source was missing. What should the handoff contract specify?',
    [['A', 'A typed status field, so the orchestrator can degrade deliberately and say which source is absent'],
     ['B', 'A retry policy, so a subagent that times out is re-run before the orchestrator proceeds'],
     ['C', 'A longer timeout for the corpus search, so the failure stops occurring in the first place'],
     ['D', 'An error log entry, so the failure can be traced afterwards by whoever investigates the report']],
    ['A'],
    'Failure is data. A typed status field lets the orchestrator degrade deliberately — synthesise from eleven of twelve and say so. The decision belongs at the level that can see the whole picture.',
    { B: 'Helps, and a failed retry lands in the same silent hole. The strongest distractor.',
      C: 'Reduces the rate without making failure representable.',
      D: 'Aids the investigation after a reader has already been misled.' }),

  item('CCARF-A6', 'D1', 'D1.7', 'S3', 'medium',
    'A user has a completed research phase and wants to see two different synthesis approaches over it. The team notices their current method re-runs the whole pipeline for each variant, and that the research phase is by far the most expensive part. What is the appropriate mechanism?',
    [['A', 'Fork the session at the end of research, so history is shared and the continuations are independent'],
     ['B', 'Re-run the pipeline with the second synthesis prompt, keeping the two results side by side'],
     ['C', 'Ask a single synthesis call to produce both approaches in one response, clearly separated'],
     ['D', 'Cache the research findings and paste them into a new session for the second synthesis']],
    ['A'],
    'Forking is exactly this: shared history up to the branch point, independent continuations after it. The expensive research runs once.',
    { B: 'The behaviour being complained about.',
      C: 'One context producing both, so the second is anchored on the first.',
      D: 'Achieves the saving by hand and loses the session state around it. The strongest distractor.' }),

  item('CCARF-A7', 'D1', 'D1.1', 'S3', 'easy',
    'A research system has four steps under review for whether each needs to be agentic. Metrics show one of them has fixed inputs, a written rule set and exactly one right answer, and that it currently costs a model call per run. Which part should NOT be agentic?',
    [['A', 'Formatting citations into the house reference style from structured fields'],
     ['B', 'Deciding which of several conflicting sources to trust for a contested figure'],
     ['C', 'Choosing which follow-up searches to run after reading an initial result set'],
     ['D', 'Judging whether a retrieved document is relevant enough to read in full']],
    ['A'],
    'Known inputs, fixed rules, one right answer. Deterministic code is cheaper, testable and cannot hallucinate a reference. The general rule: if you can write the rules down, write the rules down.',
    { B: 'A judgement call between defensible positions.',
      C: 'Depends on what the results turn out to say. The strongest distractor, because it looks procedural.',
      D: 'Relevance is a judgement about meaning.' }),

  item('CCARF-B1', 'D2', 'D2.1', 'S1', 'medium',
    'Reviewers report that a support agent issued a $180 refund despite the system prompt stating a $50 limit in plain terms. The customer had argued the case over several turns, and the agent agreed the circumstances were exceptional. Where does the cap belong?',
    [['A', 'Inside the refund tool, which validates its own input and returns an error the agent must handle'],
     ['B', 'In the system prompt, restated more forcefully and repeated at the end of the instructions'],
     ['C', 'In a post-hoc audit that flags any refund over $50 for a supervisor to review the next day'],
     ['D', 'In a confirmation step that asks the customer to acknowledge the limit before the refund runs']],
    ['A'],
    'A business rule with money attached is enforced where it cannot be talked around. The tool validates its own input and returns an error the agent must handle. Prompts express intent; tools enforce it.',
    { B: 'A stronger version of the instruction that just failed.',
      C: 'Detects the breach after the money has left. The strongest distractor.',
      D: 'Asks the party requesting the refund to enforce the limit on themselves.' }),

  item('CCARF-B2', 'D1', 'D1.5', 'S1', 'hard',
    'Compliance requires every refund over $20 to be logged to an audit system before it executes. The refund tool is owned by another team and cannot be changed this quarter, and the team notices the agent sometimes calls it without logging. What is the right mechanism?',
    [['A', 'A pre-tool-use hook that sees the arguments, writes the audit record, and can deny the call'],
     ['B', 'A system prompt instruction requiring the agent to log to the audit system before every refund'],
     ['C', 'A wrapper tool the agent is told to call instead, which logs and then calls the refund tool'],
     ['D', 'A post-execution job that reads the refund log nightly and writes the audit records in bulk']],
    ['A'],
    'It fires before execution, sees the arguments, can write the record and deny the call. Deterministic, outside the model\'s discretion, and it requires no change to the tool the other team owns.',
    { B: 'The instruction the agent is already skipping.',
      C: 'Works only while the agent chooses the wrapper over the original. The strongest distractor.',
      D: 'Logs after execution, which is what compliance said it would not accept.' }),

  item('CCARF-B3', 'D5', 'D5.2', 'S1', 'medium',
    'Sampled conversations show an agent spending as many as forty turns on tickets it can never resolve, repeating the same three diagnostic steps. Each turn costs a model call and the customer eventually abandons the chat. Which TWO changes best prevent it?',
    [['A', 'A hard turn limit that ends the loop regardless of what the model judges about its progress'],
     ['B', 'An escalation path the agent can take when no legitimate action remains available to it'],
     ['C', 'A larger context window, so the agent can hold the full history of what it has already tried'],
     ['D', 'A stronger model, which is less likely to repeat a diagnostic step that has already failed']],
    ['A', 'B'],
    'A is the hard backstop every agentic loop needs — a bound that does not depend on the model\'s judgement. B is the graceful path: most looping happens because no legitimate action remains and the agent has nowhere to go.',
    { C: 'Lets it remember forty failed turns rather than stopping at three. The strongest distractor.',
      D: 'Reduces the rate and leaves the loop unbounded.' }),

  item('CCARF-B4', 'D1', 'D1.4', 'S1', 'medium',
    'A support agent escalates a ticket to a human. Reviewers report that humans frequently repeat actions the agent already took, and that one customer received a second refund for the same order last month. The handoff currently carries the transcript alone. What must it carry?',
    [['A', 'Defined fields including the actions already taken, the state established, and the reason for escalating'],
     ['B', 'The full conversation transcript, so the human can read everything that happened in order'],
     ['C', 'A natural-language summary of the conversation, so the human does not have to read it all'],
     ['D', 'The customer record and account history, so the human has the full background before replying']],
    ['A'],
    'A handoff is a contract with defined fields. "Actions already taken" is the one people forget, and the one that stops a human re-issuing a refund that already went out.',
    { B: 'What is already being sent, and the duplicate refund still happened. The strongest distractor.',
      C: 'A summary can omit the action silently.',
      D: 'Background rather than what this conversation did.' }),

  item('CCARF-C1', 'D3', 'D3.1', 'S2', 'hard',
    'A security rule must apply on every developer machine and must not be overridable by anything a developer can edit. The team notices the rule currently sits in a file each developer can change, and that two machines have quietly removed it. Where does it belong?',
    [['A', 'In managed policy settings, which sit above the rest of the precedence chain and cannot be edited locally'],
     ['B', 'In the repository\'s checked-in settings file, so the rule arrives with the code and is reviewed'],
     ['C', 'In the root CLAUDE.md, so the rule is stated where every task is guaranteed to read it'],
     ['D', 'In a pre-commit hook, so any change that violates the rule is rejected before it can be committed']],
    ['A'],
    'Managed policy sits at the top of the settings precedence chain and is not editable by the developer. It is the only option here that survives someone deciding otherwise, which is the stated requirement.',
    { B: 'Checked in and still editable by the developer who checks out the repository. The strongest distractor.',
      C: 'Guidance the agent reads, not a boundary it cannot cross.',
      D: 'Catches violations at commit and leaves the local machine unprotected.' }),

  item('CCARF-C2', 'D3', 'D3.1', 'S2', 'medium',
    'A monorepo\'s frontend and backend follow different conventions for testing, formatting and error handling. Engineers report the agent applying frontend conventions to backend code roughly one task in five, and all the conventions currently sit in one root file. How should it be structured?',
    [['A', 'Shared rules stay at the root, and each subtree gets its own file for the conventions local to it'],
     ['B', 'All rules stay at the root, grouped under clear frontend and backend headings the agent can follow'],
     ['C', 'All rules move into the two subtree files, so the root stays short and nothing is duplicated'],
     ['D', 'Rules stay at the root, with a preamble telling the agent to determine which area it is working in']],
    ['A'],
    'Subdirectory files load in addition to the root when work happens in that subtree. Shared rules stay in one place; local conventions live next to the code they govern.',
    { B: 'Labelling inside one file, which is the arrangement that is failing. The strongest distractor.',
      C: 'Duplicates the genuinely shared rules into both trees.',
      D: 'A probabilistic instruction standing in for a structural boundary.' }),

  item('CCARF-C3', 'D3', 'D3.2', 'S2', 'medium',
    'A team has two things they want to encode: a six-step release checklist the team reports running a few times a week, and a naming convention that applies to all code they write. They are deciding which belongs in a slash command. Which one, and why?',
    [['A', 'The release checklist, because it is a procedure with a beginning and an end that someone starts on purpose'],
     ['B', 'The naming convention, because it applies everywhere and a command guarantees it is never forgotten'],
     ['C', 'Both, since a command is the general mechanism for anything a team wants applied consistently'],
     ['D', 'Neither, since a slash command is for one-off exploration rather than for established team practice']],
    ['A'],
    'A slash command packages a procedure you deliberately start. The release checklist has a beginning, an end, and is invoked on purpose; a convention that applies to all code has no invocation point.',
    { B: 'A convention nobody invokes would only apply when someone remembered to run it. The strongest distractor.',
      C: 'Puts a standing rule behind a manual trigger.',
      D: 'Inverts what commands are for.' }),

  item('CCARF-C4', 'D3', 'D3.4', 'S2', 'easy',
    'A developer must understand how authentication flows across fourteen files before changing anything, and the team reports that a previous attempt started editing early and had to be unwound. They want the map and an approach before a line changes. Which mode fits?',
    [['A', 'Plan mode, which is read-only by design and produces an approach before any edit is made'],
     ['B', 'Normal mode with an instruction to read all fourteen files before making any changes'],
     ['C', 'A subagent asked to explore the auth flow and report back before the developer begins'],
     ['D', 'Normal mode with edits confirmed individually, so nothing changes without explicit approval']],
    ['A'],
    'Read-only by design. You get the map and an approach before a single line changes, which is exactly what "understand before changing" asks for.',
    { B: 'An instruction against the behaviour that already went wrong once.',
      C: 'Produces the map and not the approach, and the developer still starts unconstrained. The strongest distractor.',
      D: 'Approves each edit without ever producing a plan.' }),

  item('CCARF-C5', 'D3', 'D3.1', 'S2', 'easy',
    'A developer adds personal tool permissions to their local settings file. The team notices it staged in a commit alongside an unrelated change, and asks whether it should be checked in so the team shares the same permissions. What should happen to that file?',
    [['A', 'It stays out of version control, since it exists so personal preference can override shared defaults'],
     ['B', 'It is committed, so every engineer works with the same tool permissions and behaviour is consistent'],
     ['C', 'It is committed once as a template, then each engineer edits their copy without committing again'],
     ['D', 'It is deleted, and any permission worth having is added to the shared team settings file instead']],
    ['A'],
    'It exists precisely so individual preference can override shared defaults without touching the team file. Committing it defeats the purpose.',
    { B: 'Overwrites everyone\'s personal overrides with one engineer\'s. The strongest distractor.',
      C: 'A committed template drifts and conflicts on every pull.',
      D: 'Forces personal preferences into the shared file.' }),

  item('CCARF-D1', 'D3', 'D3.6', 'S5', 'medium',
    'A Claude Code review job hangs on a CI runner and is killed by the job timeout after fifteen minutes. Logs show it produced no output after the first few lines. The same command runs correctly on a developer machine. What is the most likely cause?',
    [['A', 'It was invoked interactively, so it is waiting on a prompt that nothing in CI will ever answer'],
     ['B', 'The repository is large enough that the review genuinely takes longer than the CI timeout allows'],
     ['C', 'The runner cannot reach the model provider, so the job is blocked on a network call with no timeout'],
     ['D', 'The job was given too little memory, so it is thrashing rather than making forward progress']],
    ['A'],
    'The defining constraint of CI is that nobody is there to answer. A non-interactive invocation with a machine-readable output format is the whole pattern; an interactive session waits forever for input that never comes, which matches both the silence and the developer machine working.',
    { B: 'Would show continuing output rather than silence. The strongest distractor.',
      C: 'Plausible, and it would usually surface a connection error.',
      D: 'Memory pressure produces slowness or a kill, not a clean hang.' }),

  item('CCARF-D2', 'D3', 'D3.6', 'S5', 'hard',
    'An unattended CI review job needs tool permissions configured, and no human is present to approve anything at runtime. Engineers report two builds blocked this month on an unapproved call. An engineer proposes allowing all tools on the grounds that a blocked job is worse than a broad permission. How should permissions be set?',
    [['A', 'Enumerate what a review legitimately needs — read files, run tests, post a comment — and deny the rest'],
     ['B', 'Allow all tools, since no human is present to approve individual calls and a blocked job fails the build'],
     ['C', 'Allow read-only tools alone, so the job can never modify anything in the repository or its environment'],
     ['D', 'Reuse the permission set from developer machines, since the review task is the same in both places']],
    ['A'],
    'Absence of a human is a reason for tighter bounds, not looser ones. Enumerate what a review legitimately needs and deny the rest.',
    { B: 'Treats the missing approver as a reason to remove the boundary.',
      C: 'Safe and it blocks running tests and posting the comment, which the review needs. The strongest distractor.',
      D: 'Inherits a set shaped by a human being present to approve.' }),

  item('CCARF-D3', 'D1', 'D1.5', 'S5', 'medium',
    'A CI review pipeline is adding hooks and the team has four candidate uses. Reviewers report that two of the four currently depend on the model choosing to do them, and are skipped on roughly one run in six. Which TWO are appropriate uses of hooks?',
    [['A', 'Checking tool arguments against a boundary before the call executes, regardless of what the model attempts'],
     ['B', 'Writing the run record to the audit store after the review completes, without depending on the model'],
     ['C', 'Deciding which files in the diff are worth reviewing closely given the nature of the change'],
     ['D', 'Composing the review comment from the findings so it reads clearly for the pull request author']],
    ['A', 'B'],
    'A is a deterministic boundary check on tool arguments, which holds regardless of what the model attempts. B is deterministic side-effect work that should not depend on the model remembering to do it.',
    { C: 'A judgement about the change that only the model can make.',
      D: 'Language work, which is the model\'s job. The strongest distractor, because it looks mechanical.' }),

  item('CCARF-D4', 'D3', 'D3.6', 'S5', 'medium',
    'A CI job must fail the build when the review finds a blocking defect. The team notices the current wiring greps the review\'s prose output for the word "blocking", and that a review saying "no blocking defects" failed the build last week. How should the job be wired?',
    [['A', 'Request a machine-readable output format, read the verdict field, and map it to an exit code'],
     ['B', 'Keep the text search but refine the pattern so negated phrases such as "no blocking defects" are excluded'],
     ['C', 'Have the review post its findings as a comment, and let a human decide whether to block the merge'],
     ['D', 'Fail the build whenever the review produces any findings at all, whatever severity it assigned them']],
    ['A'],
    'Request a machine-readable output format, read the verdict field, and map it to an exit code. The pipeline gets a typed contract instead of a guess about prose.',
    { B: 'A better guess about text is still a guess, and the next phrasing breaks it. The strongest distractor.',
      C: 'Removes the automatic gate the requirement asked for.',
      D: 'Blocks on every nit and will be routed around within a week.' }),
];
