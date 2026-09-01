/**
 * week23-notes.js — presenter commentary for the generated slides in Weeks 2
 * and 3.
 *   Mon 2026-08-03  Week 2 Architecture Day  (11)
 *   Thu 2026-08-06  Week 2 Build Day          (8)
 *   Mon 2026-08-10  Week 3 Architecture Day  (12)
 *   Thu 2026-08-13  Week 3 Build Day          (7)
 *
 * Week 2 is Agent Skills: tribal knowledge becoming an executable team asset —
 * the thread that runs to Marcus in Week 6 and closes in Week 12. Week 3 is the
 * Claude API: the first week anything costs money, and the first appearance of
 * the 2 AM question that Weeks 6, 8, 9 and 12 all return to.
 *
 * Week 2 Architecture Day has no architecture-segment story beat; that is
 * authored, not an omission here.
 */

const L = (...lines) => lines.join('\n');

const W2_MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The hook. It names the failure that motivates the entire week — a green job and a wrong number.',
    'ROOM: Full screen, one sentence. Nothing else.',
    'MOOD: Flat and factual. The horror is that nothing looked wrong.',
    'OPEN: "The ETL job says SUCCESS. The revenue number is wrong."',
    'NOTE: Three seconds of silence. Anyone who has worked with data pipelines has lived this exact sentence.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show three working skills before any theory.',
    'ROOM: Have three real skills in a repo, ready to invoke one live.',
    'MOOD: Concrete. Week 2 is the first week they produce something reusable.',
    'OPEN: "By Thursday you have three skills in your repo that anyone on your team can run."',
    'DO: Invoke one skill live before explaining what a skill is. Ten seconds.',
    'NOTE: Sell reusability, not syntax. The architecture slide handles the how.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The absent-analyst beat. It starts a thread that runs to Marcus in Week 6 and closes in Week 12.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Understated. This is recognition, not indictment.',
    'OPEN: "The analyst who normally catches this is out today."',
    'SAY: The analyst should not be the control. The repeatable procedure should be the control.',
    'NOTE: Week 6 tells the same story as Marcus, and Week 12 closes it. Say it cleanly — it is load-bearing across the program.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Why encoded procedure beats a person who knows.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment.',
    'OPEN: "Every team has one person who checks the thing nobody else knows to check."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The payoff beat — the whole room just ran the same expert checks.',
    'ROOM: Story card full screen. Ideally point at what the room just did.',
    'MOOD: Genuinely pleased. This is the first "oh, that is what this is for" of the program.',
    'OPEN: "Everyone in the room just performed the same checks."',
    'SAY: Tribal knowledge just became an executable team asset.',
    'DO: Ask whose expertise they would encode first at work. Take two — the answers are usually excellent.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — what a skill is and how it is shaped.',
    'ROOM: Diagram up. Walk it left to right.',
    'MOOD: Settle in. Longest teaching stretch tonight.',
    'OPEN: "A skill is a procedure somebody who knows what they are doing would follow, written down so anyone can run it."',
    'DO: Ask for one procedure in the room that currently lives in somebody’s head.',
    'NOTE: Do not teach the anatomy here — this is the map.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. About to show a skill that detects but cannot explain.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Two skills. One caught the problem. Neither one could tell you why it happened."',
    'NOTE: The door into the segment, not the segment.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The detection-versus-diagnosis beat. It is why a second and third skill exist at all.',
    'ROOM: Story card full screen.',
    'MOOD: Practical. This is a real distinction people conflate constantly.',
    'OPEN: "The gate protected the dashboard. Now the business wants the cause."',
    'SAY: Detection protects the business. Diagnosis restores the system.',
    'NOTE: This is the argument for building three skills rather than one good one. Use it if anyone asks why three.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. First skill goes into their own repo.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing.',
    'MOOD: Energy change — stop presenting, start working alongside them.',
    'OPEN: "One skill, in your repo, that encodes something you actually know."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: Push people toward a procedure they genuinely own. A generic skill teaches nothing about their work.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The communication beat, mid-build. It sets up the third skill — the one that writes for leadership.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Wry. Everyone has sent a technically correct message nobody could use.',
    'OPEN: "The technical team has an answer. Leadership is still waiting."',
    'SAY: A technically correct answer can still be the wrong communication product.',
    'NOTE: This is why one of the three skills produces an executive summary. Make that connection explicit.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the absent analyst and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it warmly.',
    'OPEN: "Thursday we build all three, and commit them so your team inherits them."',
    'SAY: You walked in with knowledge in one head. You leave Thursday with it in a repository.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const W2_THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Show the finished blueprint before theory.',
    'ROOM: Have a real blueprint output on screen — architecture, stack, scoped MVP.',
    'MOOD: Concrete and a bit exciting. Week 2 Thursday produces the most tangible artifact so far.',
    'OPEN: "By 8:30 you have three skills and a blueprint for your own project, generated from one paragraph you wrote tonight."',
    'DO: Show the finished blueprint once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It gives permission to start from an unfinished idea.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Encouraging. Several people think their idea is not ready. It does not need to be.',
    'OPEN: "Every real system you have ever used started exactly where you are right now."',
    'SAY: A blueprint is not what you build after the idea is finished. It is what makes an unfinished idea real enough to argue with.',
    'NOTE: Aim this at anyone stalling because they have not decided what to build. Starting is the exercise.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — the first skill fires. First working skill of the program.',
    'ROOM: Your own skill open so you can show a real one rather than describe it.',
    'MOOD: Encouraging. The spread widens here.',
    'OPEN: "Checkpoint one. You invoked something you wrote, and it did the thing."',
    'DO: VERIFY it ran — ask who has actually invoked their skill, not who has the file.',
    'NOTE: A skill that exists but has never been invoked is not CP1. Say that before advancing.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — all three skills. The set matters more than any one of them.',
    'ROOM: Watch the clock. Scoping and the drills still need time.',
    'MOOD: Brisk. Same pattern as the first, twice more.',
    'OPEN: "Checkpoint two. Three skills, and they do different jobs — detect, diagnose, communicate."',
    'DO: Ask whether anyone’s three skills all do roughly the same thing. If so, they have built one skill three times.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — scoped and demoable. The blueprint gets cut down to something buildable.',
    'ROOM: Clock visible. If time is short, cut a drill rather than the commit step.',
    'MOOD: Steady. Scoping is where ambition meets eleven weeks.',
    'OPEN: "Checkpoint three. Scoped down to something you could actually finish, and good enough to show."',
    'DO: Ask one person what they CUT. The cut is the skill, not the plan.',
    'NOTE: Anyone who cut nothing has not scoped. Push gently — over-scoping in Week 2 hurts in Week 11.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The blueprint beat, just before the build. It defends spending time before typing.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Matter-of-fact, brief.',
    'OPEN: "Nobody pours a foundation before seeing the blueprint. The same rule applies here."',
    'SAY: Slow is not the opposite of fast here. Guessing is.',
    'NOTE: Keep this for anyone impatient to start coding tonight.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The lost-work beat. It is the argument for committing, told as a loss rather than a rule.',
    'ROOM: Story card up.',
    'MOOD: Rueful. Everyone has lost work exactly this way.',
    'OPEN: "He rebuilt four hours of work from a screenshot, because that was the only copy left."',
    'SAY: Nothing failed. There was just never a second copy.',
    'DO: Ask who has lost work this month. Hands go up — that is the whole argument made for you.',
  ),
  'storybeat:failure-901': L(
    'SITUATION: Closing beat. It connects commit history to the Expo defence in Week 12.',
    'ROOM: Story card full screen. Clock still running; do not rush.',
    'MOOD: Forward-looking. This is the first time the Expo becomes practical rather than distant.',
    'OPEN: "At the Expo somebody will ask when you actually built this, and a folder cannot answer."',
    'SAY: Commit history is not admin. It is the only evidence you built it the way you say you did.',
    'NOTE: Week 12 asks exactly this question. Plant it here so the habit has ten weeks to form.',
  ),
};

