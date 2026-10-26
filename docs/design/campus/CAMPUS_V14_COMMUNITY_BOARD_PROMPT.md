# Campus v14: Community Board 2.0 (sections, fresh vs earlier, ages, your notes, threads)

**For:** Claude Code in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
**Owner / DRI:** Ali Muwwakkil
**Written:** Monday 2026-10-26, Central

**Run order:** independent of the room fixes (C40-C46) and v13 (Today for explorers). One PR, on its own branch, `campus/v14-community-board`.

**Design source:** `docs/design/campus/colaberry-campus-v14.html`. Commit it with this file, plus `docs/design/campus/v14-screenshots/`.
- To see the board, open the HTML and click the Community Board on the Quad, or run `openBoard()` in the console.
- The notes, names and counts in the prototype are illustrative.

**Same rules as before:**
- No invented data.
- Tests first, plus a session log on the commit and a brief-me at the end of the reply.
- Times in Central.
- The campus stays on Ali's account only.

## What's wrong now (`components/campus/board/CommunityBoard.tsx`)

1. **Too much at once.** The board loads the latest 30 posts (`fetchPosts({ limit: 30 })`) and pins every one as an equal note in one 4-column grid. Nothing is grouped, ranked or retired, so it's a wall of paper.
2. **No time.** There's no age on a note, so you can't tell today's post from last month's.
3. **Only four tabs, and three don't fit.** Everything / Questions / Posts / Announcements. Almost every post is a weekly ritual (Roll Call, Hot Take, Cohort Wins…), so 90% of posts land in "Posts".
4. **Your posts disappear.** After posting, your note is one of 30 identical ones. There's no "mine" view, no sign of replies, and no idea where it went.
5. **Clicking leaves the campus.** Every note sends you away to `/portal/community`, even just to read or answer.
6. **Ritual data is hidden.** It already exists but isn't sent: `community_posts.ritual_meta.ritual` stores which weekly ritual a post answered (`services/runtime/communityRituals.ts`, 12 rituals), but `GET /api/portal/community/posts` doesn't return it. The board can only guess from the body text.

## B1. Backend: expose the ritual and serve the board in sections

**Expose the ritual.** Add `ritual: { key, name, icon, week } | null` to every post the community post serializer returns. Take it from `ritual_meta.ritual`, looked up in `communityRituals`.
- **Older posts without `ritual_meta`:** parse it at read time, never in a migration. A pure function `ritualFromBody(body)` matches a leading `‹Ritual Name› · Week ‹n›` and returns the ritual or null.
- **Tests:** unit tests for every one of the 12 names, plus "no match", plus a body that only mentions a ritual name mid-sentence (→ null).

**Add the board endpoint:** `GET /api/portal/community/board`, with `requireParticipant`, campus pilot only, cohort-scoped exactly like `/community/posts`.

Query:
- `lane` = `all | mine | ann | q | intro | wins | tips | ideas | general` (default `all`);
- `q` = search text (optional);
- `older_cursor` (optional).

Response:
```ts
{
  counts: Record<Lane, number>,        // visible posts per lane (cohort scope)
  open_questions: number,              // q lane, comment_count = 0
  new_since: { at: string | null, count: number, by_lane: Record<Lane, number> },
  my_new_replies: number,              // replies on my posts newer than my last look
  pinned: Post[],                      // lane all/ann: pinned posts (max 2 on "all")
  unanswered: Post[],                  // lane all: questions with no answers, newest first, max 3
  fresh: Post[],                       // created in the last 48 h, newest first (max 9 on "all", no cap in a lane)
  this_week: Post[],                   // 48 h to 7 days
  last_week: Post[],                   // 7 to 14 days
  older: { posts: Post[], next_cursor: string | null } // > 14 days, 20 per page, only when older_cursor is passed
}
```

**Lanes.** One pure, tested map: `laneOf(post)`. Pinned always goes to `ann`.

| Lane | Label | Rituals / rule |
|---|---|---|
| `ann` | 📣 Announcements | `pinned = true` |
| `q` | 🙋 Questions | category `Support`, or ritual `unblock_me` |
| `intro` | 👋 Introductions | `roll_call` |
| `wins` | 🏆 Wins & builds | `show_and_tell`, `cohort_wins`, `meet_my_team`, `never_again`, `architect_manifesto` |
| `tips` | 💡 Tips & prompts | `skill_drop`, `steal_this_prompt`, `teach_one_thing` |
| `ideas` | ⚖️ Ideas & stories | `hot_take`, `war_story` |
| `general` | 💬 General | everything else |
| `mine` | ⭐ Your notes | `member_id = me`, any lane |

