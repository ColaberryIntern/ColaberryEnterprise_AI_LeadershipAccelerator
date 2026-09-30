/**
 * week45-notes.js — presenter commentary for the generated slides in Weeks 4
 * and 5.
 *   Mon 2026-08-17  Week 4 Architecture Day  (12)
 *   Thu 2026-08-20  Week 4 Build Day          (8)
 *   Mon 2026-08-24  Week 5 Architecture Day  (12)
 *   Thu 2026-08-27  Week 5 Build Day          (8)
 *
 * Week 4 is the Prompt Library: making judgement visible and transferable, and
 * the first week anything gets SCORED. Week 5 is MCP: the week their system
 * stops being able to see only what they paste into it, and the first week
 * somebody else can use what they built.
 *
 * Marcus appears here in Week 5 for the first time, as the person who built a
 * job for himself. Week 6 tells the second half of his story. Both weeks were
 * already presented from a hand-tuned override; these notes fill the generated
 * slides those overrides never reached.
 */

const L = (...lines) => lines.join('\n');

const W4_MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The hook. It names where organisational prompt knowledge actually lives today.',
    'ROOM: Full screen, one sentence. Nothing else.',
    'MOOD: Dry. There is a laugh in this one and it is allowed.',
    'OPEN: "The best prompt at your company is a screenshot in somebody’s DMs."',
    'NOTE: Three seconds of silence. Everybody recognises it, and the recognition is the argument.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show a scored, versioned prompt before any theory.',
    'ROOM: Have a real prompt file open with front-matter and a score in it.',
    'MOOD: Concrete. Week 4 produces the most immediately reusable artifact of the program.',
    'OPEN: "By Thursday you have prompts with version numbers, tests, and a score next to each one."',
    'DO: Show one scored prompt file before explaining anything. Ten seconds.',
    'NOTE: The score is the novelty. Lead with it — nobody in the room currently scores a prompt.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The craft beat. It reframes the week from "better prompts" to "work that survives you".',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Reflective. This one is quietly about their career, not their prompts.',
    'OPEN: "The moment an apprentice stops being an apprentice is not the moment they get good."',
    'SAY: Skill is what you can do. Craft is what survives you leaving the room.',
    'NOTE: Connects to Orientation’s apprentice framing and forward to Week 11’s signature. Say it deliberately.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Why undocumented prompt skill is an organisational risk.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment.',
    'OPEN: "Your company already has the capability. It just cannot find it, repeat it, or prove it works."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The Priya beat — eleven weeks of lost capability, found in a screenshot.',
    'ROOM: Story card full screen.',
    'MOOD: Understated. The waste is the point, not the villain.',
    'OPEN: "They found her prompt eleven weeks after she left, in a screenshot."',
    'SAY: The company had that capability the whole time. It just had no way to hold onto it.',
    'NOTE: Same thread as the absent analyst in Week 2 and Marcus in Weeks 5 and 6. Name it as a pattern if the room has been here for those.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the technique ladder.',
    'ROOM: Diagram up. Walk the ladder rung by rung with your hand.',
    'MOOD: Settle in. Longest teaching stretch tonight.',
    'OPEN: "Five rungs, and the discipline is stopping at the lowest one that works."',
    'DO: Ask who has ever made a prompt longer hoping it would get better. Most hands — that is the habit being corrected.',
    'NOTE: Do not climb the ladder here. This is the map; the next slides do each rung.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The recipe beat. It explains why writing the prompt down is hard for the person who is already good at it.',
    'ROOM: Story card full screen.',
    'MOOD: Practical and a bit forgiving. This is why experts write bad documentation.',
    'OPEN: "The recipe is not written for the chef who invented it."',
    'SAY: You are not making the prompt longer. You are making your own judgment visible.',
    'NOTE: This is the answer to "but I already know how to prompt". Keep it ready.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. About to show the scoreboard — the same prompt at every rung.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. This segment is arithmetic, not opinion.',
    'OPEN: "One prompt, five versions, one number each. The numbers settle it."',
    'NOTE: The door into the segment.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The three-week-argument beat. It is the whole case for evals, told as a workplace story.',
    'ROOM: Story card full screen.',
    'MOOD: Wry. Everyone has been in that meeting.',
    'OPEN: "Two people argued about a prompt for three weeks. The number settled it in one afternoon."',
    'SAY: You are not building an eval to prove you are right. You are building it so the argument can end.',
    'DO: Ask who has had an unresolvable opinion argument at work this month. The hands make the point for you.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens — and the inversion: the test gets written before the prompt.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing.',
    'MOOD: Energy change. Flag the inversion explicitly; it feels backwards to everyone.',
    'OPEN: "You are going to write the test first. Not because it is tidy — because otherwise you will grade yourself generously."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: Deciding what correct looks like is theirs, not Claude Code’s. Push back on anyone who lets it invent the expected answers.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: Mid-build beat. It tells them the unglamorous file they are writing is what most AI teams lack.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Encouraging and a little conspiratorial.',
    'OPEN: "The file you are about to write is the thing most AI teams are missing right now."',
    'SAY: The hard part is deciding what correct looks like. That part is yours, not the model’s.',
    'NOTE: Deliver this while they are mid-eval and finding it tedious. That is exactly when it helps.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the screenshot-in-DMs hook and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it warmly.',
    'OPEN: "Thursday we build the library — five prompts, versioned, tested, each with a score."',
    'SAY: You walked in with prompts in a chat history. You leave Thursday with a library somebody else can use.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const W4_THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. The target is stated with a number in it.',
    'ROOM: Have a finished library open — five prompts, each with a score.',
    'MOOD: Concrete and specific. Five and a score: no ambiguity about done.',
    'OPEN: "By 8:30: five prompts that work on YOUR project, each with a score next to it."',
    'DO: Show the finished library once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It reframes tonight as writing the folder a new hire gets handed.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and purposeful. Sixty seconds.',
    'OPEN: "The new hire who was useful on day one, because somebody else wrote it down."',
    'SAY: Tonight you are not organising your prompts. You are writing the folder somebody gets handed.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — the scorer. It comes FIRST, before any prompt, and that order is the lesson.',
    'ROOM: Your own grader open so you can show real, objective checks.',
    'MOOD: Firm about the order. People will want to write prompts first.',
    'OPEN: "Checkpoint one. The grader exists, and it has no opinions in it."',
    'DO: VERIFY the checks are objective — ask whether anyone’s grader contains the words "reads well" or "good". Those are not checks.',
    'NOTE: A grader written after the prompt grades the prompt you already wrote. Say why the order matters.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — the first scored prompt. First time anyone in the room has a number for a prompt.',
    'ROOM: Watch the clock. Governance and the drills still need time.',
    'MOOD: Encouraging. A low score here is a good outcome, not a bad one.',
    'OPEN: "Checkpoint two. Your prompt has a number, and you did not choose it."',
    'DO: Ask for one person’s score out loud. Praise a LOW one publicly — that sets the honesty standard for the night.',
    'NOTE: Everyone expects to score well. The ones who do not are learning more than the ones who do.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — governed. Version, front-matter, and the promotion gate.',
    'ROOM: Clock visible. If time is short, cut a drill rather than the gate.',
    'MOOD: Steady. This is what makes it a library instead of a folder.',
    'OPEN: "Checkpoint three. Versioned, documented, and only promoted if it earned it."',
    'DO: Ask who has honestly left something as draft because it did not clear the bar. That is the checkpoint working.',
    'NOTE: Most people should still be at draft tonight. Say so out loud so nobody fakes a promotion.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The mise-en-place beat, just before the build. It defends deciding before building.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "The kitchen does the chopping before service, not during it."',
    'SAY: Decide slowly, build fast. Doing it the other way round is how a build night evaporates.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The Friday-improvement beat. It is the argument for versioning, as a lost week.',
    'ROOM: Story card up.',
    'MOOD: Rueful. Everyone has been on the Monday side of this.',
    'OPEN: "Somebody improved the shared prompt on a Friday, and Monday nobody could get back."',
    'SAY: Versioning is not bureaucracy. It is the difference between a bad Monday and a lost week.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat. The quiet defect — output that still looks exactly right.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Unsettling on purpose, then reassuring: this is what the scores are for.',
    'OPEN: "Nothing crashed, nothing warned, and the file still looked exactly right."',
    'SAY: The dangerous defects are never the loud ones. They are the ones that still look correct.',
    'NOTE: Same thread as Week 1’s confident wrong answer and Week 9’s green-but-wrong test. Name the pattern.',
  ),
};

