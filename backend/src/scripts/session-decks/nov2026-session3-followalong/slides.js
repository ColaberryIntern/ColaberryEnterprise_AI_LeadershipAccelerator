/**
 * slides.js — the content of Nov 2026 Session 3 / Weekly Live Episode 1,
 * "Your Know-How Is Now a Product", rebuilt 2026-11-23 for beginners.
 *
 * Ali, 2026-11-23: make it look like the Open House, with more pictures and more
 * interaction; build it for someone with no background ("using terms like ETL
 * for the 1st class will be confusing"); give prompts to run throughout; let
 * people follow on a phone (scan) or a computer (click); and give Ali a narrow
 * presenter window with the key phrases, what to read, and the quotes Piyush
 * needs for clips, changing on every slide.
 *
 * Source plan: docs/live-sessions/2026-11-23-your-know-how-is-now-a-product/
 * (same story, same promise, same sound bites), re-pitched: every hands-on step
 * runs in plain Claude chat on a phone or claude.ai, no code, no data jargon.
 *
 * One object per slide. Fields:
 *   min, title          run of show (minutes must total 60; build.js checks)
 *   html                the projected slide body (built by build.js helpers)
 *   do                  stage direction for Ali (presenter window, blue)
 *   say[]               key phrases to hit (presenter window, checklist)
 *   read                text to read out word for word (presenter window)
 *   clip                the line Piyush cuts into a Short (presenter window, gold)
 *   follow              the card on every attendee's phone or computer
 *   prompt {label,text,expect}   a hands-on prompt (phones get Copy + Open in Claude)
 *   poll {key,kind,q,options,answer,reveal}   a live vote (phones vote)
 * No banned words, no stats on slides, no partner logos.
 */

const P = {
  hello: `Hi Claude. I'm in a live class tonight, learning how to teach you a task once so you do it the same way every time. In one short sentence, say hello and tell me you're ready.`,
  practice: `Make me a small practice table of 10 online orders, using made-up data only.
Columns: Order ID, Date, Customer, Region, Amount.
Hide 3 mistakes in it that a careful person would catch before sharing it with the boss.
Do not tell me what the mistakes are or where they are. Just show the table.`,
  check: `Now check that table using my morning checklist:
1. Is any order listed twice?
2. Is any box empty?
3. Is any amount below zero, or over 10,000?
4. Is any date in the future?
For each check, write PASS or FAIL and name the order it is about.
Then, on its own line, give one final answer: GO (safe to share) or STOP (fix it first).`,
  skill: `Turn the checklist I just used into a skill: saved instructions you would follow the same way every time.
Write it as a file called SKILL.md with these parts:
1. name: morning-order-check
2. description: one sentence that says exactly WHEN to use it, in the words a coworker would use. Example: when someone asks if an orders file is safe to share.
3. steps: my 4 checks, numbered
4. result: PASS or FAIL for each check, then GO or STOP
5. never: never change the data, only report on it
Keep it short and in plain English.`,
  update: `Use the result of the check to write a short update for my manager, who is not technical. Use exactly these 5 lines:
Status: GO or STOP
What happened: one sentence
Why it matters: one sentence
Who fixes it: a job title, not a name
Next update: a time later today
Keep it under 80 words. No technical words.`,
  yours: `Help me turn one task I repeat at work into a skill. Ask me 5 questions, one at a time, and wait for my answer each time:
1. What is the task?
2. When should it happen, or what starts it?
3. What steps do I follow?
4. What does a good result look like?
5. What must never happen?
After my 5th answer, write my skill card with: name, when to use it, steps, result, never.`,
};

const RUN = ['Tap Copy (phone) or Open in Claude (computer)', 'Paste it into a new chat in Claude and send it', 'Tap Finished below when Claude answers'];

