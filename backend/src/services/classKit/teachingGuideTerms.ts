/**
 * teachingGuideTerms.ts — the programme's vocabulary, in plain English.
 *
 * The teaching guide (teachingGuideHtml.ts) matches these against each slide's
 * own text and renders the hits as clickable chips that jump to a glossary at
 * the foot of the page. That is the "some terms I need to know" half of the
 * guide, and it has to work for all 30 sessions.
 *
 * Why a dictionary rather than reading the deck: `KitSlide.definitions` exists
 * and is the better source when present — the renderer prefers it — but only
 * Week 5 actually authors any (30 entries; every other week authors none). A
 * guide that showed terms on Week 5 and nothing anywhere else would be worse
 * than no glossary at all, so this file carries the shared vocabulary and the
 * authored per-slide definitions win wherever they exist.
 *
 * Matching is deliberately explicit. `match` overrides the default word-
 * boundary pattern for anything short, common, or ambiguous enough to produce
 * false positives ("client", "tool", "roots"), because a chip that jumps to an
 * irrelevant definition costs more trust than a missing chip costs value.
 *
 * Ordering inside a category does not matter — the glossary sorts
 * alphabetically and the per-slide chips sort by where the term appears.
 */

export type TermCategory =
  | 'claude-code'
  | 'api'
  | 'mcp'
  | 'agents'
  | 'reliability'
  | 'governance'
  | 'architecture'
  | 'craft'
  | 'course';

export interface GuideTerm {
  /** Display name, and the default match pattern. */
  term: string;
  category: TermCategory;
  /** One plain-English sentence. No jargon inside the definition of jargon. */
  plain: string;
  /** Overrides the default `\bterm\b` pattern. Must be global + case-insensitive. */
  match?: RegExp;
}

/** Human labels for the category chips in the glossary. */
export const TERM_CATEGORY_LABEL: Record<TermCategory, string> = {
  'claude-code': 'Claude Code',
  api: 'Claude API',
  mcp: 'MCP',
  agents: 'Agents',
  reliability: 'Reliability',
  governance: 'Governance',
  architecture: 'Architecture',
  craft: 'Engineering craft',
  course: 'Course / story',
};

