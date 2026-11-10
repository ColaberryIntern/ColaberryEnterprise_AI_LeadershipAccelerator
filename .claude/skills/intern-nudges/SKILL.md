# intern-nudges - write the message that actually moves a builder

Turn the Internship Report into the small number of messages that need to go out today, and
send them. One message per intern who needs one, grounded in that intern's real state, with
a prompt attached when the ask needs one.

**Invoke on:** "what messages need to go out", "work the internship report", "nudge the
interns", "who needs a message today", or when the daily Internship Report arrives.

> Every rule below is a mistake that already happened. The two that cost the most were
> judging the report from a screenshot, and believing a date the report printed. Read
> "The five that cost something" before you write a single message.

---

## The five that cost something

### 1. NEVER judge the report from a screenshot. Read the whole thing.

On 2026-11-10 the report was assessed from a screenshot of its top and six fields were
declared missing. Every one of them was present further down the same email, below the
roster table. The screenshot showed the summary tiles and the roster; the substance was in
the per-intern sections after it.

The report is HTML only. The Gmail connector's `PLAIN_TEXT` returns a stub; `FULL_CONTENT`
pulls ~445KB of mostly base64 inline images, which is the session-killing payload.

**Do not read the email at all.** Generate the data directly, see "Get the data" below.

### 2. `due_on` LIES on gov projects. Use `due_baseline_on`.

Every gov project's `student_tasks.due_on` is back-dated to a cohort schedule from
September, in some cases a month *before the project was created*. `due_baseline_on` holds
the real date.

Measured on 2026-11-10: Omolola's Saratoga project was created 27 October. Her six
recording tasks read `due_on` = 20-27 September and `due_baseline_on` = **12 November**.
The report read `due_on` and printed "Late 50d". The truth was "due in 2 days", which is
the opposite instruction.

**Rule:** for anything gov, read `due_baseline_on`, and express it as **days remaining
until the case study package is due**, never as days late. The case study package is the
six PREP tasks: Project Introduction, Working-System Demo, AI Visual Presentation,
Stakeholder Update, Final Showcase, Present at Demo Day. They share one baseline date per
project, and that date **is** the case study deadline.

### 3. "No artifacts" in the report does not mean nothing exists. Go and look.

The report reads `projects.github_repo_url`, which is null for nearly every intern because
repo provisioning writes to `github_connections` instead, keyed on `enrollment_id`.

Omolola's report showed zero artifacts and no repo. In fact she had a repository, a **live
published GitHub Pages site with eight working screens**, two finished infographics, and a
full document set including a traceability matrix and a test report. None of it was visible
to the platform.

**Before telling anyone their project looks empty, check all four:**

```sql
SELECT github_repo_url, portfolio_url FROM projects WHERE id = :project;
SELECT repo_url FROM github_connections WHERE enrollment_id = :enrollment;
```
```bash
gh api repos/:owner/:repo/contents --jq '.[].name'     # is there an index.html, an app/ ?
gh api repos/:owner/:repo/pages --jq '{status,html_url}' # is it already published?
```

A live URL changes the message completely. "Record a demo of the system you built" is a
different instruction from "build a system to demo", and only one of them is achievable in
two days.

### 4. The report counts replies owed. It does not count PROMISES due.

