# Composer: the first real run

**Who this is for:** Sohail or Aleem. **How long:** about ten minutes. **Where:** production, `https://enterprise.colaberry.ai`.

You do not need Ali for this, and you do not need to understand any of the machinery. Follow the eleven steps, and at each one there is a line saying what you should see. If you see something different, stop at that step and send the step number — a wrong thing at step 6 and a wrong thing at step 9 are completely different problems, and knowing which one it was saves an hour.

---

## Before you start: two things worth knowing

**Nothing you do here posts to a real social network.** No account is connected yet, so every network is in *handoff* mode: the platform writes the post and hands you the exact text to paste in yourself. You cannot accidentally publish to LinkedIn by doing this. That is a deliberate state, not a limitation you are working around.

**One thing here is permanent.** In step 3 you give a campaign a UTM slug. Once a link under that slug has been clicked, the slug can never change — every click already recorded is filed under it, and renaming it would orphan that history. So pick the campaign in step 2 deliberately. Everything else on this page is reversible.

---

## The steps

### 1. Open the composer

Go to **`https://enterprise.colaberry.ai/admin/marketing/composer`** and sign in if asked.

*You should see:* a four-step composer, starting on **1. Setup**.

### 2. Pick a brand and a campaign

Choose the brand, then a campaign from the dropdown.

**Pick a campaign that already has a brand attached.** 36 of the 44 campaigns do. If you pick one of the other 8, step 3 will tell you to give it a brand first — that is the system being careful, not broken.

If this is a first run and you would rather not touch a real campaign, make a new one called something like `Composer first run - Sept` and use that.

*You should see:* the campaign selected, and underneath it a yellow line saying it has no UTM slug. That is expected. **Every** campaign says that right now — nothing in the platform had ever written one until last week.

### 3. Give the campaign its UTM slug

Press **Assign UTM slug** next to that yellow warning.

*You should see:* the warning is replaced by a slug that looks like `colaberry-enterprise-awareness-<campaign name>-all-2026q3`. That is the name every click, every report and every link for this campaign will be filed under from now on.

*If instead you see* "Give the campaign a brand first" — you picked one of the 8 without a brand. Go back to step 2.

### 4. Write the post

Fill in:

- **Title** — internal only, nobody outside sees it.
- **Landing page** — where the link should send people. It has to be on one of our domains: `enterprise.colaberry.ai`, `colaberry.ai`, `training.colaberry.com` or `myfreeaiclass.com`. A link to somewhere else is refused on purpose, so a typo cannot send our audience to a stranger's site.
- **Canonical message** — the post itself, written once. The next step adapts it per network.

Press **Create draft**.

*You should see:* the composer move to **2. Channels**, with the draft saved.

### 5. Pick a network and generate the variant

Tick **LinkedIn Page** (one is enough for this run) and press **Generate variants**.

*You should see:* your message, adapted for that network, in an editable box. Edit it if you like — if you do, it gets marked *Edited by hand*, and generating again will leave your edit alone rather than overwriting it.

### 6. Generate the tracked link

Press **Generate tracked links**.

*You should see:* a short link like `https://enterprise.colaberry.ai/r/AB3D7K2M`, and under it the full destination with `utm_campaign=` set to the slug from step 3. **Copy the short link somewhere** — you need it in step 11.

*If instead you see* "Attach this item to a campaign that has a UTM slug" — step 3 did not take. Go back to it.

### 7. Try the link now, and expect it NOT to work

Open the short link in a new tab.

*You should see:* a page saying **Gone**. This is correct and it is the step people find most surprising, so it is worth being explicit: a tracked link does not go live until its post does. Until then its UTM set is not frozen and a click would be filed against something that had not happened yet. A dead link here is the system being honest, not broken.

Close that tab.

### 8. Validate

Press **Validate**.

*You should see:* a green pass, or a specific complaint with a number in it — for example that Instagram will not take a text-only post. If it complains, it is telling you a real platform rule, not guessing.

### 9. Send it for approval, then approve it

Press **Send for approval**. Then, as the reviewer, press **Approve**.

*You should see:* the item move to *approved*, and the publish button read **Create handoff packages** — not "Publish now". That wording is deliberate: nothing is connected, so the platform will not claim it can post for you.

### 10. Publish, and run the queue

Press **Publish now**, then go to **`/admin/marketing/publishing`** and press **Run queue now**.

*You should see:* one job move to *published*, and a **handoff package** appear: the exact text to paste, the link, and a box to paste the real post's URL back in once you have posted it by hand.

You do not have to actually post it to LinkedIn for this test. If you want to, paste the package's text into LinkedIn and put the resulting post URL into the box — that is the full loop.

### 11. Click the link, from your phone

Open the short link from step 6 **on your phone**, in a normal browser.

*You should see:* it lands on your step-4 landing page, with `utm_` parameters on the end of the URL.

Use a phone, not this desktop tab, and not a preview. The platform classifies bots and link previewers and deliberately does not count them, so a click from a link-preview tool proves nothing about whether real clicks are counted.

---

## When you are done

Send a note saying: **the campaign you used, the short link, and that step 11 landed correctly.** That is the whole thing — it closes the last open item on the marketing build's production verification, which has been waiting since Friday for exactly this.

If you stopped somewhere, send **the step number** and what you saw instead. That is far more useful than a description of the whole session.

---

## Things that are supposed to look odd

| You see | It means |
|---|---|
| Every campaign says "no UTM slug" | True until someone presses the button. Nothing wrote that field until last week. |
| The short link says **Gone** before publishing | Correct. Links go live with the post. |
| The button says **Create handoff packages**, not Publish | No network is connected. The platform will not pretend it can post. |
| Revenue, ROI, ROAS and CPL say *unavailable* | Also correct, and deliberate. Those numbers cannot be computed from what the system currently knows, and showing `0` would be a lie. There is an open decision with Ali behind it. |
| The Brands page says accounts cannot be connected | Depends on the day you read it; the credential store went live on Saturday. Connecting still needs a sign-in flow that is not built. |

---

*Written 2026-09-14 by session CC-20260909-m4kt. The technical record is in `.loop-architect/runs/20260909-marketing-ops-social-publishing/` — `handoff.md` for the full feature guide, `verification-log.md` for why this run exists.*
