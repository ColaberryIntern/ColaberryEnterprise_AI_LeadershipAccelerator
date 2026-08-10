# The 12-Week Story Arc — AI Systems Architect Accelerator

**Purpose.** Twelve weeks of classes should read as *one story with twelve chapters*, not twelve
disconnected lessons. This document is the connective tissue: the spine every week's narrative
hangs from, the recurring devices that pay off across months, and the promise each intensive makes
and keeps. Anyone authoring a class deck writes against this file.

**Audience reminder.** Enterprise professionals, 35–60, most of whom have never written production
code. They are not here for computer science. They are here because the nature of their work is
changing and they intend to be on the right side of it.

---

## The spine, in one sentence

> **You arrive able to ask an AI for help, and you leave accountable for a system that works
> while you sleep.**

Everything else is detail. Every week moves the student one step along that line, and the line has
a specific shape: *capability* comes first, then *reach*, then *scale*, then *accountability*.
Accountability is last on purpose — you cannot be responsible for something you cannot yet build.

---

## The four acts

| Act | Weeks | Intensive | The question this act answers | The student's state at the end |
|---|---|---|---|---|
| **I — Hands** | 1–3 | Build Your AI Foundation | *Can I direct this thing?* | Something they built runs without them present |
| **II — Reach** | 4–6 | Create Your AI Team | *Can it touch my real world?* | Their judgment is reusable; their AI reaches real systems |
| **III — Scale** | 7–9 | Connect AI To The Real World | *Does it hold up?* | One assistant became many, and it survives failure |
| **IV — Accountability** | 10–12 | Design AI That Scales | *Who answers for it?* | It acts under policy, and they can defend it to a panel |

### Act I — Hands (Weeks 1–3)
The student crosses from *user* to *builder*. Week 1 they stop typing code and start directing an
engineer. Week 2 they discover that teaching it once beats teaching it every time. Week 3 the thing
they built runs when they are not in the room — and, for the first time, costs money per run.
**Act I ends the moment something of theirs runs unattended.**

### Act II — Reach (Weeks 4–6)
Capability alone is a personal skill; the company needs it to be transferable and connected. Week 4
turns their private judgment into a tested, versioned asset a team can use. Weeks 5–6 give the AI
hands into real systems via MCP — first that it works, then that it survives production.
**Act II ends when their AI touches a system the business actually depends on.**

### Act III — Scale (Weeks 7–9)
One assistant hits a ceiling. Week 7 turns it into a coordinated team. Week 8 makes the work run
itself. Week 9 is the reckoning: they break it on purpose and learn that a system which has never
failed is simply a system nobody has tested.
**Act III ends when the system survives contact with reality.**

### Act IV — Accountability (Weeks 10–12)
Now that it can act, the hard question arrives. Week 10 gives it a conscience — policy, human
approval, an audit trail. Week 11 makes it explicable, because an architect who cannot explain a
system does not yet own it. Week 12 they defend it in front of people.
**Act IV ends with them standing behind their own system in public.**

---

## Recurring devices — use these; they are the payoff mechanism

These are the threads that make week 9 feel like it *earned* something set up in week 2. Every week
should touch at least one, and intensive-boundary weeks (3, 6, 9, 12) should deliberately call back.

### 1. The 2 AM question
Introduced Week 3: *"A chat window cannot run your business at 2 AM."* It returns each act, harder:

| Week | The 2 AM question becomes |
|---|---|
| 3 | It's 2 AM and nobody is at the keyboard. Does anything happen at all? |
| 6 | It's 2 AM and the integration is down. Does it fail loudly or quietly? |
| 9 | It's 2 AM and it retried four hundred times. Who pays for that? |
| 10 | It's 2 AM and it did something nobody approved. Who answers for it? |
| 12 | It's 2 AM, it worked, and nobody noticed. That is the goal. |

