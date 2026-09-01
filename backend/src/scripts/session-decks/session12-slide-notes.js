/**
 * session12-slide-notes.js — real presenter commentary for the 22 GENERATED
 * slides in the Session 12 deck.
 *
 * Teach slides carry their own authored `script`. Everything else in a deck is
 * generated — the segment openers, story beats, question slides, the cover, the
 * break, the trailer — and each shipped one hardcoded tip reused identically
 * every week ("Walk the diagram node by node…"). That left 22 of 38 slides on
 * boilerplate with no way to reach them from KitConfig. Ali, 2026-08-31, on the
 * architecture opener: "this slide doesn't have any commentary — that shouldn't
 * happen. ever."
 *
 * Keyed by slide id (`<segmentId>-<index>`), or `<kind>:<id>` where an id is
 * shared by two slides — the cover and the cold-open segment slide are both
 * 'cold-open-0'.
 *
 * Same tagged vocabulary as the teach scripts, so these paint with the same
 * colours on the instructor's phone:
 *   SITUATION (violet) · ROOM (blue) · MOOD (green) · OPEN (gold)
 *   SAY (gold) · DO (blue) · NOTE (grey)
 */

const L = (...lines) => lines.join('\n');

module.exports = {
  sessionId: '586c296b-9dc9-44a5-a96c-54c354e72de1',

  slideNotes: {
    /* ---------------------------------------------------------- cold open -- */
    'cover:cold-open-0': L(
      'SITUATION: Title card. People are still arriving and settling; nobody is ready to learn yet.',
      'ROOM: Share your screen NOW if you have not. QR is on the right for late arrivals.',
      'MOOD: Warm and unhurried. Do not start teaching over people taking their coats off.',
      'OPEN: "Give it a minute, let people land. Scan the code on the right when you sit down."',
      'NOTE: Do not start the class clock until you actually begin. It drives the pace bar all night.',
    ),
    'rules:cold-open-1': L(
      'SITUATION: The housekeeping slide. Thirty seconds, then move — this is not content.',
      'ROOM: Point at the QR. Check the pulse counter climbing on the right before you go on.',
      'MOOD: Brisk and friendly. Get it done.',
      'OPEN: "Phone out, scan the code. That is how you answer tonight — I am not going to ask for hands all night."',
      'DO: Wait for the check-in count to stop climbing before advancing. Do not teach to a half-joined room.',
    ),
    'hook:cold-open--1': L(
      'SITUATION: The single-sentence hook. This is the first real thing you say tonight.',
      'ROOM: Full screen, one sentence. Nothing else on the display.',
      'MOOD: Stop. Slow right down. This line needs silence around it, not energy.',
      'OPEN: "Tonight the thing you built stops working while you watch, and starts working while you sleep."',
      'NOTE: Say it, then say NOTHING for three seconds. Do not explain it — the whole class explains it.',
    ),
    'segment:cold-open-0': L(
      'SITUATION: The promise. You are showing them the finished thing before any theory, so they know what they are buying.',
      'ROOM: Cold-open card on screen. Nothing to run.',
      'MOOD: Confident. This is a sales moment, in the good sense.',
      'OPEN: "By Thursday you will have this — a server that reports while it runs, keeps a traceable log, refuses to leave its own directory, and carries a decision you can defend."',
      'NOTE: Sell the payoff, do not explain the mechanism. Four upgrades get named on the roadmap slide.',
    ),

    /* ------------------------------------------------------------ checkin -- */
    'interaction:checkin-950': L(
      'SITUATION: The operational gate. You are finding out who can actually participate tonight before you teach anything.',
      'ROOM: Question on screen. Mentors on their feet, not sitting.',
      'MOOD: Practical, zero judgement. Nobody should feel bad picking the last option.',
      'OPEN: "Before we touch anything — where is your Week 5 server right now? Be honest, this decides who I send help to."',
      'DO: Read the counts out loud and send mentors to the last two groups IMMEDIATELY.',
      'NOTE: Anyone with no Week 5 server pairs with a neighbour tonight and rebuilds before Thursday. Do not let someone sit stuck for two hours.',
    ),
    'storybeat:checkin-900': L(
      'SITUATION: First change of pace. You are cashing a promise made on night one, which most of them half remember.',
      'ROOM: Story card full screen. Step away from the keyboard for this one.',
      'MOOD: Drop your voice. This is a story, not a slide.',
      'OPEN: "On the first night of this program we told you about the dragon. You probably thought it was theatre."',
      'SAY: Nobody defends a demo in front of a panel. Tonight you start building the thing you will have to stand behind.',
      'NOTE: Tell it, let it land, move on. Do not over-explain it.',
    ),

    /* --------------------------------------------------- business problem -- */
    'bullets:business-problem-0': L(
      'SITUATION: Segment opener. You are turning from "what we are doing" to "why anyone should care".',
      'ROOM: Bullets on screen. This is the segment that gets clipped for social — stay on business stakes, not syntax.',
      'MOOD: Level and serious. No jargon in this segment at all.',
      'OPEN: "Prototype integrations break in production. That sentence is boring until it is your Tuesday."',
      'NOTE: Fifteen minutes for this whole segment. Nothing technical belongs here.',
    ),
    'storybeat:business-problem-900': L(
      'SITUATION: Marcus. This is the emotional centre of the business case and the reason the notifications segment lands later.',
      'ROOM: Story card full screen. Away from the keyboard.',
      'MOOD: Understated. The story is doing the work — do not add urgency to it.',
      'OPEN: "It ran for four years. Then Marcus took a holiday."',
      'SAY: The failure was not that Marcus went away. It was that the system could not explain itself without him.',
      'NOTE: Resist adding a moral. The punch line IS the moral.',
    ),
    'interaction:business-problem-950': L(
      'SITUATION: The 2 AM question. This vote earns you the entire notifications segment later.',
      'ROOM: Question on screen. "LOUD or QUIET" should already be on your whiteboard.',
      'MOOD: Invite honesty. The useful answers here are the embarrassing ones.',
      'OPEN: "Six hours of wrong answers, 2 AM. How do you actually find out? Not how you should — how you would."',
      'DO: Take the vote BEFORE revealing. Read the spread out loud without judgement.',
      'NOTE: If a lot of people pick the last option, say so plainly. That honesty is what makes the next twenty minutes matter.',
    ),

    /* ------------------------------------------------------- architecture -- */
    'architecture:architecture-0': L(
      'SITUATION: Segment opener for the biggest block of the night — four upgrades in twenty minutes. This slide is the table of contents for them.',
      'ROOM: Diagram on screen. Walk it LEFT TO RIGHT with your hand: client, server, then the four things hanging off it.',
      'MOOD: Settle in. Tell them this is the longest stretch of teaching tonight and it is worth it.',
      'OPEN: "Five things on this list. Four of them are tonight, and every one exists because you will not be there when it runs."',
      'DO: Ask the room where the trust boundary is before you move on. Take one answer.',
      'NOTE: Do not teach the four upgrades here — this is the map. Each gets its own slide next.',
    ),
    'storybeat:architecture-900': L(
      'SITUATION: The contractor story, sitting right after sampling so the mechanism has something human attached to it.',
      'ROOM: Story card full screen.',
      'MOOD: Conversational. This one usually gets a nod of recognition — let it.',
      'OPEN: "Think about how a serious building actually handles contractors. The good ones never get their own master key."',
      'SAY: Every security review you will ever sit in comes down to one question: who holds the keys?',
      'NOTE: This is the story they will retell at work. Deliver it cleanly and move.',
    ),
    'interaction:architecture-950': L(
      'SITUATION: Fast knowledge check straight after sampling. Confirm it landed, then keep moving.',
      'ROOM: Question on screen. Keep this one short.',
      'MOOD: Light and quick. Not a test.',
      'OPEN: "One question before we go further. Whose API key pays for a sampling call?"',
      'DO: Reveal, ONE line of why, move on.',
      'NOTE: If someone argues a server holding its own key is simpler, agree — then ask who signs off on that server going into their company.',
    ),
    'interaction:architecture-951': L(
      'SITUATION: The biggest moment of the night. Moved here deliberately from minute 95, where it kept getting cut.',
      'ROOM: FULL-SCREEN THEATER. Lock the votes, show the spread, then reveal. Do not rush the lock.',
      'MOOD: Raise the energy hard. This is the one they should feel.',
      'OPEN: "You are the architect. Forty colleagues, three offices, more than one machine. Choose."',
      'DO: Ask anyone who picked the last option to say it out loud, without embarrassment. Naming the default is the first step to replacing it.',
      'NOTE: This is the slide people quote back to you in Week 11. Give it the full minute.',
    ),

    /* --------------------------------------------------------- deconstruct -- */
    'example:deconstruct-0': L(
      'SITUATION: Segment opener after the heavy architecture block. Two autopsies follow — this frames them.',
      'ROOM: Opener on screen. Your fake file for the roots demo should already be planted.',
      'MOOD: Shift gear. Less lecture, more detective.',
      'OPEN: "Two real failures. Both passed review. Both are the decisions we just made, arriving as incidents."',
      'NOTE: Keep this short — the autopsies are the content, this is just the door into them.',
    ),
    'storybeat:deconstruct-900': L(
      'SITUATION: The eleven-days story. This is the payoff for "loud or quiet" from the business segment.',
      'ROOM: Story card full screen. Point back at LOUD or QUIET on the whiteboard.',
      'MOOD: Quiet and a bit grim. Do not soften the ending.',
      'OPEN: "It answered every question correctly for eleven days. Every answer was from a stale file."',
      'SAY: A system that fails loudly costs you a night. A system that fails quietly costs you eleven days and a customer.',
      'NOTE: Found by a customer, not a dashboard. That detail is the whole story — do not skip it.',
    ),
    'interaction:deconstruct-950': L(
      'SITUATION: Diagnostic question on the stateful-replica failure. The room can genuinely solve this one.',
      'ROOM: Question on screen. Resist showing the answer slide.',
      'MOOD: Patient. This is the one where you shut up and let them think.',
      'OPEN: "Two times in three. Intermittent, unreproducible. What do you check first?"',
      'DO: Give them the failure RATE and WAIT. Someone will work out why two-in-three matters.',
      'NOTE: When they get there out loud, STOP and let them explain it to the room. A peer landing this beats you landing it.',
    ),

    /* --------------------------------------------------------------- reset -- */
    'break:reset-0': L(
      'SITUATION: Five-minute break, halfway. The build segment is next and it needs everyone back on time.',
      'ROOM: Leave the break slide up with the time you will restart. Say the actual clock time out loud.',
      'MOOD: Genuinely off. Do not keep teaching through the break.',
      'OPEN: "Five minutes. We come back at [say the real time]. When you get back, have your Week 5 server folder open."',
      'DO: Use the break to help anyone the room-check flagged as stuck. That is what this five minutes is FOR.',
      'NOTE: Come back on time yourself. The build segment is the tightest part of the night.',
    ),

    /* ---------------------------------------------------------- micro-build -- */
    'microbuild:micro-build-0': L(
      'SITUATION: Build segment opens. Thirty minutes: one gate, one live build, two read-alongs, one graded artifact.',
      'ROOM: Your terminal and Claude Code both visible. Inspector ready to launch.',
      'MOOD: Change of energy — you stop presenting and start working alongside them.',
      'OPEN: "Hands on keyboards. Two things we build together, two things I read with you and you run before Thursday."',
      'DO: Say that split out loud NOW so nobody sits waiting to type during the read-alongs.',
      'NOTE: Watch the pulse. If "stuck" climbs, slow down — do not push on to stay on schedule.',
    ),
    'interaction:micro-build-950': L(
      'SITUATION: Build checkpoint. Do not move past this until most of the room has seen a tick.',
      'ROOM: Question on screen. Mentors moving to anyone not green.',
      'MOOD: Operational and encouraging. Name the numbers out loud.',
      'OPEN: "Hands up on your phone — did the ticks actually arrive?"',
      'DO: Call the count out loud ("17 of 22 — five more"). Mentors to the stuck group immediately.',
      'NOTE: For "no ticks", the cause is almost always that the client sent no token — which means their guard is working. Say that out loud so nobody starts deleting good code.',
    ),

    /* ----------------------------------------------------------- challenge -- */
    'interaction:challenge-950': L(
      'SITUATION: Self-diagnosis on their own project. This segment is the expendable one if you are running long.',
      'ROOM: Question on screen. Roadmap diagram nearby if you can get back to it.',
      'MOOD: Reflective, winding down from the build.',
      'OPEN: "Your own server, honestly. Which of the four would change the most if you added it first?"',
      'DO: Read the spread, take TWO answers out loud, connect each back to the night-shift picture from the opening.',
      'NOTE: No wrong answer here. If you are short on time, take one answer instead of two and move to the trivia.',
    ),

    /* -------------------------------------------------------------- trivia -- */
    'interaction:trivia-950': L(
      'SITUATION: Last question of the night. Short, and it plants something that returns in Week 10.',
      'ROOM: Question on screen. Keep it to a couple of minutes.',
      'MOOD: Crisp. You are closing, not opening a new thread.',
      'OPEN: "Last one. A server checks the path starts with the allowed directory, then opens the file. Enough?"',
      'DO: Reveal, then have the room say "resolve first, compare second" back to you once.',
      'NOTE: Do not let this become a prompt-injection discussion. It gets picked up properly in Week 10.',
    ),

    /* ------------------------------------------------------------- trailer -- */
    'cta:trailer-0': L(
      'SITUATION: Final slide. Close the loop you opened with the night shift, and set up Thursday.',
      'ROOM: Trailer on screen. STOP the class clock before you start talking.',
      'MOOD: Land it. Slow down for the last two lines and hold the room for ten more seconds.',
      'OPEN: "Thursday we make it work — all four upgrades wired in, and then we break two of them on purpose."',
      'SAY: Bring three things: your transport decision, your Week 5 server, and the two prompts you did not run tonight.',
      'SAY: It is 2 AM. Loud, or quiet?',
      'NOTE: End on the question, not on logistics. Say the logistics first, then the question, then stop.',
    ),
  },
};
