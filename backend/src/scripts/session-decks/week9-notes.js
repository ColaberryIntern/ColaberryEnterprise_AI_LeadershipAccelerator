/**
 * week9-notes.js — presenter commentary for the generated slides in Week 9.
 *   Mon 2026-09-21  Architecture Day  (12)
 *   Thu 2026-09-24  Build Day          (8)
 *
 * Week 9 is Reliability Engineering. Its spine: you already know it works — the
 * whole week is about what happens when it does not, and about the failures
 * that never announce themselves. Three weeks from the dragon, this is the week
 * the room first watches its own system break on purpose.
 */

const L = (...lines) => lines.join('\n');

const MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook. First thing you say tonight.',
    'ROOM: Full screen, one sentence. Nothing else on the display.',
    'MOOD: Flat and certain. No warmth on this line — it is an accusation and it should land as one.',
    'OPEN: "A demo that has never failed is a demo nobody has tested."',
    'NOTE: Say it, then three seconds of silence. Half the room is thinking about a demo they gave last month.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the finished reliability layer before any theory.',
    'ROOM: Have a run on screen that fails on purpose and recovers visibly — timeout, retry, breaker.',
    'MOOD: Concrete. This is the week that makes their capstone defensible.',
    'OPEN: "By Thursday your system survives things going wrong, and you will have watched it happen."',
    'DO: Trigger one real failure live and let the recovery play out before you explain anything. Twenty seconds.',
    'NOTE: Sell the survival, not the primitives. The architecture slide names them.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The dragon callback. Three weeks out, this stops being a metaphor.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Serious and steadying. Not ominous — they are closer to ready than they feel.',
    'OPEN: "You were told about the dragon on your first night, and you are now three weeks from it."',
    'SAY: Tonight is the night you stop being able to be surprised by that question.',
    'DO: Ask what question a panel will ask that they currently cannot answer. Take two, do not solve them — the week answers them.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "things break" to why a business pays for this.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment entirely.',
    'OPEN: "Nobody buys reliability. They buy not being woken up, and not having to apologise."',
    'NOTE: Fifteen minutes for the segment. The primitives come after the break.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The Titanic beat. It reframes skipping the failure path as normal rather than negligent, which is what lets people admit to it.',
    'ROOM: Story card full screen.',
    'MOOD: Measured. Resist any drama — the facts carry it.',
    'OPEN: "The ship that could not sink had lifeboats for half the people aboard."',
    'SAY: Nobody skips the failure path because they are lazy. They skip it because the demo keeps working.',
    'NOTE: This is the most forgiving framing of the week. Use it before you ask anyone to admit their own system has no failure path.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the reliability primitives.',
    'ROOM: Diagram up. Walk it left to right with your hand, naming each primitive once.',
    'MOOD: Settle in. This is the longest stretch of teaching tonight.',
    'OPEN: "Five primitives, and every one of them is boring. That is why they work at 2 AM."',
    'DO: Ask which of the five they already have in their capstone. Most will say none — say that is normal and expected.',
    'NOTE: Do not teach them here. This is the map; each gets its own slide.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The silent-failure story. This is the intellectual centre of the week.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Quiet. The horror is that nothing happened, and nothing is hard to dramatise — let the numbers do it.',
    'OPEN: "It did not crash. It did not alert. It just spent all night asking the same question."',
    'SAY: A system that fails loudly is a nuisance. A system that fails silently is an invoice.',
    'DO: Ask what their own system would do in that situation. Give it five seconds of genuine silence.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. You are about to autopsy real failures rather than describe categories.',
    'ROOM: Opener on screen. Keep it short — the autopsies are the content.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Two failures. Both passed review. Both are things you have shipped."',
    'NOTE: This is the door into the segment, not the segment. Do not linger.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The double-charge story — the emotional peak of the night and the whole argument for idempotency.',
    'ROOM: Story card full screen.',
    'MOOD: Serious. This one costs somebody real money and real trust; do not soften it.',
    'OPEN: "She was charged twice, and the second charge was technically correct."',
    'SAY: Idempotency is not a technical nicety. It is the difference between an outage and a betrayal.',
    'NOTE: "Technically correct" is the phrase to lean on. Every system that does this is behaving exactly as written.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. First reliability primitive goes into their own project.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing.',
    'MOOD: Energy change — stop presenting, start working alongside them.',
    'OPEN: "One primitive, in your own code, in the next thirty minutes — and then we make it fire."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: Watch the pulse. If "stuck" climbs, slow down rather than pushing to stay on schedule.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The fire-drill beat, mid-build. It sets up Thursday, where they break things on purpose.',
    'ROOM: Story card up. Sixty seconds — they can keep their hands on keyboards.',
    'MOOD: Light. This is the reward beat, not a warning.',
    'OPEN: "Nobody has ever scheduled a fire drill because they expected a fire that Tuesday."',
    'SAY: The first time your system fails should never be the first time you have seen it fail.',
    'NOTE: Name Thursday explicitly here — they will deliberately break what they just built.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the hook you opened with and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it. Slow down for the last two lines.',
    'OPEN: "Thursday we build the whole layer, and then we break it on purpose — repeatedly."',
    'SAY: You walked in with a demo that has never failed. You will leave Thursday with a system you have watched fail and recover.',
    'NOTE: End on the callback, not logistics. Logistics first, then the line, then stop.',
  ),
};

const THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Monday was the argument; tonight is the evidence.',
    'ROOM: Have the finished state ready — a run that fails, retries, trips a breaker, and lands in a dead letter.',
    'MOOD: Concrete. No hedging about what gets finished.',
    'OPEN: "By the end of tonight you will have watched your own system fail, and watched it hold."',
    'DO: Run the finished failure-and-recovery once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It reframes tonight as testing the failure path, not the happy path.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and calm. Sixty seconds, then into the work.',
    'OPEN: "The climber does not test the rope on the wall."',
    'SAY: You are not testing whether it works. You already know it works. You are testing what happens when it does not.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — resilient. Timeout, retry and backoff are in. The biggest step of the night.',
    'ROOM: Your Inspector or log output visible so you can show a retry actually happening.',
    'MOOD: Encouraging. The spread widens here more than anywhere else.',
    'OPEN: "Checkpoint one. Your call now has a deadline and a bounded number of second chances."',
    'DO: VERIFY it fired — ask who has WATCHED their own timeout trigger, not who has written one.',
    'NOTE: A primitive nobody has watched fire is a hope. Do not advance on the pulse rail alone.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — idempotent. This is the double-charge story from Monday becoming code.',
    'ROOM: Have the Monday story ready to call back to; it is the reason this checkpoint exists.',
    'MOOD: Firm. This checkpoint has a right answer.',
    'OPEN: "Checkpoint two. Run it twice, get one result. That is the whole test."',
    'DO: Ask who has actually RUN their operation twice and checked the end state. Not designed for it — run it.',
    'NOTE: Call back to the double charge explicitly. That story is why anybody bothers with this.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — gated. The quality layer that decides whether work is allowed to proceed.',
    'ROOM: Watch the clock. The failure drills still need their time after this.',
    'MOOD: Steady. Do not let the room panic about finishing.',
    'OPEN: "Checkpoint three. Something now has the authority to say no, and it is not you."',
    'DO: Have one person name what their gate refuses. A gate that has never refused anything is not a gate.',
    'NOTE: If most of the room is not here with twenty minutes left, cut a drill rather than the harden step.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The surgical-checklist beat, just before the build. It defends how unglamorous tonight is.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "The checklist that made surgery safer was not clever. That was the point."',
    'SAY: Every primitive tonight is boring. Boring is what survives 2 AM.',
    'NOTE: Somebody always wants something more sophisticated. This beat is your answer, so keep it in your pocket.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: Opens the failure segment — and the sharpest idea of the week: a test that passes about the wrong thing.',
    'ROOM: Story card up. Have a green-but-wrong assertion ready to show.',
    'MOOD: Unsettling on purpose. This is the one that changes how they read their own suite.',
    'OPEN: "The assertion says two, and two is a person’s bank statement."',
    'SAY: The scariest bugs are the ones your tests are perfectly happy about.',
    'DO: Ask what their tests would have said. The answer is almost always "green" — let them say it.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat of the intensive. Three weeks from the dragon, and they have now seen their own system fail.',
    'ROOM: Story card full screen. Clock still running; do not rush this.',
    'MOOD: Warm and genuinely proud. This is the emotional close.',
    'OPEN: "You are three weeks from the dragon, and you have finally seen your own system fail."',
    'SAY: Nobody defends a system they have never seen fail. Now you have.',
    'NOTE: Let it sit before the ship gate. This is the payoff for the whole week — do not step on it.',
  ),
};

module.exports = {
  sessions: [
    { id: 'eafa22ed-874b-4afb-a1d3-d9829da257c7', label: 'Week 9 Mon 9/21', slideNotes: MONDAY },
    { id: 'b433293a-6f92-44a1-8033-4a0665cd4c15', label: 'Week 9 Thu 9/24', slideNotes: THURSDAY },
  ],
};
