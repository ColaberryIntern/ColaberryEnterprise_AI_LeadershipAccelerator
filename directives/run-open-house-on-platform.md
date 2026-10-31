# Directive — Run an Open House on the Platform

**Status:** active · **Owner:** Ali · **System:** Accelerator Class Kit (live sessions) · **Established:** 2026-10-31 (first run 2026-10-29) · **Cadence:** every 2 weeks, moving to weekly

Supersedes `run-open-house-live-experience.md` (the July 2026 standalone `openhouse-live` service with an admin key). Everything below runs inside the main platform: no separate service, no admin key.

## 1. Purpose
Run a 60-minute, interactive Open House that converts attendees into annual members. The host presents one deck from the admin Accelerator page. Attendees join from their phones with name and email only, with no login link. Polls fill live on screen, and the platform draws and records the giveaway winners. Afterwards, admissions (Taiwo) gets a participant packet, and scholarship winners get an annual-only account credit.

## 2. Inputs
- **Session row:** a `live_sessions` row in the cohort the Open House feeds, with a title containing **"Open House"**. The title is what turns on the Open House behavior: the `openhouse` day kind, guest join, and draws.
- **Deck sources:** `backend/src/scripts/session-decks/openhouse-nov2026-deck/`:
  - `template.html`: 29 slides in the July visual format, with `data-poll` slides and the live script;
  - `build.js`: inlines the images and runs the lint;
  - `save.js`: attaches the deck to the session.
- **Deck images:** `C:/Users/ali_m/Downloads/open-house-screenshots/` on Ali's machine. `build.js` embeds them as data URIs, so the deck is one self-contained file.
- **Prod access:** `ssh root@95.216.199.47`, container `accelerator-backend`.
- **Email:** `/root/ali-signature/send.sh` on the VPS. It auto-BCCs Ali.

## 3. Steps

**T-1 day: create the session and load the deck**

1. **Create the session** in the target cohort from the admin Accelerator page. Use a title such as "Open House — The Forward Deployed Engineer", the date, and 18:30–19:30 CT.
   - Success signal: the session shows under the cohort, and ▶ Present renders the default Open House slides.
2. **Update the deck content.** Edit `template.html` for any date-bound content: dates, prizes, prices, news.
   - Every figure needs a dated source (Claim Registry rule).
   - Never use the word "free" (TWC §807.172(d)). Say "no card needed" instead.
3. **Build:** `node build.js C:/Users/ali_m/Downloads/open-house-screenshots <outDir>`.
   - Success signal: `BUILD OK slides=29 questions=11 minutes=60`.
   - Lint failures (a banned word, a missing question cadence, minutes ≠ 60) stop the build.
4. **Point `save.js` at the new session.** `SID` is currently hard-coded to the Oct 29 session `bc01abe2-d05c-4b63-89b8-09393f22c006`; change it to the new session's id. (Taking the id as an argument is an open follow-up.)
5. **Copy the files to prod and dry-run:**
   - `scp` `deck.html`, `guide.html` and `save.js` to `/tmp` on the VPS.
   - `docker cp` the deck and guide to the container's `/tmp`, and `save.js` to `/app/oh-save.js`.
   - Run `docker exec accelerator-backend node /app/oh-save.js /tmp/oh-deck.html /tmp/oh-guide.html --dry`.
   - Success signal: `BEFORE title="Open House…"` and `DRY: would save…`.
6. **Apply:** run the same command without `--dry`.
   - Success signal: `SAVED … verify=OK`.
   - Re-running with the same files is idempotent.
   - Rollback: `UPDATE live_sessions SET kit_config_json = kit_config_json - 'customDeck' WHERE id = '<sid>'`.
7. **Rehearse:** open ▶ Present → **Rehearse**. Polls are disabled and draws show "Draws run live only". Download the **Teaching guide** from the same menu.

**Live: present**

8. Open ▶ Present → **Present (live)**. The join QR points to `/api/portal/sessions/<sid>/join`. Attendees enter name and email and vote straight away.
9. Advance through the slides. Each poll slide launches that question on every phone, and the bars fill as votes land; guests and students are counted together.
10. **Giveaway slides:**
    - Attendees tap "I'm in".
    - The host clicks **Draw** once per prize: 3 books, then 3 scholarships.
    - The server picks uniformly at random from entrants who haven't already won that draw, and saves each winner with their full name and email.
    - A repeated click or a reloaded deck shows the stored winner and never draws again. A reopened deck reloads its winners from the server.