const W5_MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The hook. It names the ceiling every previous week has been working under.',
    'ROOM: Full screen, one sentence. Nothing else.',
    'MOOD: Plain. This is a limitation being named, not a threat.',
    'OPEN: "Everything you have built so far can only see what you paste into it."',
    'NOTE: Three seconds of silence. Most of the room has not consciously noticed this constraint until now.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show a working MCP server before any protocol theory.',
    'ROOM: Have a real server running with a tool, resource and prompt visible in the Inspector.',
    'MOOD: Concrete. Keep protocol vocabulary out of the first two minutes entirely.',
    'OPEN: "By Thursday your assistant can reach a system directly, without you pasting anything into it."',
    'DO: Call one tool live in the Inspector before explaining what MCP is.',
    'NOTE: Lead with the capability. The three primitives come later and land better after they have seen one work.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: Marcus, part one — the man who built a job for himself. Week 6 tells part two.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Wry and sympathetic. Marcus is not stupid; he is everyone.',
    'OPEN: "Marcus built a brilliant assistant, and then hired himself to feed it."',
    'SAY: He did not build an assistant. He built a job for himself, and then showed up to it every morning.',
    'NOTE: Week 6 returns to Marcus as the person nobody could hand the integration over to. Introduce him properly here.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Why one connector standard beats four bespoke ones.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment.',
    'OPEN: "Every team that wants the same data writes its own way in, and none of them can review the others."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The four-connectors beat. Duplication nobody chose, which is what makes it a standards argument.',
    'ROOM: Story card full screen.',
    'MOOD: Matter-of-fact. This is an organisational failure, not an engineering one.',
    'OPEN: "Four teams at one insurer each wrote a connector to the same claims system."',
    'SAY: Nobody chose to do the work four times. They just had no way to do it once.',
    'DO: Ask how many ways into their main system exist at their own company. The answer is never one.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the MCP primitives.',
    'ROOM: Diagram up. Walk it left to right: host, client, server, and the three primitives.',
    'MOOD: Settle in. Longest teaching stretch tonight.',
    'OPEN: "Three primitives, and the difference between them is who is in control."',
    'DO: Ask who has heard of MCP before tonight. Adjust pace — this is a wide-spread week.',
    'NOTE: Do not teach the primitives here. This is the map.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The security-review beat. It is the organisational argument for a standard interface.',
    'ROOM: Story card full screen.',
    'MOOD: Practical. This is the beat that makes MCP matter to a manager.',
    'OPEN: "The security review that used to happen four times a year now happens once."',
    'SAY: She did not become more permissive. She got a place to put the permission.',
    'NOTE: Sets up Week 6’s roots and Week 10’s governance. Both assume the idea of one place to enforce.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. About to autopsy integrations that look right and behave inconsistently.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Same assistant, same question, two different answers on two different days."',
    'NOTE: The door into the segment.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The refund-policy beat. It reframes an apparent model failure as a control question.',
    'ROOM: Story card full screen.',
    'MOOD: Clarifying. This is the beat that stops people blaming the model for everything.',
    'OPEN: "The assistant quoted the refund policy on Wednesday and ignored it on Tuesday."',
    'SAY: It was never a model problem. It was a question about who is allowed to load the document, answered wrong.',
    'NOTE: This distinction — model versus control — is the spine of Weeks 6 and 10. Make it explicit.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. First MCP server, and the Inspector becomes their window.',
    'ROOM: Your Inspector open and visible. Mentors standing.',
    'MOOD: Energy change — stop presenting, start working alongside them.',
    'OPEN: "One server, one tool, and a window you can watch it through."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: Nobody debugs blind tonight. The Inspector opens before anything else does.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The nine-seconds beat, mid-build. It is the argument for the Inspector, as time lost.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Light and practical.',
    'OPEN: "The tool that never fired, and the tab that would have said so in nine seconds."',
    'SAY: You will not out-think a bug you cannot see. Open the window before you start guessing.',
    'NOTE: Deliver this the moment somebody starts guessing at a failure without looking at the Inspector.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the paste-only ceiling and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it warmly.',
    'OPEN: "Thursday we build the server properly — a tool, a resource, a prompt, and a real host calling it."',
    'SAY: You walked in able to paste. You leave Thursday with something that reaches.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const W5_THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Show the finished server before theory.',
    'ROOM: Have a server with all three primitives running, callable from a real host.',
    'MOOD: Concrete. This is the first thing they build that someone else can use.',
    'OPEN: "By 8:30 you have a server with all three primitives, and a real host calling it."',
    'DO: Call it from the host once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It marks the shift from building for yourself to building for others.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and a little proud. Sixty seconds.',
    'OPEN: "The first time somebody else uses something you built, it stops being homework."',
    'SAY: Everything before tonight, you built for yourself. This one, other people can pick up and use.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — a working tool. First primitive, and the pattern for the other two.',
    'ROOM: Inspector visible so you can show a real round-trip.',
    'MOOD: Encouraging. The spread widens here.',
    'OPEN: "Checkpoint one. One tool, called from the Inspector, returning something real."',
    'DO: VERIFY the round-trip — ask who has seen a REAL result, not who has written a handler.',
    'NOTE: A tool that is registered but has never returned anything is not CP1.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — resource and prompt. The two primitives people conflate with tools.',
    'ROOM: Watch the clock. The host call still needs its time.',
    'MOOD: Brisk. The distinction is the lesson here, not the code.',
    'OPEN: "Checkpoint two. A resource and a prompt — and you can say why neither of them is a tool."',
    'DO: Ask someone to explain the difference out loud. If they cannot, that is the checkpoint, not the file.',
    'NOTE: Who controls the call is the distinction. Push until somebody says that.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — the host call. The moment it stops being a local experiment.',
    'ROOM: Clock visible. The failure drills still need time after this.',
    'MOOD: Steady. This is the payoff checkpoint of the night.',
    'OPEN: "Checkpoint three. A real host is calling your server, not the Inspector."',
    'DO: Ask one person to demo theirs from the host. Seeing a peer’s work land is worth more than seeing yours.',
    'NOTE: If the room is short on time, cut a drill rather than this. The host call IS the week.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The skipped-inspector beat, just before the build. It buys the discipline for the whole night.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "The build that skipped the inspector and lost ninety minutes to a client bug that was not a client bug."',
    'SAY: Every checkpoint tonight is green in the inspector before we move. Two minutes, and it saves ninety.',
    'NOTE: State the rule as a rule here, so you can enforce it without arguing later.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The oversized-query beat. First appearance of input boundaries, which Week 6 turns into roots.',
    'ROOM: Story card up.',
    'MOOD: Alert but light. This is a cheap lesson to learn tonight.',
    'OPEN: "The tool that accepted a 200,000-character query and took the server down with it."',
    'SAY: The boundary you did not add is never missing quietly. It is missing until the day it is expensive.',
    'NOTE: Week 6 generalises this into roots and Week 11 into prompt injection. This is the first instance.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat. The single-user assumption — Week 6’s transport lesson in embryo.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Warm, with a hook into next week.',
    'OPEN: "It worked perfectly until the second person tried it."',
    'SAY: A system that only works when one person uses it has not been tested. It has been used once.',
    'NOTE: This is exactly the Week 6 stateful-replica failure, one week early and without the vocabulary. Say that next week is where it gets a name.',
  ),
};

module.exports = {
  sessions: [
    { id: 'eb6bd9a4-7bb4-4e53-b2e1-cbfae06e59e1', label: 'Week 4 Mon 8/17', slideNotes: W4_MONDAY },
    { id: 'd13eef0e-3489-43ab-a39d-6e8710ad0120', label: 'Week 4 Thu 8/20', slideNotes: W4_THURSDAY },
    { id: '2d79fd98-479b-43c5-8b20-ea7600ec6191', label: 'Week 5 Mon 8/24', slideNotes: W5_MONDAY },
    { id: '9ba92a28-28b3-44a5-b137-5c41a5cd6126', label: 'Week 5 Thu 8/27', slideNotes: W5_THURSDAY },
  ],
};