const W3_MONDAY = {
  'hook:cold-open--1': L(
    'SITUATION: The hook. Week 3 is where the capstone becomes real.',
    'ROOM: Full screen, one sentence. Nothing else.',
    'MOOD: A turn, delivered plainly. Slight lift in energy.',
    'OPEN: "Tonight your project stops being an idea and becomes a build."',
    'NOTE: Three seconds of silence. For several people this is the night the program stops being a course.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show the working assistant before any theory.',
    'ROOM: Have a real API-backed workflow assistant running.',
    'MOOD: Concrete. First week anything they build costs money — make the value obvious.',
    'OPEN: "By Thursday you have a workflow assistant calling the API, doing one real job in your project."',
    'DO: Run it once, live, before explaining any of it.',
    'NOTE: Sell the job it does, not the four API moves. The architecture slide handles those.',
  ),
  'storybeat:checkin-900': L(
    'SITUATION: The napkin beat. It makes writing the one-paragraph idea feel consequential rather than administrative.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Warm and a bit romantic. This one is allowed to be inspiring.',
    'OPEN: "Somewhere there is a napkin that became a company."',
    'SAY: The paragraph is not the small part of this. It is the only part nobody can do for you.',
    'DO: Give them a genuine minute to write it. Do not narrate over the silence.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Why direct API access changes what they can build.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Level and commercial. Keep syntax out of this segment.',
    'OPEN: "Everything so far ran when you were watching. The API is how it runs when you are not."',
    'NOTE: Fifteen minutes. This is the segment that gets clipped for social.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: The architect beat. It answers the anxiety in the room about not being a developer.',
    'ROOM: Story card full screen.',
    'MOOD: Steadying. Several people are worried tonight gets too technical.',
    'OPEN: "The architect on a job site does not lay the bricks. She also does not leave."',
    'SAY: You were never going to win by typing faster. You win by being the one who notices.',
    'NOTE: Say this BEFORE the Python appears, not after. It is pre-emptive reassurance.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the main teaching block — the API moves.',
    'ROOM: Diagram up. Walk it left to right, naming each move once.',
    'MOOD: Settle in. Longest teaching stretch of the night.',
    'OPEN: "Four moves. Everything you build for the rest of this program is some arrangement of these four."',
    'DO: Ask who has called any API before. The spread is wide in Week 3 — adjust pace on the answer.',
    'NOTE: Do not teach the four here. This is the map.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: The first-cost beat. Until tonight everything was free at the point of use.',
    'ROOM: Story card full screen. Have a real token count or cost figure ready if you can.',
    'MOOD: Grounding. This is a genuine shift in what they are doing.',
    'OPEN: "Everything you have built so far has been free at the point of use."',
    'SAY: Every serious system you will ever build is somebody choosing what to spend on which decision.',
    'NOTE: Sets up the cost arithmetic in Week 9. Do not skip it — that lesson assumes this one landed.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener. About to autopsy API usage that works and API usage that quietly does not.',
    'ROOM: Opener on screen. Keep it short.',
    'MOOD: Shift gear. Detective, not lecturer.',
    'OPEN: "Two integrations. One of them ran all night and nobody knew."',
    'NOTE: The door into the segment.',
  ),
  'storybeat:deconstruct-900': L(
    'SITUATION: The FIRST appearance of the 2 AM question. Weeks 6, 8, 9 and 12 all return to it.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Quiet. The bill is the punchline; let it arrive.',
    'OPEN: "The loop that ran all night and nobody was awake to see it."',
    'SAY: A system that fails loudly is a nuisance. A system that fails silently is a bill.',
    'NOTE: This is where the 2 AM thread starts. Say it deliberately — four later weeks call back to this exact framing.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Build segment opens. First API call in their own project, and the first Python for many.',
    'ROOM: Your terminal and Claude Code visible. Mentors standing — this is a high-anxiety segment.',
    'MOOD: Extra patient. Nobody is becoming a Python developer tonight and they need to hear that.',
    'OPEN: "You are not writing Python tonight. You are directing it and judging what comes back."',
    'DO: Say out loud that every block tonight is a prompt; Claude Code drives the terminal, nobody types shell.',
    'NOTE: The key goes in .env, edited by hand — never into a prompt, never echoed on screen. Say that plainly.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: Mid-build reassurance, aimed squarely at the non-developers.',
    'ROOM: Story card up. Sixty seconds — hands can stay on keyboards.',
    'MOOD: Kind and specific. Deliver it while people are still struggling, not after.',
    'OPEN: "Nobody in this room is becoming a Python developer tonight, and nobody needs to."',
    'SAY: You are not learning to write it. You are learning to judge it. You have been doing that for two weeks already.',
    'NOTE: This is the highest-value beat of Week 3. It keeps people who nearly dropped out in the room.',
  ),
  'cta:trailer-0': L(
    'SITUATION: Final slide. Close on the build becoming real and set up Thursday.',
    'ROOM: Trailer on screen. STOP the class clock before you start talking.',
    'MOOD: Land it warmly.',
    'OPEN: "Thursday we wire it end to end and put a number on what it costs."',
    'SAY: You walked in with an idea. You leave Thursday with something that runs and a bill you can explain.',
    'NOTE: End on the callback, not logistics.',
  ),
};

