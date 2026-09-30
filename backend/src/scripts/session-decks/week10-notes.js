/**
 * week10-notes.js — presenter commentary for the generated slides in Week 10.
 *   Mon 2026-09-28  Architecture Day  (12)
 *   Thu 2026-10-01  Build Day          (8)
 *
 * Week 10 is Governance. Its spine: for nine weeks the room has been proving
 * its systems can ACT — this is the week they prove one can refuse, and can
 * explain the refusal afterwards. The recurring trap is autonomy granted by
 * drift rather than by decision.
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook. First thing you say tonight.',
    'ROOM: Full screen, one sentence. Nothing else on the display.',
    'MOOD: Cold and quiet. Do not perform it — the sentence does the work.',
    'OPEN: "It is 2 AM. It did something nobody approved."',
    'NOTE: Three seconds of silence after. Everyone in the room is now checking their own system against that sentence.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the finished governance engine before any theory.',
    'ROOM: Have a real policy refusal on screen, with its audit line, ready to demo.',
    'MOOD: Concrete and slightly formal. This is the week that makes their system defensible to a business.',
    'OPEN: "By Thursday your system can refuse an action, ask a human when it is unsure, and prove afterwards exactly why."',
    'DO: Trigger one refusal live and show the audit line it wrote. Twenty seconds, before any explanation.',
    'NOTE: Sell the refusal, not the architecture. The components get named on the architecture slide.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The drift beat. It makes the room notice how much autonomy they have granted without ever deciding to.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Reflective, not accusatory. This is a recognition, and it should feel like one.',
    'OPEN: "Nine weeks ago you would not let it rename a file without watching."',
    'SAY: Autonomy you granted by drifting is the only kind that has no policy behind it.',
    'DO: Ask what their system can do today that they never explicitly approved. Give it five seconds — the silence IS the answer.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "it acted" to why an organisation cares.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment entirely.',
    'OPEN: "No business objects to an AI that works. They object to one that cannot be questioned afterwards."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social — keep it about accountability, not code.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The unanswerable-incident story. Nothing broke, which is what made it impossible to explain.',
    'ROOM: Story card full screen.',
    'MOOD: Measured and a bit chilling. Resist drama; the absence of a failure is the horror.',
    'OPEN: "The system did not fail. That is what made it unanswerable."',
    'SAY: Nothing broke. That is precisely why nobody found out for nine days.',
    'NOTE: If somebody says monitoring would have caught it, ask what alert fires when everything succeeds. There is not one.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the governance components.',
    'ROOM: Diagram up. Walk it left to right: policy, risk, evaluator, gate, human-in-the-loop, audit.',
    'MOOD: Settle in. This is the longest stretch of teaching tonight.',
    'OPEN: "Six components, and only one of them makes a decision. The other five exist so you can defend it."',
    'DO: Ask which component they think is hardest to get right. Take one answer before revealing it is the human gate.',
    'NOTE: Do not teach them here — this is the map. Each gets its own slide.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The missing-approver story. This is what makes the human gate a real design problem rather than a checkbox.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Practical. Everyone has been the person who could not be found.',
    'OPEN: "The approver nobody can find at 2 AM."',
    'SAY: The approver being unavailable is not the exception you design around. It is the normal case.',
    'DO: Ask what their gate does when nobody answers for six hours. Most have not decided — that is tonight’s work.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to autopsy governance that looked fine and was not.',
    'ROOM: Opener on screen. Keep it short — the autopsies are the content.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Two controls. Both documented. Neither one actually stopped anything."',
    'NOTE: The door into the segment, not the segment. Do not linger.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The double-transfer story. It makes idempotency a governance control rather than an engineering nicety.',
    'ROOM: Story card full screen.',
    'MOOD: Serious. Real money, one impatient finger, and an approval that was genuinely given.',
    'OPEN: "Two wire transfers, one approval, one impatient finger."',
    'SAY: Idempotency in a governance gate is not defensive programming. It is the control itself.',
    'NOTE: The approval WAS valid. That is the point — the gate did its job and the system still did it twice.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. The first policy goes into their own project.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing.',
    'MOOD: Energy change — stop presenting, start working alongside them.',
    'OPEN: "You are about to write down, in code, the things your system is not allowed to do."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: The policy is theirs to decide, not Claude Code’s to invent. Push back on anyone who lets it choose the rules.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The career beat, mid-build. It reframes governance as leverage rather than restriction.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Warm. This is the argument that governance earns you MORE autonomy, not less.',
    'OPEN: "The architect who could explain the refusal got the bigger system."',
    'SAY: The architect who can explain why the system said no is the one the business trusts with more autonomy.',
    'NOTE: Aim this at anyone who thinks tonight is bureaucracy. It is the opposite, and this is the slide that says so.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the 2 AM hook and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it. Slow down for the last two lines.',
    'OPEN: "Thursday we build the engine — policy, a human gate, and an audit trail that survives being questioned."',
    'SAY: You walked in with a system that could act. You leave Thursday with one that can refuse, and say why.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Monday was the argument; tonight is the engine.',
    'ROOM: Have the finished state ready — a refusal, an escalation, and an audit line you can point at.',
    'MOOD: Concrete. No hedging about what gets finished.',
    'OPEN: "By tonight your system refuses something, escalates something, and can prove both afterwards."',
    'DO: Show the finished refusal once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It states the question the whole night is insurance against.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Direct. Read the quoted line as if it were an email they just received.',
    'OPEN: "On September 17 at 3:14 AM your system issued a refund. Please explain."',
    'SAY: Nobody ever regretted the audit trail. Every single person regretted not having one.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — policy blocks something. The first real control of the night.',
    'ROOM: Have your own policy file open so you can show a real rule rather than describe one.',
    'MOOD: Encouraging. The spread widens here.',
    'OPEN: "Checkpoint one. Your system now refuses something, and the refusal comes from a rule you wrote."',
    'DO: VERIFY the refusal — ask who has watched their policy actually BLOCK an action, not who has written rules.',
    'NOTE: A policy that has never denied anything is untested. Push them to trigger it deliberately before advancing.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — the human gate. The hardest component, and the one with the failure mode from Monday.',
    'ROOM: Watch the clock. The audit checkpoint and the drills still need time.',
    'MOOD: Firm. This checkpoint has a right answer and a well-known way to get it wrong.',
    'OPEN: "Checkpoint two. When it is unsure, it stops and asks — and it survives nobody answering."',
    'DO: Ask what each person’s gate does when the approver never replies. If the answer is "it waits forever", that is the bug.',
    'NOTE: Call forward to the eighty-percent story: a gate that escalates everything gets rubber-stamped by Friday.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — auditable. The checkpoint that makes the other two defensible.',
    'ROOM: Clock visible. If the room is not here in good time, cut a drill rather than the harden step.',
    'MOOD: Steady. This is the deliverable a business actually asks for.',
    'OPEN: "Checkpoint three. Every decision — allowed, refused, escalated — leaves a line somebody else can read."',
    'DO: Have one person read their own audit line out loud. If it does not name the rule, it is not finished.',
    'NOTE: An audit line without the deciding rule is a log, not an audit trail. That distinction is the checkpoint.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The one-door beat, just before the build. It defends the single enforcement point.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "A building with forty side doors does not have a security desk. It has a lobby."',
    'SAY: One door is not a design constraint. It is the only reason the control can be trusted at all.',
    'NOTE: Keep this in your pocket for anyone who wants to bolt checks onto each tool instead of one gate.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The refusal beat. Nine weeks of proving systems can act, and tonight one refused.',
    'ROOM: Story card up. If a student’s gate refused something live tonight, name it here.',
    'MOOD: Quietly triumphant. This is a milestone, not a warning.',
    'OPEN: "The room went quiet waiting for a line that never printed."',
    'SAY: For nine weeks you have been proving your system can act. Tonight you proved it can refuse.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat, and the sharpest practical warning of the week — the gate that approves everything.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Serious. This is the failure they are most likely to ship.',
    'OPEN: "They escalated eighty percent of actions. By Friday, approval was one click and no reading."',
    'SAY: A human gate that approves everything is not a gate.',
    'DO: Give them the number out loud — under fifteen percent escalation, or the control is theatre.',
    'NOTE: Let it sit before the ship gate. Everyone who over-escalates tonight will remember this on Monday.',
  ),
};

module.exports = {
  sessions: [
    { id: 'b336dcef-e299-4f24-8464-8087fd9b98b4', label: 'Week 10 Mon 9/28', slideNotes: MONDAY },
    { id: '7112c569-0d2c-4921-8ec8-ff3efb20ab7a', label: 'Week 10 Thu 10/1', slideNotes: THURSDAY },
  ],
};