**Rules for the response:**
- **"All" doesn't repeat posts.** On `all`, `fresh` leaves out anything already in `pinned` or `unanswered`.
- **"New since" is stored on the server, not in the browser,** so it works across devices. Store a `board_seen_at` per participant in the existing user-preferences store; if none fits, add one nullable column to the participant row (small and reversible). Add `POST /api/portal/community/board/seen`, which sets it to now and is idempotent.
- **Remove the old localStorage key** `cm-board-seen` (`boardModel.ts`). On the first load after release, migrate it: if the server has no value and the browser does, post it once.
- **Search:** plain parameterized `ILIKE` on body plus author display name. No new index unless the query is slow (log the timing).
- **Tests:** the lane map, buckets at the 48 h, 7 d and 14 d boundaries (Central has nothing to do with it; buckets use instants), no duplicates on `all`, `mine` scoping, auth (no session → 401, another cohort's posts never appear), cursor paging, and idempotent `seen`.

## B2. The board layout (`CommunityBoard.tsx`, split into small files)

The cork dialog gets wider, `min(1200px, 100%)` × `min(92vh, 980px)`. Only the middle column scrolls.

1. **Header:**
   - 📌 Community Board;
   - a status line: "**‹n› new** since you looked on ‹Sun 1:55 PM CDT› · ‹total› notes from everyone on campus";
   - a 🔍 search box (debounced 250 ms);
   - one red **＋ Add a note** button, which replaces the two old buttons.
2. **This week's ritual bar** (dark strip):
   - the viewer's cohort week ritual from `ritualForWeek(week)`, e.g. "This week · Week 1 · Roll Call · Introduce yourself…", plus "‹n› posted this week";
   - **Add yours** opens the composer on that ritual;
   - if the viewer has no cohort week (staff, business), hide the bar.
3. **Left column, Sections:**
   - **Everything** and **⭐ Your notes** first, then a "SECTIONS" label, then the seven lanes;
   - each lane has an icon tile, a count, and a red dot when it has posts new since your last look;
   - **Questions** shows "‹n› open" instead of a count when some are unanswered;
   - **Your notes** shows "‹n› new" when there are new replies on your posts;
   - **phones (≤900px):** the column becomes one horizontally scrolling row of chips.
4. **Everything view** (top to bottom):
   - **Pinned:** a full-width teal ribbon per pinned post, "Pinned by ‹name› · ‹age›" with Read →.
   - **🙋 Needs an answer:** up to 3 yellow question cards (chip, title, asker, age) with **Answer →**, plus "All questions →".
   - **📌 Fresh · last 48 hours:** cork notes in 3 columns, up to 9. Each note has:
     - a coloured band and pin in its lane colour, and a small tilt (±1°, stable per id);
     - the ritual chip (icon + name);
     - a title (2 lines) and an excerpt (3 lines);
     - a footer with avatar, first name, age, the ritual's reaction count (e.g. 👏 12) and 💬 replies;
     - a red **NEW** ribbon when it's newer than your last look;
     - your own notes get a gold outline.
   - **Earlier this week / Last week:** compact list rows inside a paper panel. Each row has the icon tile, a one-line title, "Ritual · First name · age", and the counts.
   - **Show ‹n› older notes ↓:** loads `older` 20 at a time.
5. **A section view:** a one-line description of the section (the table above), then Fresh as cork notes (no cap), then the same Earlier / Last week / Older lists. Empty: "Nothing here yet."
6. **Your notes view:** one card per post you've written, newest first. Each card shows:
   - the chip, age and title;
   - the reactions count, and 💬 replies with **"· ‹n› new"** in red when there are unseen replies;
   - **where it is now:**
     - inside 48 h: "📍 On the cork in Fresh until ‹Tue 4:55 AM CDT›, then in ‹Lane›";
     - after that: "📍 In ‹Lane› · Earlier this week".
   - **Empty:** "You haven't posted yet. Everything you post shows up here, with replies and where it sits on the board."

**Title and excerpt rules** (pure, tested, `noteText(post)`):
- **Ritual posts:** the title is the first required guided field from `ritual_meta.values`, prefixed with its label where that reads well ("What I built: …", "I'm… …"). The excerpt is the remaining fields joined with " · ".
- **Other posts:** the title is the first sentence (≤ 90 characters, cut on a word with "…"). The excerpt is the rest.
- **Never show the "‹Ritual› · Week n" prefix in the text;** the chip already says it.

**Ages** (pure, tested, `ageLabel(iso, now)`):
- "just now", "‹m›m ago", "‹h›h ago", "Yesterday", "‹d›d ago" up to 6 days, then "Oct 12";
- the dates are Central;
- the full Central date and time goes in the `title` tooltip and the `<time datetime>`;
- refresh labels every 60 s while the board is open.

## B3. Read and reply without leaving the campus (thread drawer)

Clicking any note, row, question card or "your notes" card opens a **drawer on the right of the board**, about 440px wide, full height.

- **Header:** the lane-coloured top edge, the ritual chip, the full title, author avatar, name, rung and age, and ✕.
- **Body:** the full post (pre-wrap, links clickable), then:
  - the ritual's reaction button with its label and count, e.g. "👏 Cheer · 12", toggled with `togglePostLike` and showing `viewer_has_liked`;
  - **Open in the Community feed ↗**.
- **Replies:** "‹n› replies" (or "No replies yet", with "Be the first to answer" on a question), each with avatar, first name, age and text, loaded with `fetchComments`. Staff replies get the staff avatar style.
- **Reply box:** "Write an answer…" on questions, "Write a reply…" elsewhere, using `createComment`. On success, append the reply and bump the count. Rate-limit and length errors are shown as the server words them.
- **Keyboard:** Esc closes the drawer first, then the board. Focus moves into the drawer and returns to the note on close.
- **Your own posts:** opening one clears its "new replies" count; its last-seen is stored with the same server-side seen mechanism, per post.

## B4. Posting so it doesn't disappear

- **＋ Add a note** opens the composer at the top of the board. It has three type chips:
  - ❓ Ask a question → category `Support`;
  - 👋 This week: ‹ritual› → the ritual's guided fields, reusing the existing ritual composer fields from `communityRituals` (no free text for required fields);
  - 💬 Share something → `General`.
- **The composer's line says where it goes:** "It goes to the top of Fresh and into ‹Lane›. You'll get a notification when someone replies."
- **Keep the existing checks:** the feed's 15-word minimum is shown live ("‹n› words · posts need at least 15"), plus `createPost` errors and the in-flight guard.
- **After posting:**
  - the board switches to Everything and scrolls to the top;
  - your note appears first in Fresh with a gold outline and a 2-pulse glow;
  - a toast: "📌 Pinned to the top of Fresh and filed in ‹Lane›. You'll get a notification when someone replies."
- **Notifications:** check that replies on your post already create a community notification (`fetchNotifications`). If they don't, add one through the existing notification service, idempotent per (post, comment).

## B5. Map and side-panel badge

- **The board on the Quad** shows a red badge with `new_since.count + my_new_replies`, capped at "9+".
- **The side panel's "📌 Ask the community" chip** shows the same count.
- **Badge source:** a light `GET /api/portal/community/board?lane=all&counts_only=1` (counts only, no posts), polled with the existing presence cadence.

## Acceptance

- **Fidelity view `33-community-board`** (1440×900, 900×900, 390×844), with seeded posts across all lanes and ages:
  - the header, ritual bar, sections, pinned, Needs an answer, Fresh (≤ 9 notes) and the Earlier lists are all visible;
  - every note shows an age;
  - no text overflows;
  - the drawer is open on one note in a second shot.
- **E2E:**
  - post a question, see it first in Fresh and in Questions as "1 open", answer it from the drawer as a second user, and see "1 new" on Your notes for the first user;
  - search narrows the results;
  - Show older pages in.
- **Unit tests:** `laneOf`, `ritualFromBody`, `noteText`, `ageLabel`, the bucket boundaries and the seen migration.
- **No layout changes** to `/portal/community` itself.
- `tsc --noEmit` is clean and there are no console errors.

## Ask Ali before shipping

- Are the section names OK (Introductions, Wins & builds, Tips & prompts, Ideas & stories, General)? Should "Unblock Me" live under Questions as planned?
- Is the 48-hour window for "Fresh" right, or should it be 24 hours or 3 days?
- Should staff (Reese, Dara) get a "Staff answered ✓" mark on questions they answer?