On 2026-11-10 the report said 4 replies owed. There were also **five dated promises** made
the day before ("I will tell you the hour it is live", "by Tuesday", "this week with a date
attached"). Nothing tracks those, and a missed promise costs more trust than a slow reply.

**Rule:** before writing, read each intern's `last_ask.body_text` and extract every
commitment with a date in it. Each one is either kept in today's message, or explicitly
re-dated in today's message. Never silently let one lapse. If you cannot keep it and have no
answer, say that plainly and give a new date rather than omitting it.

### 5. One tier does not fit all. "Needs attention" flattens everyone.

The report put a productive builder quiet for 5 days in the same bucket as someone at day 50
with no project. They need completely different messages.

---

## Triage tiers

Assign exactly one. The tier decides the shape of the message.

| Tier | Test | The message is |
|---|---|---|
| `blocked_waiting_on_ali` | An unanswered inbound email from them | **An answer.** Not a nudge. Answer the actual question first, in the first paragraph |
| `no_project_at_day_N` | Day N with no project | **A conversation.** Either pick a project, or an honest answer about whether this is working |
| `never_started_building` | Has a project, zero commits and zero verified stories, ever | **An escalation.** Offer four honest outs and require a reply by a named day |
| `overdue_backlog` | Tasks past `due_baseline_on` | **An ordered plan** with dates, and an explicit "tell me now what you will not have" |
| `quiet` | No commit or verified story in N days, but history of work | **A specific next step**, naming the actual next story |
| `on_track` | Recent build work, nothing owed, no overdue | **An artifact ask.** Capability Map, Project One-Pager, Command Center |

A deadline inside two weeks overrides the tier: lead with days remaining.

---

## Get the data

Never parse the email. Generate the sidecar directly on production:

```bash
ssh root@95.216.199.47 "docker exec -w /app accelerator-backend \
  node dist/scripts/internshipPortfolioReport.js --dry --sidecar-out /tmp/sidecar.json"
```

`--dry` never sends and never writes a snapshot. Leave the store ON so model replies come
from cache and the text matches what Ali already read. Takes about 13 seconds.

Then read it with small node one-liners inside the container, redirecting to a local file.
**Never let the whole sidecar into a tool result** - it is ~326KB.

Fields that carry the message: `triage{tier,reason}`, `asking_you` (their verbatim
questions), `open_questions`, `last_ask{subject,body_text}`, `most_urgent` and
`most_urgent_overflow`, `asks[]` (generated artifact asks with full prompts), `nudge`,
`pacing`, `delta`, `artifacts` with `artifacts_real_count`.

Two known sidecar gaps: `open_questions[].text` is **truncated to a snippet** while
`last_ask.body_text` is full, so pull the full inbound from Gmail when you need to answer
it; and `status` serializes as an object, which prints as `[object Object]`.

---

## Writing the message

- **Lead with the thing that changes their day.** Not a greeting, not a status recap.
- **Answer before asking.** If they asked a question, the answer is the first paragraph.
  An ask bolted onto an unanswered question reads as not having been read.
- **Name real things.** The actual next story, the actual file, the actual URL, the actual
  commit date. Generic encouragement is worse than nothing.
- **Give an order, not a list.** When several things are outstanding, say what to do first
  and why, and say what you would cut.
- **Ask for a date.** Almost every message should end with a specific thing to reply with.
- **Say which part is ours.** When a platform defect wasted their time, lead with that.
  It is the single thing that most reliably restarts a stalled builder.
- **Never invent a decision you have not made.** If a promise is due and the answer is not
  ready, write that it is not ready and give a new date. Never a placeholder, never silence.

### Attachments

When the ask needs a prompt, attach it as a **`.md` file** and reference it by filename in
the body. Do not paste a long prompt into an email; it reads as a wall and cannot be opened
in Claude Code without reformatting.

Attachments must be staged inside the backend container before sending:

```bash
scp prompt.md root@95.216.199.47:/root/nudge-attach/
ssh root@95.216.199.47 "docker exec accelerator-backend mkdir -p /tmp/nudge-attach && \
  docker cp /root/nudge-attach/prompt.md accelerator-backend:/tmp/nudge-attach/prompt.md"
```

Then reference `{"filename":"prompt.md","path":"/tmp/nudge-attach/prompt.md"}`.

---

## Sending

**Only `send.sh`. Never the Gmail connector.** The connector is for reading.

```bash
scp payload.json root@95.216.199.47:/tmp/ && \
  ssh root@95.216.199.47 "/root/ali-signature/send.sh /tmp/payload.json"
```

Payload: `{to, cc?, bcc?, subject, body, inReplyToMsgId?, attachments?:[{filename,path}], dry?}`

`inReplyToMsgId` takes the **Gmail message id**; the script fetches the Message-ID and
References headers itself. The subject is used verbatim, so write `Re: ...` yourself.

The body is **plain text**. The sender escapes it and builds the HTML. Therefore:

- **Zero `<` or `>` characters.** They become entities and render as literal text.
- **No em dash or en dash.** The sender refuses the send.
- **Must not end with a sign-off or with the name.** The branded signature is appended, and
  a body ending in "Ali" double-signs. The sender refuses this too.
- **No "Managing Director" in the body.** It is in the signature.
- American spelling. Never the word "free" in anything advertising training (TWC 807.172(d));
  say "no card needed" or name the price.

**Always dry-run first**, and check the summary line for `threaded`, `html_signature` and
the attachment list:

```bash
sed '1s/^{/{ "dry": true,/' payload.json > /tmp/dry.json
ssh root@95.216.199.47 "/root/ali-signature/send.sh /tmp/dry.json"
```

Preflight the same guards locally before anything leaves the machine, so a bad body is
caught in a loop rather than by a rejected send. Ali is BCC'd automatically and that copy
stays in his inbox.

---

## Definition of done

- Every intern in the report was triaged, including gov-contract and no-project interns.
- Every dated promise in each `last_ask` is either kept or re-dated in today's message.
- Every gov message leads with days remaining to the case study, computed from
  `due_baseline_on`.
- No message claims something does not exist without the four existence checks in rule 3.
- Every message dry-ran clean, then sent, and the `250` line was recorded.
- Nothing contains a placeholder. A message that needs an answer Ali has not given is
  rewritten to say so honestly, not sent with a blank.