### 2. The person who isn't there
Week 2 opens on an analyst who is out today, so a check nobody else knows how to run does not get
run. That person recurs — the knowledge that lives in one head is the enemy of every week:

- W4 — the teammate who wrote the one prompt that worked, and left
- W6 — the one engineer who understands the integration
- W8 — the reviewer who is on vacation, so the PR sits
- W10 — the approver nobody can find at 2 AM, which is why policy exists

### 3. The trust ladder
Autonomy is *earned across the twelve weeks*, and the student should feel it widening:

| Weeks | How much the system is trusted with |
|---|---|
| 1–2 | You approve every single action |
| 3–4 | It runs a bounded task unattended |
| 5–6 | It reaches real systems, read-mostly |
| 7–8 | It coordinates other agents and runs on a schedule |
| 9 | It handles its own failures |
| 10–12 | It acts under policy, with a human gate for high risk, fully audited |

Name where they are on this ladder at least once per act. The Week 10 governance lesson only lands
emotionally if they remember how tightly they held the reins in Week 1.

### 4. The dragon (from Orientation)
Orientation promises: *every builder starts as an apprentice, and you face the dragon in Week 12 —
a real system, live, defended.* Call back at each act boundary (3, 6, 9) so Week 12 is a promise
kept, not a surprise. The apprentice metaphor should mature: apprentice (I) → journeyman with a
crew (II–III) → the one who signs the drawings (IV).

### 5. Their own project, every single week
Nothing is a toy. From Week 3 the student has a generated build plan; every week after that must
connect to *their* plan, not a demo. When a week's exercise is generic, the class should end by
pointing it back at their own capstone.

---

## Per-week beat — the one line each week contributes to the story

| Wk | Title | The arc beat (one line) |
|---|---|---|
| 1 | Claude Code Foundations + Workspace | You stop typing code and start directing an engineer. |
| 2 | Agent Skills | You teach it once, and it never forgets — knowledge stops living in one head. |
| 3 | Claude API + Workflow Assistant | It runs without you in the room — and starts costing money per run. |
| 4 | Prompt Engineering + Prompt Library | Your private judgment becomes a tested asset your whole team can use. |
| 5 | MCP Foundations | Your AI gets hands — it can finally reach the systems your business runs on. |
| 6 | Advanced MCP + Integration | The integration stops being a demo and starts being something on-call. |
| 7 | Subagents + Multi-Agent Team | One assistant becomes a team — and you learn when NOT to delegate. |
| 8 | Workflows + Automation | The work runs itself; you stop being the trigger. |
| 9 | Reliability Engineering | You break it on purpose, because a system that never failed is untested. |
| 10 | Governance Engine | You give it a conscience: policy, a human gate, and an audit trail. |
| 11 | Systems Architecture | You can explain and defend the whole thing — that is what makes you the architect. |
| 12 | Capstone + Expo | You stand behind it in public. The dragon, as promised. |

---

## Authoring rules (non-negotiable)

1. **Every teach slide carries a mermaid diagram.** ≤7 nodes, short labels — it gets click-zoomed
   to full screen and read from the back of a room and on the class recording.
2. **Code blocks are Claude Code prompts, not code to type.** The program's whole thesis is that
   you direct and review. Use `kind: 'review'` for code shown to be *read* together, and set
   `pasteWhere` explicitly for anything that belongs in a terminal.
3. **Story beats are stories**, not summaries — a concrete person, a specific moment, a stake.
   3–5 per day, placed at pace changes.
4. **6–10 participation questions per class.** Mix: operational roll-calls ("is everyone set up?"),
   diagnostics ("your tool didn't fire — what do you check first?"), judgment polls with a defensible
   answer, and honest self-checks with no right answer.
5. **Never invent facts.** Model IDs, pricing, and API shapes must be current; if a number could be
   stale, tell the instructor to open the live page in class instead of trusting the slide.
6. **Connect to the student's own build plan** at least once per class.
7. **End every class pointing at the next one** — the open loop is what brings them back Thursday.
