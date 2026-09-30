# Directive — Run the Open House Live Experience

**Status:** active · **Owner:** Ali · **System:** AI Systems Architect Accelerator Open House · **Established:** 2026-07-17 (first run 2026-07-16)

## 1. Purpose
Run a fully interactive Open House: one presentation the host drives from a single URL that, as the host advances slides, automatically launches live audience polls/trivia on attendees' phones, shows animated results on the shared screen, draws the raffle, and flips phones to a $50 founding-seat claim — plus a live "build a business from an audience idea" demo. Delivers a high-conversion, high-energy event with zero mid-show tab-juggling by the host.

## 2. Inputs
- **Live service:** `/opt/openhouse-live` on the prod VPS (`root@95.216.199.47`) — systemd unit `openhouse-live`, port 8090, proxied at `https://enterprise.colaberry.ai/openhouse/` (nginx route already in `nginx/nginx.conf`, PR #267). Zero-dependency Node 20; state persists to `data/state.json`; questions in `questions.json`.
- **Admin key:** `ADMIN_KEY` in `/opt/openhouse-live/.env` — gates all `/api/admin/*` control endpoints and the projector `/screen` view. **Secret — never commit it.** Retrieve with:
  `ssh root@95.216.199.47 "grep ADMIN_KEY /opt/openhouse-live/.env"`.
- **Hosted presentation:** `https://enterprise.colaberry.ai/openhouse-deck.html` — the 31-slide deck. Opened with `?key=<ADMIN_KEY>`; the key is stripped from the address bar on load, then held in sessionStorage (safe to screen-share). Master copy: `Downloads/Open-House-Deck-2026-07-16.html` on the host machine.
- **Hosted support assets (served by the nginx container, ephemeral — see §6):** `openhouse-interview.html` (Foundry live-build interview), `evergreen-grounds-co/` (backup demo company), `open-house-screenshots/` (all deck imagery incl. `deck-img/` logos + Ram photo + QR-backed slides).
- **Live-build kit:** `Downloads/foundry/` on the host machine (Claude Code reads `BusinessGenerator.md`).

## 3. Steps (run-of-show, in order)

**T-1 day — prep (do NOT skip §3.1–3.3):**

1. **Reset the room state** (wipes last event's attendees, votes, raffle draws, and seat claims; keeps the questions). Requires the confirm token:
   `curl -s -X POST "https://enterprise.colaberry.ai/openhouse/api/admin/reset?key=$K" -H "Content-Type: application/json" -d '{"confirm":"RESET"}'`
   Success signal: response `phase:"welcome"`, `joined:0`, `raffle.draws:[]`, `claims:[]`.
2. **Verify hosting survived** (the deck + assets are `docker cp`'d into the nginx container and are LOST if that container was recreated since the last event — §6). For each of `openhouse-deck.html`, `openhouse-interview.html`, `open-house-screenshots/deck-img/colaberry-horizontal.png`, `evergreen-grounds-co/CommandCenter/index.html`:
   `curl -s -o /dev/null -w "%{http_code}\n" "https://enterprise.colaberry.ai/<path>"` → expect **200**. If any 404, re-publish (§6).
3. **Update the date-bound content** if this is a new cohort: the deck hardcodes the prior event's dates, prices, and raffle prizes. Edit `Downloads/Open-House-Deck-2026-07-16.html`, re-publish (§6). Update `questions.json` on the host + `systemctl restart openhouse-live` if changing polls (§7 catalog).

**T-15 min — set up the room:**

4. Open the deck: `https://enterprise.colaberry.ai/openhouse-deck.html?key=<ADMIN_KEY>` → **F11** full screen. Confirm the key vanished from the address bar before screen-sharing.
5. Open Claude Code in `Downloads/foundry/` for the live build.
6. Test-scan the join QR (slide 2) from the back of the room; confirm the attendee page loads and the projector's "N in the room" counter increments.

**Live — present:**

7. Advance with **→ / click**. The deck auto-drives the service by slide type (no extra clicks):
   - **Connect slide** (`data-oh="lobby"`) → room to lobby; QR + live room counter shown.
   - **Poll/trivia slides** (`data-poll="qN"`) → launches that question on all phones; live bars + vote ring fill the screen. Trivia slides have a **Reveal answer** button. Leaving the slide closes voting.
   - **Live-build slide** → "Launch the interview" opens the hosted interview; fill it with the room, click **Copy build prompt**, paste into Claude Code, Enter; return to the deck. The built company opens on its own at the reveal slide (backup button loads Evergreen if the live build stalls).
   - **Raffle slide** → press the **Draw** button 5× (3 books, then 2 free months); each masked winner flashes on screen and stacks in the host's winner list.
   - **Claim slide** (`data-oh="claim"`) → every connected phone flips to the $50 seat-claim flow.
8. **N** toggles speaker notes; **P** prints a PDF backup.

## 4. Outputs
- Live audience votes/trivia tallies, raffle winners (masked email + attendee #), and seat claims — all in `data/state.json` on the host.
- Attendee CSV: `GET /openhouse/api/admin/export.csv?key=<ADMIN_KEY>` (emails for follow-up).
- A generated demo company under `Downloads/foundry/<company-slug>/` from the live build.

## 5. Verification
- Pre-event reset: state JSON shows `joined:0` and empty `draws`/`claims`.
- Hosting: all four asset URLs return HTTP 200.
- Mid-show, per poll: `GET /openhouse/api/admin/state?key=<ADMIN_KEY>` shows `phase:"question"`, the expected `activeQid`, `questionOpen:true`, and rising `counts`.
- Post-event: `export.csv` returns the attendee list; `raffle.draws` has the 5 winners.

## 6. Edge cases / failure modes
- **Deck/assets 404 (nginx container was rebuilt):** static files live only inside the running `accelerator-nginx` container, not in a mounted volume. Re-publish from the host machine:
  `docker cp <file> accelerator-nginx:/usr/share/nginx/html/<name>` (deck, `openhouse-interview.html`, `open-house-screenshots/`, `evergreen-grounds-co/`). Then re-verify 200 (§3.2). A durable fix (bake into the nginx image or a mounted volume) is a future improvement.
- **Live build stalls on stage:** use the **Backup demo** button on the reveal slide (Evergreen Grounds Co.).
- **Attendee's PaySimple seat-claim link errors:** the app degrades to a "see the front desk" capture — no lost lead. Front desk finishes the claim.
- **Host prompted for the admin key:** it was not in the URL; paste the `ADMIN_KEY` from `/opt/openhouse-live/.env`.
- **Poll won't launch / phones not updating:** confirm `systemctl status openhouse-live` is active and `GET /openhouse/healthz` returns `{ok:true}`.

## 7. Safety constraints
- **Admin key is a secret.** It lives only in `/opt/openhouse-live/.env`. Never commit it, never put it in a slide, never screen-share a URL that still shows `?key=`.
- **`reset` is destructive and idempotent-guarded:** it requires `{"confirm":"RESET"}` and wipes attendees/votes/draws/claims (not questions). Only run it *before* an event, never during.
- **Seat claims create real PaySimple charges** ($50 deposit, live env). Only enter the claim phase when you intend attendees to pay.
- **Publishing is a hot patch:** `docker cp` into the running container takes effect immediately and does not survive a container rebuild; it ships already-built static files, so it is not gated by the PROGRESS.md rule for repo code.

## Question catalog (`/opt/openhouse-live/questions.json`)
`q1–q5` audience-profile (built Open House night); `q6` jobs-2030 opinion, `q7` Colaberry-since-2012 trivia, `q8` 95%-of-AI-projects-fail trivia, `q9` what-would-you-build opinion (added 2026-07-17 for the deck's 4 poll slides). Restart the service after any edit.
