# brief-me - calibration examples

Eight scenarios. Each shows the failure mode first, then the correct output. Read this
when unsure how hard to compress or whether something is a real decision.

The PR base for this repo is
`https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/`.

---

## A. Routine progress, nothing needed

Claude built three parts of a feature. It works. Nothing requires Ali.

🚫 **Wrong:** inventing a question because two file layouts were both viable.
🚫 **Wrong:** listing all 17 touched files.

✅ **Right:**

```markdown
# 🧭 THIS TAB

**Working on:** Per-tenant campaign sending
**Stage:** BUILD
**Branch:** `workstream/tenant-campaign-domains`
**Last meaningful thing that happened:** Campaign sends now read the tenant's own sender config instead of the shared one.
**Next:** Wire the same tenant lookup into bounce handling.

## 🟢 Bottom Line
Three of the four pieces are working. No surprises so far.

## ✅ What Happened
- Campaign sending now uses each tenant's own sender identity.
- Existing lead tracking left untouched, so nothing regressed.
- Unit tests pass.

## 🎯 What I Need From You
**Nothing right now. Claude can continue.**
```

---

## B. PR waiting for approval

🚫 **Wrong:** "PR #427 is ready for your review."

✅ **Right:**

```markdown
## 🔗 Pull Request

**PR #427 - Add tenant campaign domain routing**

https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/427

**Status:** Checks green, waiting on your approval.
**Why it matters:** This is the last gate before the change can reach production.

## 🎯 What I Need From You
Approve PR #427 (link above). Nothing else is blocked on you.
```

Bare `#427` with no link is a defect in this skill, per Ali's standing rule.

---

## C. Genuine architecture decision

Two strategically different designs. This one really is Ali's call.

```markdown
## ❓ Decision Needed

### Q1. Should every tenant be forced to set up its own sending domain when the tenant is created?

**A. Required at creation**
Cleanest deliverability, but no tenant can be created until DNS is verified.

**B. Optional, added later**
Tenants start immediately on the shared domain and upgrade when ready.

**C. Other**
Write your own answer.

⭐ **Claude recommends: B** - it unblocks tenant creation today and keeps the domain work as a separate, reversible step.

**Reply:** `Q1: B`
```

Contrast: choosing a helper name, a folder, or a test layout is **not** a decision. That
is Claude's, per CLAUDE.md's Autonomy Model.

---

## D. Tests failing

20 pass, 2 fail.

🚫 **Wrong:** "Testing completed." 🚫 **Wrong:** pasting the stack traces.

✅ **Right:**

```markdown
## 🟢 Bottom Line
The feature works for a single tenant, but **verification is currently failing** - two tests break when two tenants send at the same time.

## ⚠️ Risk
Two campaigns running simultaneously can pick up the wrong sender identity, so a tenant's email could go out under another tenant's domain. Not shippable as-is.

**Verified:** TypeScript, 20 of 22 tests
**Not verified:** concurrent sending
```

The word "completed" must never cover a red suite.

---

## E. Story mode

```markdown
# 🎬 STORY MODE

### Where we started
The goal was to let every tenant send campaigns from its own email domain instead of one shared Colaberry sender.

### What Claude discovered
The campaign engine already knew which account it was working for. The outbound email layer did not - it had one hardcoded sender for everyone.

### What changed
Claude passed the tenant's identity down into the sending path and left the existing lead tracking alone, so open and click history still works the way it did.

### Where we are now
Single-tenant sending works and the tests for it pass.

### The plot twist
Two tenants sending at the same moment can still collide and pick up the wrong sender. That is a real defect, not a rough edge, and it is the next thing to fix.

### What happens next
Lock the sender lookup per send job, then re-run the concurrency tests.

### 🎯 Your decision
You don't need to do anything right now. Claude can continue.
```

Note the plot twist section exists **because there was a real problem**. Omit it when
there isn't one. Never invent one for narrative shape.

---

## F. Five tabs open

The first four lines have to do all the work. Lead with the concrete thing this tab owns
("Per-tenant campaign sending"), never a generic label ("backend work", "the feature").
Branch name is part of the identity - always include it when tabs could be confused.

---

## G. Literal `git pull`

The local branch is behind `origin/main`. No approval is involved.

✅ **Right:**

```markdown
## 🎯 What I Need From You

**Claude needs the local branch updated from GitHub.** Your working copy is behind, so any build here would test stale code.

`git pull --rebase origin main`
```

No PR URL. Inventing one here is the failure mode this scenario guards against.

---

## H. Merged but not verified in production

```markdown
# ✅ DONE (code side)

**Built:** Per-tenant campaign sending.
**Verified:** TypeScript clean, 22 of 22 tests pass, PR checks green.
**Merged:** Yes - https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/427
**Deployed:** 🟡 Not verified - merging to `main` does not deploy by itself.
**Production verified:** 🔴 No. Nobody has sent a real campaign from a tenant domain yet.
**Anything you need to do:** Nothing, unless you want this deployed tonight.
**Where to test it:** Portal > Campaigns, after a deploy.
```

"Merged" and "live" are different words for a reason. Collapsing them into "done" is the
single most damaging thing this skill could do.