export const GUIDE_TERMS: GuideTerm[] = [
  /* ------------------------------------------------------ Claude Code (W1) */
  { term: 'Agentic loop', category: 'claude-code',
    plain: 'The cycle Claude Code runs in: read the context, choose a tool, act, look at the result, decide again. Everything in Week 1 is a way of steering that loop.',
    match: /\bagentic loop\b/gi },
  { term: 'Context window', category: 'claude-code',
    plain: 'How much text the model can hold in mind at once — the conversation, the files it has read, the tool results. When it fills up, older material has to be summarised away.' },
  { term: 'Compaction', category: 'claude-code',
    plain: 'Automatically summarising the older part of a conversation so work can continue past the context window. Claude Code now does this in the background, so the student directs instead of managing memory.' },
  { term: 'Permission mode', category: 'claude-code',
    plain: 'How much Claude Code may do without asking. Manual approves each action, Plan proposes and waits, Auto runs freely. The choice is a safety decision, not a preference.',
    match: /\bpermission modes?\b/gi },
  { term: 'CLAUDE.md', category: 'claude-code',
    plain: 'A file in the project that Claude Code reads at the start of every session. Persistent project memory: conventions, constraints, and how this codebase wants to be worked on.',
    match: /\bCLAUDE\.md\b/gi },
  { term: 'Explore → plan → code → commit', category: 'claude-code',
    plain: 'The workflow that scales. Understand the ground first, decide the approach second, write third. Skipping explore and plan is what produces confident work in the wrong direction.',
    match: /\bexplore\s*(?:→|->|,)\s*plan\b/gi },
  { term: 'Slash command', category: 'claude-code',
    plain: 'A reusable instruction saved in the project and invoked by name. The unit of "I do this often enough to stop retyping it".',
    match: /\bslash commands?\b|\bcustom commands?\b/gi },
  { term: 'Hook', category: 'claude-code',
    plain: 'Code the harness runs automatically around a tool call — format after every edit, block a forbidden command. The guardrail that does not depend on anyone remembering.',
    match: /\bhooks?\b/gi },
  { term: 'Headless run', category: 'claude-code',
    plain: 'Claude Code running without a person watching — in CI, on a schedule. Unattended work needs least-privilege permissions plus a verification step, or it is a liability.',
    match: /\bheadless\b/gi },

  /* -------------------------------------------------------- Claude API (W3) */
  { term: 'Claude API', category: 'api',
    plain: 'The programmatic door into the same models. Claude Code is a human driving; the API is a program driving. Different bill, different failure modes.',
    match: /\bClaude API\b|\bMessages API\b/gi },
  { term: 'Token', category: 'api',
    plain: 'The unit models are billed and measured in — roughly a word fragment. Input tokens are what you send, output tokens what comes back, and output costs several times more.',
    match: /\btokens?\b/gi },
  { term: 'System prompt', category: 'api',
    plain: 'The standing instruction that frames every message in a conversation — who the model is being and what rules apply. Separate from the user turn on purpose.',
    match: /\bsystem prompts?\b/gi },
  { term: 'Structured output', category: 'api',
    plain: 'Making the model return validated JSON against a schema instead of prose, so a program can act on it. On the Messages API that is output_config with a json_schema format.',
    match: /\bstructured output\b|\boutput_config\b|\boutput_format\b/gi },
  { term: 'JSON Schema', category: 'api',
    plain: 'The declaration of which fields a JSON object must have. With additionalProperties false it also says which fields it may not have.',
    match: /\bjson[_ ]?schema\b/gi },
  { term: 'Prompt caching', category: 'api',
    plain: 'Reusing an already-processed prefix of a prompt so repeated calls are cheaper and faster. Matters the moment the same long context is sent again and again.',
    match: /\bprompt caching\b/gi },

  /* --------------------------------------------------------- MCP (W5 + W6) */
  { term: 'MCP', category: 'mcp',
    plain: 'The Model Context Protocol. A shared standard for how an AI assistant talks to outside tools and data. Before it, every integration was bespoke; with it, one server works with any client that speaks the protocol.',
    match: /\bMCP\b|\bModel Context Protocol\b/g },
  { term: 'MCP server', category: 'mcp',
    plain: 'The program a student writes that exposes tools an AI can call. Week 5 builds the first one; Week 6 makes it something a company could actually run.',
    match: /\bMCP servers?\b|\byour servers?\b/gi },
  { term: 'MCP client', category: 'mcp',
    plain: 'Whatever is on the other end of the connection — Claude Code, Claude Desktop, an internal app. The client owns the model, the API key, and the yes-or-no.',
    match: /\bMCP clients?\b|\bthe clients?\b|\bclient half\b|\bclient[- ]side\b/gi },
  { term: 'Tool', category: 'mcp',
    plain: 'One callable capability the server offers, with a name, a description, and a typed input. "Summarize account", "look up invoice".',
    match: /\btools?\b/gi },
  { term: 'Resource', category: 'mcp',
    plain: 'Read-only content a server exposes for the model to look at, addressed by URI and labelled with a MIME type. A tool does something; a resource is something.',
    match: /\bresources?\b/gi },
  { term: 'MCP Inspector', category: 'mcp',
    plain: 'A local debugging window that connects to an MCP server and shows the traffic — tools listed, calls made, notifications arriving. On a build day it is how anything gets verified.',
    match: /\bInspector\b/gi },
  { term: 'Sampling', category: 'mcp',
    plain: 'The server asks the client to run a model call on its behalf instead of holding its own API key. The tool fetches the data; the client does the thinking. This is what makes a server deployable inside a company that will not hand out keys.',
    match: /\bsampling\b/gi },
  { term: 'Capability', category: 'mcp',
    plain: 'A feature each side declares it supports when the connection opens. If the client never declares sampling, every sampling request is refused — silently. That is the number one cause of "sampling does nothing".',
    match: /\bcapabilit(?:y|ies)\b/gi },
  { term: 'Progress notification', category: 'mcp',
    plain: 'A running count a long tool emits so the caller knows it is alive. Only sent if the client passed a progress token, so a correctly guarded emit that stays silent is not a bug.',
    match: /\bprogress notifications?\b|\bprogress token\b|\bprogress ticks?\b/gi },
  { term: 'Log notification', category: 'mcp',
    plain: 'The server’s live, structured event stream, delivered over the protocol rather than written to a file. Silently dropped unless the logging capability is declared.',
    match: /\blog notifications?\b|\bnotifications\/message\b/gi },
  { term: 'Roots', category: 'mcp',
    plain: 'The territory the client declares the server may touch. The client says where; the server is responsible for staying inside it. A boundary nobody enforces is a comment.',
    match: /\broots\b/gi },
  { term: 'Transport', category: 'mcp',
    plain: 'How the client and server actually talk. STDIO for a local single-user tool; StreamableHTTP for anything multi-user or networked.',
    match: /\btransports?\b/gi },
  { term: 'STDIO', category: 'mcp',
    plain: 'The server runs as a child process on your own machine and talks over standard input and output. Ideal for a personal tool. Not a thing you scale.',
    match: /\bSTDIO\b/gi },
  { term: 'StreamableHTTP', category: 'mcp',
    plain: 'The server runs as an HTTP service, so more than one person and more than one machine can reach it.',
    match: /\bstreamable\s?HTTP\b/gi },
  { term: 'Error contract', category: 'mcp',
    plain: 'Returning a well-formed error result instead of throwing. Throwing can kill the connection for everybody; a result fails one call.',
    match: /\berror contract\b|\berror results?\b/gi },
  { term: 'MIME type', category: 'mcp',
    plain: 'The label that says what kind of content something is — text, JSON, an image. Resources need the right one or the client cannot tell what it has been handed.',
    match: /\bMIME types?\b/gi },

  /* ---------------------------------------------------- Agents (W2, W4, W7) */
  { term: 'Skill', category: 'agents',
    plain: 'A packaged set of instructions for one kind of task, loaded on demand. Week 2 builds three that chain into one incident workflow.',
    match: /\bskills?\b/gi },
  { term: 'Subagent', category: 'agents',
    plain: 'A separate Claude instance with its own context window, given a scoped job and returning a summary. It isolates exploration from editing and lets independent work run in parallel.',
    match: /\bsubagents?\b/gi },
  { term: 'Delegation', category: 'agents',
    plain: 'Handing a scoped piece of work to a subagent. It costs coordination overhead, so it pays off on large exploration and parallel work — not on trivial one-liners.',
    match: /\bdelegat(?:e|ion|ing)\b|\bover-delegat\w*\b/gi },
  { term: 'Scoped tools', category: 'agents',
    plain: 'Giving an agent only the tools its role needs. An unscoped agent wanders outside its job and returns results you cannot trust.',
    match: /\bscoped tools?\b|\bunscoped tools?\b|\blimited tools\b/gi },
  { term: 'Coordinator', category: 'agents',
    plain: 'The agent that splits the work, hands pieces out, and assembles what comes back. Structured output is the contract that lets it trust a subagent’s result.',
    match: /\bcoordinat(?:or|ion|ed)\b/gi },
  { term: 'Prompt template', category: 'agents',
    plain: 'A prompt with named variables so the same proven wording can be reused across tasks instead of retyped and quietly degraded.',
    match: /\bprompt templates?\b/gi },
  { term: 'Prompt library', category: 'agents',
    plain: 'The versioned, named, metadata-tagged collection of prompts that have passed an eval. The point is reuse by other people, not personal notes.',
    match: /\bprompt librar(?:y|ies)\b/gi },
  { term: 'Eval', category: 'agents',
    plain: 'A repeatable test of AI output against a standard. It is what turns "this prompt seems good" into "this prompt is library-ready".',
    match: /\bevals?\b|\beval threshold\b/gi },
  { term: 'Decomposition', category: 'agents',
    plain: 'Breaking one large request into ordered smaller ones. The highest rung of the technique ladder, and usually the fix when a single prompt keeps half-failing.',
    match: /\bdecomposition\b|\bdecompos(?:e|ing)\b/gi },

  /* ------------------------------------------- Reliability (W6, W9) */
  { term: 'Timeout', category: 'reliability',
    plain: 'A hard limit on how long an outbound call may take before you give up. Without one, a hung dependency takes every user with it.',
    match: /\btimeouts?\b|\btimed[- ]out\b/gi },
  { term: 'Retry with backoff', category: 'reliability',
    plain: 'Trying a failed call again, waiting longer each time, with a cap on attempts. Uncapped retries are not resilience, they are an outage amplifier.',
    match: /\bretr(?:y|ies|ying)\b|\bbackoff\b/gi },
  { term: 'Circuit breaker', category: 'reliability',
    plain: 'After enough failures in a window, stop calling the failing dependency at all and fail fast. It stops one sick service from dragging everything down with it.',
    match: /\bcircuit breakers?\b/gi },
  { term: 'Fallback', category: 'reliability',
    plain: 'A deliberate degraded path when the primary one fails. If there is no fallback, fail fast and loudly rather than pretending.',
    match: /\bfallbacks?\b/gi },
  { term: 'Dead-letter', category: 'reliability',
    plain: 'Where a job goes when every retry is exhausted — kept with full context so a person can triage it, instead of vanishing.',
    match: /\bdead[- ]letter\b/gi },
  { term: 'Idempotency', category: 'reliability',
    plain: 'Running the same operation twice produces the same end state, with no duplicate side effects. A script that works once and breaks on the second run is broken, not fragile.',
    match: /\bidempoten\w*\b/gi },
  { term: 'Quiet failure', category: 'reliability',
    plain: 'The dangerous one: something goes wrong and the tool returns a plausible, empty, confident answer anyway. Far worse than a crash, because nobody goes looking.',
    match: /\bquiet(?:ly)? fail\w*\b|\bfails? quietly\b|\bplausible but (?:wrong|empty)\b/gi },
  { term: 'Failure-first design', category: 'reliability',
    plain: 'Deciding what happens when it breaks before building the happy path. What retries, how often, what the recovery is, and which failures you are explicitly not handling.',
    match: /\bfailure[- ]first\b/gi },
  { term: 'Correlation ID', category: 'reliability',
    plain: 'One id generated at the start of a single request and stamped on every line it produces. It is what lets a stranger follow one request from arrival to answer without reading the code.',
    match: /\bcorrelation ids?\b/gi },
  { term: 'Structured logging', category: 'reliability',
    plain: 'Logs as objects with stable field names, not sentences. Sentences cannot be searched, filtered, or counted; objects can.',
    match: /\bstructured logs?\b|\bstructured logging\b|\blog stream\b/gi },
  { term: 'Error class', category: 'reliability',
    plain: 'A stable name for a category of failure — TimeoutError, ValidationError, AccessDenied. A bare message string cannot be counted or alerted on; a class can.',
    match: /\berror class\w*\b|\bTimeoutError\b|\bUpstreamUnavailable\b/gi },
  { term: 'Regression test', category: 'reliability',
    plain: 'A test written to reproduce a specific failure, named after the failure it prevents. Without it, the next refactor quietly removes the fix and nothing tells you.',
    match: /\bregression tests?\b|\btest per break\b|\btest that reproduces\b/gi },
  { term: 'Build–Break–Harden', category: 'reliability',
    plain: 'The house execution model. Build the happy path, actively try to break it, then fix each break with a test that reproduces it. Built but not broken is not shipped.',
    match: /\bbuild[- ]break[- ]harden\b|\bbreak.{0,12}harden\b/gi },

  /* ---------------------------------------------------- Governance (W10) */
  { term: 'ABAC', category: 'governance',
    plain: 'Attribute-based access control. Instead of "which role are you", the decision reads five factors: user, resource, action, context, and risk.',
    match: /\bABAC\b|\battribute[- ]based access\b/gi },
  { term: 'Human-in-the-loop', category: 'governance',
    plain: 'A person approving an action before it happens. The design question is not whether to have one, but exactly which categories of action must reach it.',
    match: /\bhuman[- ]in[- ]the[- ]loop\b|\bapproval gate\b/gi },
  { term: 'Audit trail', category: 'governance',
    plain: 'An append-only record of who did what, when, and under which decision — keyed on a correlation id so one action can be reconstructed end to end.',
    match: /\baudit trails?\b|\bimmutable audit\b/gi },
  { term: 'Fail-closed', category: 'governance',
    plain: 'When the governance layer cannot decide, the answer is no. An ungoverned action is a denied action — the opposite default from most software.',
    match: /\bfail[- ]closed\b|\bdefault[- ]deny\b|\bdeny by default\b/gi },
  { term: 'INPACT', category: 'governance',
    plain: 'The programme’s trust framework. The pillar in play in Week 10 is Permitted & Transparent: the system can prove what it was allowed to do and why.',
    match: /\bINPACT\b/g },
  { term: 'Trust Band', category: 'governance',
    plain: 'The scorecard band a finished system lands in once its INPACT factors are combined. The number a panel argues with in Week 12.',
    match: /\btrust band\b/gi },
  { term: 'Escalation', category: 'governance',
    plain: 'The defined path an action takes when it exceeds what the system may decide alone. Undefined escalation is the same as no governance.',
    match: /\bescalat\w+\b/gi },

  /* -------------------------------------------------- Architecture (W11-12) */
  { term: 'Trust boundary', category: 'architecture',
    plain: 'The line where data or control passes between things that trust each other differently. Every one of them needs validation, and most incidents happen on one.',
    match: /\btrust boundar(?:y|ies)\b/gi },
  { term: 'ADR', category: 'architecture',
    plain: 'Architecture Decision Record. A short written justification for a high-stakes choice — the options, the trade-off, the reason. It justifies, it does not merely describe.',
    match: /\bADRs?\b|\barchitecture decision records?\b/g },
  { term: 'Seven-layer reference', category: 'architecture',
    plain: 'The programme’s system model: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration. Reliability and governance are layers here, not add-ons.',
    match: /\b7[- ]layer\b|\bseven[- ]layer\b|\bdata fabric\b/gi },
  { term: 'Observability', category: 'architecture',
    plain: 'Being able to tell what a running system is doing from the outside — logs, metrics, traces. If a failure cannot be traced from symptom to cause, observability is incomplete.',
    match: /\bobservability\b/gi },
  { term: 'Orchestration', category: 'architecture',
    plain: 'The layer that decides what runs, in what order, and what happens when a step fails. The conductor, not the instruments.',
    match: /\borchestration\b/gi },
  { term: 'Stateless', category: 'architecture',
    plain: 'Every request carries everything it needs, so any instance can serve any request. This is what stops request two landing on a replica that never heard of request one.',
    match: /\bstateless\b/gi },
  { term: 'Stateful', category: 'architecture',
    plain: 'The server keeps something in memory between requests — a session, a cache, a connection map. Buildable, but it commits you to session affinity forever after.',
    match: /\bstateful\b/gi },
  { term: 'Horizontal scaling', category: 'architecture',
    plain: 'Running more copies of the same service. It is where stateful assumptions go to die.',
    match: /\bhorizontal scaling\b|\bscaled? to (?:two|three|\d+) instances?\b|\binstance number two\b/gi },
  { term: 'Session affinity', category: 'architecture',
    plain: 'Pinning a user to one server instance so their in-memory state is still there. Real, but it constrains deploys, scaling and failover from then on.',
    match: /\bsession affinity\b|\bsession map\b/gi },
  { term: 'Connection pool', category: 'architecture',
    plain: 'A reusable set of open connections rather than a fresh one per call, released in a finally block so a failure does not leak handles.',
    match: /\bpooled?\b|\bconnection pool\b/gi },

  /* -------------------------------------------------------- Craft / security */
  { term: 'Bound parameter', category: 'craft',
    plain: 'Passing a value to a query as a separate, typed argument instead of pasting it into the query text. Model output is untrusted input, so it is bound, never concatenated.',
    match: /\bbound parameters?\b|\bparameteri[sz]ed\b|\bbind(?:ing)? parameters?\b/gi },
  { term: 'Injection', category: 'craft',
    plain: 'What happens when untrusted text becomes part of a command. Escaping quotes by hand is how careful people write injection bugs.',
    match: /\binjection\b|\bconcatenat\w+\b/gi },
  { term: 'Untrusted input', category: 'craft',
    plain: 'Anything you did not produce yourself. Model output counts: a poisoned document in a shared drive is enough to make "the model would not send anything malicious" false.',
    match: /\buntrusted\b/gi },
  { term: 'Path traversal', category: 'craft',
    plain: 'Escaping a folder using ../ in a path. ./data/../../.env looks like it is inside ./data and is not, which is why a prefix check on the raw string is not a control.',
    match: /\bpath traversal\b|\btraversal\b|\bdot[- ]dot\b/gi },
  { term: 'Symlink', category: 'craft',
    plain: 'A file that is really a pointer to a file somewhere else. It defeats naive path checks for the same reason traversal does, which is why the real path must be resolved first.',
    match: /\bsymlinks?\b/gi },
  { term: 'Credential', category: 'craft',
    plain: 'A password, key, or connection string. It lives in the environment of the process — never in a source file, a log, or an error returned to a caller.',
    match: /\bcredentials?\b|\bAPI keys?\b|\bconnection strings?\b/gi },
  { term: 'Environment variable', category: 'craft',
    plain: 'A value handed to a process by whatever started it, rather than written into its code. Where every credential belongs.',
    match: /\benvironment variables?\b|\bin (?:my |your |the )?environment\b|\bfrom the env\b/gi },
  { term: 'Least privilege', category: 'craft',
    plain: 'Give a process exactly the access it needs and nothing more. The cheapest security control there is, and the one most often skipped for convenience.',
    match: /\bleast[- ]privilege\b/gi },
  { term: 'Diff', category: 'craft',
    plain: 'The exact set of lines a change added and removed. Reading the diff rather than the description is how you find out what actually happened.',
    match: /\bdiffs?\b|\bdiffable\b/gi },
  { term: 'Refactor', category: 'craft',
    plain: 'Changing the shape of code without changing what it does — usually to stop repeating yourself. The moment a student extracts a shared helper, they have started maintaining a system.',
    match: /\brefactor\w*\b/gi },
  { term: 'Baseline', category: 'craft',
    plain: 'A known-good state you can compare against, verified before anything changes, so a later break can be traced to the change that caused it.',
    match: /\bbaselines?\b/gi },
  { term: 'Round-trip', category: 'craft',
    plain: 'A call that goes out and comes back with a real answer. "One tool round-trips" is the definition of a green baseline on a build day.',
    match: /\bround[- ]trips?\b/gi },
  { term: 'Degrade cleanly', category: 'craft',
    plain: 'When something optional is unavailable, return a useful reduced result and log a warning. Never crash, never silently return nothing.',
    match: /\bdegrade\w*\b|\bdegraded\b/gi },

  /* ------------------------------------------------------- Course / story */
  { term: 'Checkpoint', category: 'course',
    plain: 'A shared stopping point on a build day. The whole room clears one before anybody moves to the next, so nobody is quietly stranded.',
    match: /\bcheckpoints?\b|\bCP[0-9]\b/g },
  { term: 'Rescue branch', category: 'course',
    plain: 'The catch-up path for anyone who has fallen behind. Saying out loud that it exists is what makes people willing to admit they are stuck.',
    match: /\brescue branch\b/gi },
  { term: 'Pulse rail', category: 'course',
    plain: 'The live status strip fed by students tapping "I’m here / building / stuck / finished" on their phones. The instrument that tells you whether to slow down.',
    match: /\bpulse rail\b|\bpulse\b/gi },
  { term: 'Live Decision Theater', category: 'course',
    plain: 'The full-screen poll format where votes lock, the spread is shown, and the reveal comes last. Used sparingly, for decisions worth stopping the class for.',
    match: /\btheater\b|\btheatre\b/gi },
  { term: 'Build Bay', category: 'course',
    plain: 'The panel on a build slide that carries the prompt plus what you should see, when to stop, and what to do if it misfires.',
    match: /\bbuild bay\b/gi },
  { term: 'Builder Broadcast', category: 'course',
    plain: 'The 30–60 second phone video each student records at the end of a build day, using five fixed sentence-starters. Opt-in, and it becomes the content pipeline.',
    match: /\bbuilder broadcast\b|\bbuild proof\b/gi },
  { term: 'Ship gate', category: 'course',
    plain: 'The written Definition of Done for a deliverable, read out loud at the end of a build day. Built is not shipped.',
    match: /\bship gate\b|\bdefinition of done\b|\bSHIP ONLY IF\b/gi },
  { term: 'Trust ladder', category: 'course',
    plain: 'The recurring measure of how much the AI is allowed to do unattended — from approving every action in Week 1 to reaching real systems under rules the student wrote.',
    match: /\btrust ladder\b|\breins\b/gi },
  { term: 'The dragon', category: 'course',
    plain: 'The Week 12 capstone, promised at Orientation before anyone had written a line. Referenced through the programme to show it is still on the calendar.',
    match: /\bdragon\b/gi },
  { term: 'The 2 AM question', category: 'course',
    plain: '"It is 2 AM and it is down — does it fail loudly, or quietly?" The recurring test for whether something is really production-shaped.',
    match: /\b2\s?AM\b/gi },
  { term: 'Marcus', category: 'course',
    plain: 'The Week 6 story: the engineer whose integration ran for four years and who nobody could cover on holiday, because only he understood it. The reason all the logging and documentation work matters.',
    match: /\bMarcus\b/g },
  { term: 'CCA-F', category: 'course',
    plain: 'The certification exam the programme leads to. Week 12 maps its five domains against what the student has actually built.',
    match: /\bCCA[- ]F\b/g },
  { term: 'Capstone', category: 'course',
    plain: 'The Week 12 system that integrates every thread of the programme, run end to end with governance and observability on, and defended to a panel.',
    match: /\bcapstones?\b/gi },
];

/**
 * Terms whose `match` fires on any slide in the deck. Ordered longest-term-first
 * so a specific phrase wins the chip over a generic one that overlaps it
 * ("progress notification" before "tool"). Case-insensitive; each pattern is
 * cloned per call because a global RegExp carries mutable lastIndex state and
 * would otherwise skip matches on every second slide.
 */
export function termsIn(text: string, limit = 8): GuideTerm[] {
  if (!text) return [];
  const hits: { t: GuideTerm; at: number }[] = [];
  for (const t of GUIDE_TERMS) {
    const src = t.match ? t.match.source : `\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    const flags = t.match ? t.match.flags.replace(/[gy]/g, '') : 'i';
    const at = text.search(new RegExp(src, flags));
    if (at >= 0) hits.push({ t, at });
  }
  // Longest term first among equals so the more specific label wins the slot.
  hits.sort((a, b) => a.at - b.at || b.t.term.length - a.t.term.length);
  const seen = new Set<string>();
  const out: GuideTerm[] = [];
  for (const h of hits) {
    if (seen.has(h.t.term)) continue;
    seen.add(h.t.term);
    out.push(h.t);
    if (out.length >= limit) break;
  }
  return out;
}