const W3_THURSDAY = {
  'segment:result-preview-0': L(
    'SITUATION: First content slide of Build Day. Monday taught four moves; tonight they become one thing.',
    'ROOM: Have the finished assistant running end to end, with its cost printed.',
    'MOOD: Concrete. This is the first build that costs money and does a real job.',
    'OPEN: "By 8:30 it runs end to end, on your project, and you know what each run costs."',
    'DO: Run it once, live, before explaining any of it.',
    'NOTE: Do not list checkpoints here — the build map does that next.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Opening beat. It reframes four separate techniques as one system.',
    'ROOM: Story card full screen. Step back from the keyboard.',
    'MOOD: Brief and purposeful. Sixty seconds.',
    'OPEN: "On Monday you learned four moves. Tonight they stop being moves."',
    'SAY: You are not learning four things anymore. You are building one thing that happens to use them.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 — wired. The API call works from their own project.',
    'ROOM: Your own working call open so you can show a real one.',
    'MOOD: Encouraging. First API success is a real milestone for most of this room.',
    'OPEN: "Checkpoint one. Your project just talked to the API and got something back."',
    'DO: VERIFY it is THEIR project — ask who is running this inside their capstone repo rather than a scratch file.',
    'NOTE: A working call in a scratch folder is not CP1. It has to live where the build lives.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 — running. It does an actual job now, not a hello-world.',
    'ROOM: Watch the clock. Measurement and the drills still need time.',
    'MOOD: Brisk and encouraging.',
    'OPEN: "Checkpoint two. It does one real job from your build plan, start to finish."',
    'DO: Ask one person what job theirs does. If the answer is "it summarises text", push for what it is FOR.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 — measured. The first time they attach a number to their own system.',
    'ROOM: Clock visible. The failure drill still needs its time.',
    'MOOD: Steady. This is the habit Week 9 depends on.',
    'OPEN: "Checkpoint three. You know what one run costs, and you worked it out rather than guessed."',
    'DO: Ask for one person’s number out loud. Then ask what a thousand runs a day would cost.',
    'NOTE: Do not accept a remembered price. Rates come from the live pricing page, not from memory.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: The fire-drill beat, just before the build. It frames the failure segment as rehearsal.',
    'ROOM: Story card up. Hold it — resist jumping into CP0.',
    'MOOD: Light, brief.',
    'OPEN: "Every fire drill you have ever done was for a fire that never came."',
    'SAY: The first time your code fails should never be the first time you have seen it fail.',
    'NOTE: Week 9 reuses this beat almost verbatim. Landing it here makes that one a callback rather than a repeat.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The leaked-key beat. The most operationally important story of the early weeks.',
    'ROOM: Story card full screen. Have the rotate-first rule ready to state plainly.',
    'MOOD: Serious and unambiguous. No hedging on this one.',
    'OPEN: "The key was in the file for four minutes. That was enough."',
    'SAY: Rotate first, investigate second. Judgement is slower than a scanner.',
    'DO: Say the rule out loud twice, and tell them where their key actually lives — in .env, gitignored, never in a prompt.',
    'NOTE: This is why tonight’s setup gitignores .env BEFORE creating it. Make that connection explicit.',
  ),
};

module.exports = {
  sessions: [
    { id: 'd9e121ce-8dbe-4fff-a066-d3753534342f', label: 'Week 2 Mon 8/3', slideNotes: W2_MONDAY },
    { id: 'e082e982-42b5-465e-989d-d2829b3869f8', label: 'Week 2 Thu 8/6', slideNotes: W2_THURSDAY },
    { id: 'a5d3d69e-b4a4-45e1-b22b-12b04147858e', label: 'Week 3 Mon 8/10', slideNotes: W3_MONDAY },
    { id: '287d6486-c6f0-486d-b87b-de5c339a1aef', label: 'Week 3 Thu 8/13', slideNotes: W3_THURSDAY },
  ],
};