**T+1 day: close out**

11. **Pull the winners:** `GET /api/portal/sessions/<sid>/raffle-winners?full=1`, with an admin login. It returns the poll key, draw number, full name and email.
    - Guests are in `session_guests`, with `enrollment_id` set when the email matched an enrollment in the cohort.
    - Their votes are in `session_guest_poll_responses`.
12. **Grant the scholarships.** Write the winners file in this shape:
    `{"event":"OH<MMDD>","cohort":"<cohort name>","winners":[{"name":"…","email":"…"}]}`
    - Copy it and `backend/src/scripts/grantOpenHouseScholarships.js` into the container.
    - Run `node /app/grantOpenHouseScholarships.js <file>` for a dry run, then again with `--apply`.
    - Each winner gets an **$894 credit** (50% of the $1,788 year), usable **only on the annual plan**, and is placed in the cohort.
    - The credit is keyed on `<event>-SCHOLAR-<email>`, so a re-run never credits twice.
13. **Send the participant packet to Taiwo** (taiwo@colaberry.com) with send.sh, dry run first.
    - The packet is a spreadsheet with tabs: Summary, Participants (every answer), Poll Results, Raffle Winners.
    - The Oct 29 packet and its builder were one-off scratch files, not in the repo. Automating it from the tables in step 11 is an open follow-up.
    - The email lists the book winners (Taiwo collects mailing addresses), the scholarship winners, and how the credit works.

## 4. Outputs
- `live_sessions.kit_config_json.customDeck`: the deck and teaching guide for the session.
- `session_guests` and `session_guest_poll_responses`: who joined and what they answered.
- `session_raffle_winners`: one row per draw. It is unique on `(session_id, poll_key, draw_number)`, so nobody wins the same draw twice.
- `account_credits` rows with reason `open_house_scholarship_annual`, one per scholarship winner.
- An email to Taiwo with the packet attached, BCC Ali.

## 5. Verification
- Deck saved: `save.js` prints `verify=OK`, and ▶ Present renders 29 slides.
- Guest join: `GET /api/portal/sessions/<sid>/join` returns the phone page (200) for an Open House title. The voting endpoints refuse non-Open-House sessions.
- Draws: after the show, `raffle-winners` returns 6 rows: `oh-raffle-books` #1–3 and `oh-raffle-scholar` #1–3. Without a kit token or admin login it returns 401.
- Credits: on a winner's Subscription view, `credit_cents_by_plan.annual = 89400` and `monthly = 0`. A grant re-run ends `granted=0 already=<n>`.

## 6. Edge cases / failure modes
- **"No entrants left to draw":** nobody tapped "I'm in", or everyone who did has already won. Ask the room to tap in, then draw again.
- **Draw refused with 409:** the giveaway question isn't the one on screen. Go back to the giveaway slide and draw from there.
- **Draw attempted in Rehearse:** this is by design; draws only run in live Present.
- **Backend deploy during the show:** the container restarts in about 60–90 seconds. Draws already made are in the database and reappear when the deck reopens. Avoid deploying in the hour of an Open House.
- **Winners not recorded** (an event run on a deck saved before 2026-10-31, which kept winners in the browser): recover them from the Zoom cloud recording (support@colaberry.com), checking the transcript, screen frames and guest list. Insert them shaped like a guest draw. This was done for Oct 29.
- **The deck shows the default class slides instead of the custom deck:** the title doesn't contain "Open House", or `customDeck` is null. Fix the title, or re-run step 6.
- **Attendees counted "absent":** the platform auto-creates absent attendance rows for the cohort's enrollments. Guests are tracked separately in `session_guests`, not in attendance.

## 7. Safety constraints
- **Guest pass = voting only.** It is scoped to one session and gives no portal access. This was requested by Ali on 2026-10-29: "we will just take their word for it and try to match the emails with the enrollments."
- **Production writes:** `save.js`, the scholarship grant and any backfill write to prod. Always dry-run first, and confirm the session id and title in the BEFORE line.
- **Credits are real money off a real charge.** Only grant to winners recorded in `session_raffle_winners`.
- **Email:** only through send.sh (dry run first), never through Gmail MCP. The body must not end with a sign-off, because send.sh adds the signature.
- **Never use the word "free"** in the deck or any follow-up (TWC). The build lint enforces this for the deck.