module.exports = [
  {
    kind: 'title', min: 2, title: 'Welcome',
    do: 'Big smile, camera on. Welcome people by name as they arrive in chat.',
    say: ['Welcome to the very first Weekly Live', 'No experience needed: if you can copy and paste, you can do tonight', 'Grab your phone, or open a second window on your computer'],
    clip: 'Tonight you are going to teach AI something only you know, once, and it will never forget it.',
    follow: { icon: '👋', heading: 'Welcome! Class starts in a moment', body: 'Keep this page open. Every time the slide changes, this card tells you what is happening and what to do.' },
  },
  {
    kind: 'lobby', min: 4, title: 'Get connected',
    do: 'Give it 2 to 3 minutes. Paste the computer link in the Zoom chat (copy button below). Read the counter out loud as it climbs.',
    say: ['On your phone: scan the code', 'On a computer: click the link in the chat, then Open as a side window', 'Type your name and email so we know you were here', 'No Claude yet? The page shows you how to get it in one minute'],
    follow: { step: 'Step 1', icon: '📱', heading: 'You are in. Now get Claude ready', body: 'You will copy short prompts into Claude tonight. If you do not have Claude yet, open the helper below and follow the 3 steps.', install: true },
  },
  {
    kind: 'agenda', min: 1, title: "Tonight's plan",
    do: 'Point at the hands-on rows. 30 seconds.',
    say: ['Five short hands-on moments, all copy and paste', 'By the end you will have your own skill card for a task from your job'],
    follow: { icon: '🗺️', heading: "Tonight's plan", bullets: ['A true-to-life story', 'What a skill is', '5 short hands-on prompts', 'Your own skill card', 'What comes next'] },
  },
  {
    kind: 'poll', min: 1, title: 'Poll: how do you use AI today?',
    poll: { key: 's3-ai-use', kind: 'poll', q: 'How do you use AI today?', options: ["I haven't really used it yet", 'I ask it questions', 'It helps me write emails and documents', 'I build things with it'] },
    do: 'First vote. Narrate the bars. Lock, then Reveal.',
    say: ['However you answered, tonight is built for you', 'Most people stop at asking questions. Tonight we go one step further'],
    follow: { icon: '🗳️', heading: 'Vote below', body: 'Tap the answer that fits you. Your vote shows up live on the screen.' },
  },
  {
    kind: 'story', min: 3, title: '8:05 AM. The person who knows is out.',
    do: 'Slow down. Tell it like a story. This is the cold open.',
    say: ['Illustrative scenario, but you have lived it', 'The automatic update said SUCCESS. It still was wrong', 'Her check lived in her head'],
    read: 'It is 8:05 in the morning. The sales dashboard says sales are down 18 percent. The automatic overnight update says SUCCESS: it ran on time, no errors. But the one analyst who checks those numbers by hand every morning is out sick today, and nobody else knows her checklist. Hidden in the data: one order counted twice, one order with no region, and one order with a negative amount.',
    clip: 'The person who knew how to check it was out today, so nobody checked it. Her know-how lived in her head.',
    follow: { icon: '☕', heading: 'A story: the person who knows is out', body: 'One analyst checks the numbers by hand every morning. Today she is out, and nobody else knows her checklist. So the mistakes go out to the boss.' },
  },
  {
    kind: 'statement', min: 2, title: 'Your know-how is now a product',
    do: 'Read the headline once. Pause. Let it land.',
    say: ['The checks and judgment in your head are valuable', 'Companies are now turning that know-how into AI skills', 'Tonight you write one down'],
    clip: 'Your know-how is now a product. The checks you do by hand every week are exactly what companies are turning into AI skills.',
    follow: { icon: '💡', heading: 'The big idea', body: 'What you know how to do at work, your checks, your steps, your judgment, can be written down once so AI does it the same way every time.' },
  },
  {
    kind: 'skill', min: 4, title: 'What is a skill? A recipe card for Claude',
    do: 'Point at each line of the card. Spend the most time on WHEN.',
    say: ['A skill is a recipe card for Claude', 'Five lines: name, when, steps, result, never', 'The WHEN line is the most important line on the card', 'You write it once. Claude keeps it and follows it the same way every time'],
    clip: 'A skill is just a recipe card for AI: a name, when to use it, and the steps you would never skip.',
    follow: { icon: '🗂️', heading: 'A skill is a recipe card for Claude', bullets: ['Name: what it is called', 'When: the moment to use it (most important)', 'Steps: what to do, in order', 'Result: what the answer looks like', 'Never: what it must never do'] },
  },
  {
    kind: 'handson', min: 3, title: 'Hands-on 1: say hello to Claude', n: 1, img: 'phonelaptop',
    prompt: { label: 'Hands-on 1: say hello', text: P.hello, expect: 'Claude says hello and that it is ready.' },
    do: 'Run it yourself on screen with the Open in Claude button. Wait until most people type Finished.',
    say: ['This is only to make sure Claude is open and working', 'Phone: tap Copy, open the Claude app, paste. Computer: click Open in Claude', 'Stuck? Tap Stuck on the page and a mentor will help'],
    follow: { step: 'Hands-on 1 of 5', icon: '🤝', heading: 'Say hello to Claude', bullets: RUN, install: true },
  },
  {
    kind: 'handson', min: 4, title: 'Hands-on 2: make practice data', n: 2, img: 'sheet',
    prompt: { label: 'Hands-on 2: practice data', text: P.practice, expect: 'A table of 10 made-up orders.' },
    do: 'Run it. While it generates, read the safety rule.',
    say: ['Practice data means made-up numbers, safe to play with', 'Never test on real company data', 'Claude hid 3 mistakes. Do not peek'],
    clip: 'Never test AI on real company data. Practice data fails safely and costs you nothing.',
    follow: { step: 'Hands-on 2 of 5', icon: '🧪', heading: 'Make practice data', body: 'Claude makes a small table of made-up orders with 3 hidden mistakes. Made-up data is safe to practice on.', bullets: RUN },
  },
  {
    kind: 'poll', min: 1, title: 'Prediction: how many can you spot?',
    poll: { key: 's3-spot', kind: 'prediction', q: 'Look at your practice table. How many of the 3 hidden mistakes can you spot in 60 seconds?', options: ['None yet', '1', '2', 'All 3'] },
    do: 'Give them 60 seconds of quiet to look. Lock, Reveal. Then: this is why we write the check down.',
    say: ['Finding mistakes by eye is slow and easy to miss', 'Now imagine doing this every morning'],
    follow: { icon: '🔍', heading: 'Find the mistakes by eye', body: 'Look at your table for 60 seconds. How many of the 3 hidden mistakes can you find? Vote below.' },
  },
  {
    kind: 'handson', min: 5, title: 'Hands-on 3: teach Claude the check', n: 3, img: 'checklist',
    prompt: { label: 'Hands-on 3: the morning check', text: P.check, expect: 'PASS or FAIL for each check, then GO or STOP.' },
    do: 'Run it. Read the 4 checks out loud. Celebrate the STOP.',
    say: ['This is her checklist, written down', 'PASS or FAIL for each check, then one answer: GO or STOP', 'STOP is a good answer. It means the mistake never reached the boss'],
    clip: 'A message that says SUCCESS only proves the job ran. It never proved the numbers were right.',
    follow: { step: 'Hands-on 3 of 5', icon: '✅', heading: 'Teach Claude the morning check', body: 'You give Claude the 4 checks the analyst does by hand. Claude answers PASS or FAIL for each, then GO or STOP.', bullets: RUN },
  },
  {
    kind: 'statement', min: 1, title: 'You just wrote down a check',
    do: 'Short. Let the statement breathe.',
    say: ['That check used to live in one person\'s head', 'Now anyone can run it'],
    clip: 'In a few minutes we taught AI a check that catches the mistakes a SUCCESS message never would.',
    follow: { icon: '🎉', heading: 'You just wrote down a check', body: 'The analyst\'s checklist is no longer stuck in her head. Next, we save it so Claude can use it every time.' },
  },
  {
    kind: 'handson', min: 5, title: 'Hands-on 4: turn it into a skill', n: 4, img: 'card',
    prompt: { label: 'Hands-on 4: make it a skill', text: P.skill, expect: 'A short SKILL.md with name, description, steps, result, never.' },
    do: 'Run it. Walk through Claude\'s answer line by line, matching it to the recipe card.',
    say: ['This is the recipe card, written as a file', 'The description is the WHEN line', 'Write it in the words a coworker would actually use'],
    follow: { step: 'Hands-on 4 of 5', icon: '🗂️', heading: 'Turn the check into a skill', body: 'Claude writes the recipe card as a file called SKILL.md: name, when to use it, steps, result, never.', bullets: RUN },
  },
  {
    kind: 'mistake', min: 3, title: 'The number one mistake',
    do: 'Point at the red card, then the green one.',
    say: ['Claude picks a skill by reading the WHEN line', 'Vague words never match a real question', 'One clear sentence is the difference between a skill that runs and one nobody can find'],
    clip: 'The biggest mistake is a vague description. Helps with data never runs, not once.',
    follow: { icon: '⚠️', heading: 'The number one mistake: a vague WHEN line', body: 'Claude only uses a skill when the question matches its WHEN line. Helps with data matches nothing. Be specific.' },
  },
  {
    kind: 'poll', min: 2, title: 'Trivia: which one will Claude pick?',
    poll: { key: 's3-desc', kind: 'trivia', q: "A coworker asks Claude: 'Is this orders file safe to share?' Which skill will Claude pick?", options: ['Helps with data.', 'Checks an orders file for mistakes before anyone shares it, and answers GO or STOP.', 'Useful tool.', 'Run this sometimes.'], answer: 1, reveal: 'B. Claude picks a skill by its WHEN line. Only B matches the question, so only B ever runs.' },
    do: 'Lock, Reveal, read the reveal line.',
    say: ['Only one of these matches the question', 'That is why the WHEN line matters most'],
    follow: { icon: '🧠', heading: 'Trivia: which skill will Claude pick?', body: 'Read the question on screen and vote below.' },
  },
  {
    kind: 'fet', min: 2, title: 'Find it. Explain it. Tell people.',
    do: 'Point at each of the 3 steps.',
    say: ['Every problem needs three things', 'The check found it. Now someone has to tell the boss', 'A second skill can write that update for you'],
    clip: 'Every problem needs three things: find it, explain it, and tell the right people. A skill can do each one for you.',
    follow: { icon: '🧭', heading: 'Find it. Explain it. Tell people.', body: 'The check found the problem. Next, Claude writes the update your manager needs, in plain words.' },
  },
  {
    kind: 'handson', min: 3, title: 'Hands-on 5: the update for your manager', n: 5, img: 'update',
    prompt: { label: 'Hands-on 5: the manager update', text: P.update, expect: '5 short lines a manager can act on.' },
    do: 'Run it. Read Claude\'s 5 lines out loud as if you were the manager.',
    say: ['Same result, now in words a manager can act on', 'Status, what happened, why it matters, who fixes it, next update'],
    follow: { step: 'Hands-on 5 of 5', icon: '📨', heading: 'Write the update for your manager', body: 'Claude turns the check result into 5 short lines your manager can act on. No technical words.', bullets: RUN },
  },
  {
    kind: 'hotseat', min: 7, title: 'Your turn: a check only you know',
    prompt: { label: 'Your own skill card', text: P.yours, expect: '5 questions, then your own skill card.' },
    do: 'Ask for 2 volunteers. Fill the card live with each. Everyone else runs the prompt for their own task.',
    say: ['What is one check that would stop if you were out tomorrow?', 'No real company data, only the shape of the task', 'Everyone: run this prompt and answer Claude\'s 5 questions'],
    clip: 'Think of one check that would stop running if you were out tomorrow. That is your first skill.',
    follow: { step: 'Bonus', icon: '🙋', heading: 'Make a skill card for YOUR task', body: 'Claude asks you 5 questions about a task you repeat at work, then writes your own skill card.', bullets: ['Tap Copy or Open in Claude', 'Answer Claude\'s questions one at a time', 'Want to share yours? Type it in the box below'] },
  },
  {
    kind: 'save', min: 2, title: 'Where your skill lives',
    do: 'Quick. Keep it simple.',
    say: ['You can keep this card and reuse it any time', 'Ask Claude how to add it to your account', 'In the program, Week 2 is building 3 skills like this one'],
    follow: { icon: '💾', heading: 'Keep your skill', bullets: ['Copy your skill card somewhere safe', "Ask Claude: 'How do I add this skill to my Claude account?'", 'Next time, just ask in plain words, and Claude uses it'] },
  },
  {
    kind: 'poll', min: 1, title: 'Poll: where are you now?',
    poll: { key: 's3-where', kind: 'poll', q: 'After tonight, where are you?', options: ['I watched', 'I followed along', 'I made my own skill card', 'I could teach this to a coworker'] },
    do: 'Lock, Reveal. Celebrate every answer.',
    say: ['Every answer here is a win for a first class'],
    follow: { icon: '🗳️', heading: 'Quick check-in', body: 'Where are you after tonight? Vote below.' },
  },
  {
    kind: 'recap', min: 2, title: 'Three things to remember',
    do: 'Count them on your fingers.',
    say: ['A skill is a recipe card for Claude', 'The WHEN line decides if it ever runs', 'Find it, explain it, tell people'],
    clip: 'Within a year, your team\'s best checks will live in skills, not in one person\'s memory.',
    follow: { icon: '📌', heading: 'Three things to remember', bullets: ['A skill is a recipe card for Claude', 'The WHEN line decides if it ever runs', 'Find it, explain it, tell people'] },
  },
  {
    kind: 'next', min: 2, title: 'Next Monday + questions',
    do: 'Tease next week, then open Q and A. Read questions from the screen.',
    say: ['Next Monday, 6:30 PM Central', 'It is 2 AM and nobody is at the keyboard. Does anything happen at all?', 'Questions: type them on your phone or computer'],
    follow: { icon: '📅', heading: 'See you next Monday, 6:30 PM Central', body: 'Next week: an AI assistant that keeps working while you sleep. Have a question now? Type it below.' },
  },
];

module.exports.PROMPTS = P;
