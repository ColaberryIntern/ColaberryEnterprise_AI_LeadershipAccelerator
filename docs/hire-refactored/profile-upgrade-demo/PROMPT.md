# Prompt: upgrade the hire.refactored.ai talent profile

> Paste everything below the line into Claude Code at the root of
> `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`. The `demo/` folder that
> ships with this prompt is the visual reference: open `demo/index.html`,
> `demo/schedule.html` and `demo/candidate.html` in a browser. Copy `demo/` into the repo at
> `docs/hire-refactored/profile-upgrade-demo/` first, so you can read it.

---

## Goal

Upgrade the public talent profile on **hire.refactored.ai** (`/talent/<slug>/`) and add two
new surfaces. The whole site keeps its current brand: the Refactored "Terminal" tokens in
`apps/hire-refactored-public/src/assets/tokens.css` (IBM Plex Mono for headings, IBM Plex
Sans for body, `--accent`, gold `--star` for proof). Light and dark both keep working through
the existing three-state theme model. The demo is shown in light.

1. **Profile (employer view).** Replace the stacked case-study grid with an auto-advancing
   **case-study carousel**. Add an **"In their words"** section (intro video and answers) and a
   **"Book an interview"** sidebar card. Keep About and Experience at the bottom, as they are
   today.
2. **Schedule an interview (employer view).** This is a new page at
   `/talent/<slug>/schedule/`. It is a 4-step in-app booking flow that replaces "Request
   intro" as the primary action.
3. **Candidate studio (learner view).** These are new sections inside the existing learner
   portal at `/portal/portfolio`. The candidate records or uploads an intro video, answers
   questions about themselves, sets the times they can interview, orders their carousel and
   answers interview requests.

Reference record: `kesetebirhan-delele` (9 published case studies). Per
`docs/hire-refactored/HANDOFF.md`, Kes is a Colaberry employee listed as a test profile and
is **not on the market**. Never send a real interview request to Kes. Use a seeded test
listing, or a dry-run flag, for end-to-end checks.

## Read first (do not skip)

- `CLAUDE.md` (root) and any `CLAUDE.md` under `apps/`, `backend/` and `frontend/`. Follow
  the operating contract, Central-time rule and `brief-me` reply format.
- `docs/hire-refactored/HANDOFF.md`, `directives/list-talent-on-hire-refactored.md`
- `apps/hire-refactored-public/src/assets/portfolio.js` and its two rules: Hire shows work
  **only** as approved, published case studies, and `years_experience` prints only when it
  reconciles with the listed roles.
- `portfolio.css`, `hire.css`, `motion.css` (the MOTION.md rules are in its header),
  `tokens.css`, `common.js` (`cover()`, `avatar()`, `mediaUrl()`, `esc()`),
  `talent/record/index.html`, `intro/index.html`, `intro.js`
- `apps/hire-refactored-public/__tests__/*.test.js` and `nginx/hire-refactored.conf`
- Backend: `backend/src/routes/publicHireTalentRoutes.ts`,
  `backend/src/routes/publicCareerPortfolioRoutes.ts` (`GET /api/public/portfolios/:slug`),
  `backend/src/services/hire/*` (`hireIntro.ts`, `hireListingSettings.ts`,
  `hireTalentProjection.ts`, `hireCaseStudyOnly.ts`, `hirePortfolio.ts`),
  `backend/src/controllers/hireListingController.ts`,
  `backend/src/routes/calendarRoutes.ts` (`/api/calendar/availability`, `/api/calendar/book`,
  for the existing booking patterns), `backend/src/schemas/careerPortfolioSchema.ts`
  (`readinessSchema`)
- Portal: `frontend/src/pages/portal/portfolio/` (`PortfolioPage.tsx`, `StudioOverview.tsx`,
  `HireAvailabilityPanel.tsx`, `PublishingPanel.tsx`), `frontend/src/services/hireListingApi.ts`,
  `frontend/src/routes/portalRoutes.tsx`

## Non-negotiables (carry these into every PR)

- **Case-study-only stays.** A project with no published Hire case study renders nothing:
  not in the carousel, not in the thumbnails, not in the "walk me through" picker.
- **No contact details on Hire.** No email or phone appears on a page, in a payload or in a
  booking confirmation. Bookings route through the platform, and the Colaberry team is
  copied, as `hireIntro` does today.
- **Profile shells stay `noindex` by default.** `portfolio.js` lifts it only for public
  portfolios. `/talent/<slug>/schedule/` is always `noindex, nofollow`.
- **No sideways scroll at 390px.** That includes the thumbnail strip: it **wraps** and never
  scrolls. The `nav .btn-star .lbl` phone rule in `hire.css` must keep working.
- **Every tap target is at least 44px** (`--tap`), and every input has a `<label>`.
- **Motion follows MOTION.md.** Animate only transform, opacity, box-shadow and filter.
  Hover and `:focus-visible` look the same. Under `prefers-reduced-motion` the carousel does
  **not** auto-advance, and every transition is off.
- **Times are Central in prose, and the viewer's local zone in the booking UI.** Store UTC.
- **Each piece collapses when its data is absent:** no metric means no `.fig`; no intro
  video means no video box; no answers means no "In their words" card; no open slots means
  the booking card falls back to today's "Request intro" link.
- **No new build step per record.** The shells read the live API, as they do now.

---

## Part 1: the profile (`apps/hire-refactored-public`)

### 1.1 Section order (top to bottom)

1. `.p-banner` and `.p-head`, unchanged except for the actions. The primary button becomes
   **Schedule interview**, with a calendar icon, linking to `/talent/<slug>/schedule/`. Next
   to it: ★ Shortlist and Copy link, the latter now icon-only (44×44, `aria-label="Copy
   profile link"`). The availability pill uses the existing `.avail` class.
2. `.p-ledger` stays as 4 tiles. **Do not show a tile whose value is 0.** If verified
   commits or capabilities are 0, swap in the next best real figure from the payload: the
   biggest `heroMetric` values, then a walkthrough count (case studies with
   `look.walkthroughSeconds`). Kes renders as 9 / 26,773 / 97% / 9.
3. **Carousel** (new, §1.2), replacing `signature()` and both `.projs` grids.
4. **Thumbnails** (new, §1.3)
5. **In their words** (new, §1.4)
6. About (existing `.about`)
7. Verified commits (existing, only when there are any)
8. Experience (existing `.xp`)

Sidebar, in order: **Book an interview** (new, §1.5), Proven in their repo (existing, only
when there are any), Industries shipped into, Contact (keep LinkedIn and GitHub links and
drop the "Request intro" button), and Back to all talent.

### 1.2 Carousel spec

- **Slide order:** the signature (`hire.signature`) first, then the order the candidate set
  in the studio (§3.5), falling back to the API order. Project-linked case studies and
  unlinked ones go in the **same** carousel. The kicker distinguishes them: `★ Signature
  case study` / `Project · published case study` / `Published case study`. Every published
  case study appears exactly once; reuse `unlinkedCaseStudies()` logic to guarantee this.
- **Frame:** a `.car` card with `border: 1px solid color-mix(in srgb, var(--star) 45%,
  transparent)` and an 18px radius.
  - **Top bar:** the kicker (mono, .74rem, .13em tracking, `--star-text`) on the left. On
    the right: a counter `01 / 09` (mono, `--fg-muted`, `aria-live="polite"`) and three
    44×44 `.btn-ghost` icon buttons: play/pause, previous and next.
  - **Progress line** under the top bar: 2px tall, `--line` track, `--star` fill, width = elapsed/6s.
- **Slide:** a two-column grid, `1.25fr 1fr`, stacking under 860px.
  - **Left:** the cover via `C.cover()` at **16:9, never cropped**, with a centred 64px play
    disc (`rgba(12,20,27,.72)`, white icon). The left column's empty space is `--bg-sunk`,
    and the image is vertically centred.
  - **Right**, top to bottom: the capability line (`.cap-line`), the title (mono, 1.35rem,
    line-height 1.28), the `.fig` metric when there is one, the summary (`--fg-muted`),
    the `.proof` chips, and the `.open-cue` "Open the case study →" link pinned to the
    bottom. The image and the cue both open `/case-studies/<slug>/` in a new tab with the
    existing `data-launch` attributes, so `launch.js` keeps working.
- **Behaviour:**
  - Advances every **6s**. Pauses on hover and while focus is inside the carousel, and stops
    while the tab is hidden.
  - The play/pause button toggles `aria-label` between "Pause carousel" and "Play carousel".
  - Left and right arrow keys move between slides when focus is inside.
  - A slide change resets the progress and plays `.car-slide.enter` (opacity plus 12px
    translateX, `--dur-fade`, `--ease-launch`).
  - Reduced motion: it starts paused and has no enter animation.
  - The section carries `aria-roledescription="carousel"` and `aria-label="Published case studies"`.
- **Code:** add `carousel(slides, talentSlug, api)` to `portfolio.js` as a **pure render
  function** (exported for node tests). Put the timer in a small new
  `src/assets/carousel.js` loaded with `defer` after `portfolio-page.js`. Styles go in
  `portfolio.css`, and the keyframes go in `motion.css`.

### 1.3 Thumbnails

- A row under the carousel: `display: flex; flex-wrap: wrap; gap: 10px`. Each thumbnail is a
  `<button>` with `flex: 1 1 76px; aspect-ratio: 16/9`, a 2px `--line` border, an 8px radius
  and opacity .6.
- The current one has `aria-current="true"`, a `--star` border and opacity 1. Hover and
  focus lift it 2px.
- **No `overflow-x` anywhere.** Nine fit on one line at desktop width and wrap on a phone.

### 1.4 In their words

- This is a `.card`. Its label reads "In their words", with a `.src` pill "written by the
  candidate".
- Grid `1fr 1.4fr`, stacking under 760px:
  - **Left:** the intro video, 16:9, in a `--bg-sunk` box. Use a poster frame with a 56px
    `--accent` play button and a duration chip ("Intro · 1:30") in the lower left. It plays
    inline from the video service URL (§4.3) with captions on by default.
  - **Right:** up to 3 Q&A pairs (question in bold, answer in `--fg-muted`), then "Looking
    for" with `.chip`s for target roles, work setup and earliest start.
- Render only the parts the candidate actually filled in.

### 1.5 Book an interview card (sidebar)

- The label "Book an interview", then the line "Next open times in your time zone (TZ).
  Held in Refactored, with the Colaberry team copied."
- The **next 3 open slots** as `.slot-link` rows (date on the left, time in mono
  `--accent` on the right). Each links to the schedule page with that slot preselected
  (`?slot=<iso>`).
- A full-width primary button, "See all times".
- No slots, or the candidate has not opted into booking: show today's **Request intro**
  button and copy instead.

---

## Part 2: schedule an interview (`/talent/<slug>/schedule/`)

**Shell:** add `src/talent/record/schedule/index.html`, or route `^/talent/[^/]+/schedule/?$`
in `nginx/hire-refactored.conf` to a new `src/schedule/index.html`. Add the nginx test to
`nginxConf.test.js`. The page has the same masthead with "← Back to profile". It is
`noindex`.

**Layout:** a `.wrap` with 40px top padding, the label "Schedule an interview" and the H1
"Talk to the person who shipped it." (mono, about 2rem). Then the stepper, then `.p-cols`:
the panel on the left and a summary card on the right.

### Stepper

`Format · Time · Your details · Done` are pills with an 8px radius:

- **Current step:** `--accent` border, `--accent-soft` fill and `aria-current="step"`.
- **Done steps:** a ✓ in `--success` on `--success-soft`.
- **Future steps:** a `--line` border and `--fg-muted` text.

### Step 1: Format

Each format is a full-width radio card (`<button aria-pressed>`) with a dot, a name, the
minutes in mono `--accent`, and a one-line description:

- **Intro call · 20 min:** "Meet them, hear how they work, decide if there is a fit."
- **Case study walkthrough · 45 min:** "They present one of their published case studies
  live and take your questions." Choosing it reveals a thumbnail picker of their published
  case studies. It wraps like §1.3, and the selected one gets a `--star` border.
- **Working session · 60 min:** "Bring a real problem from your team and work through it together."

Only show the formats the candidate accepts (§3.4).

### Step 2: Time

- A week header with ‹ › buttons (44px) and the label "Nov 16 – 20".
- The line "Times in your time zone, **Central (CT)**. Only times the candidate marked open
  are shown." Detect the viewer's zone and allow changing it.
- Day columns in `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`. Each column
  has the weekday (mono caps) and date, then slot buttons (44px, mono, `--accent` text).
  The selected slot is filled `--accent`.
- A day with no slots shows "No open times", or the holiday name.
- "Add your details →" stays disabled until a slot is picked.

### Step 3: Your details

- Reuse the **exact fields of `/intro/`**: name, company email, company, role and "What
  would they walk into?". Same names, maxlengths and autocomplete.
- Add two more:
  - "Invite other interviewers (optional)", comma-separated emails, at most 5.
  - The checkbox "Record the session for my team (the candidate is asked to consent)".
- Validation messages appear inline in `--danger` with `role="alert"`, and focus moves to
  the first bad field.
- **Without JS** it is a plain POST that answers with a 303, like `/intro/`.

### Step 4: Done

- A success icon tile (`--success-soft`), the title "Request sent", and the line
  "<First name> gets it now and confirms within 24 hours. The time is held for you until then."
- A 4-row timeline:
  1. Request sent (now)
  2. Candidate confirms, the Colaberry team is copied (within 24h)
  3. Calendar invite with your room link (on confirm)
  4. Join the room in the browser (the date and time)
- Actions: "Add to my calendar" (.ics), "Back to profile" and "Book another".

### Summary card (right)

- The avatar (56px, gold ring), name and headline.
- A `<dl>` of Format / Length / When / Where ("Refactored room"), plus the case study when
  the format is the walkthrough.
- Below it, a `--bg-sunk` note: "Booking, the call and follow-up all happen on Refactored.
  No emails or phone numbers are exchanged until both sides want to continue."

---

## Part 3: candidate studio (`frontend/src/pages/portal/portfolio/`)

Add a **"Hire profile"** area to the existing portfolio studio. It can be a tab in
`PortfolioPage.tsx`, or `/portal/portfolio/hire` behind the same `PageGate
feature="portfolio"`. Build it in the portal's React patterns. Visually match
`demo/candidate.html`, but use the portal's own component library and tokens where they
exist. Fold the existing `HireAvailabilityPanel` into the Overview.

### Header

- The label "My Hire profile" and the H1 "Hi <first name>. Let employers hear it from you."
- On the right, a **profile strength** meter: "N of 7" in gold over an 8px `--star` bar,
  with `role="progressbar"`. Drive it from `readiness` if it fits; otherwise compute it
  from the 7 items below.
- A "Preview my public profile ↗" button in the masthead.

### Left menu

Overview · Intro video · About you · Interview times · Case studies. Each item has a small
mono badge: "1 request" in gold, "to do", "4 open" or "9". On phones it becomes a wrapping row.

### 3.1 Overview

- **Interview requests** card with a gold border. Each request shows company, format,
  length, the time in the candidate's zone and the requested case study. Actions:
  **Accept**, **Suggest a time** (opens their open slots) and **Decline** (optional reason).
  An accepted request shows a "✓ Confirmed" pill and a "Test my camera" link.
- **Finish your profile** checklist. Each item is a numbered or ✓ tile, a title, a one-line
  detail, and a CTA button that jumps to the right section when the item isn't done:
  1. Published case study
  2. Photo
  3. Intro video
  4. About you
  5. Interview times
  6. Resume
  7. LinkedIn

### 3.2 Intro video

- A 16:9 preview with **Start recording**, **Upload a video** and, while recording, **Next
  prompt →**.
- Record in the browser with `getUserMedia` and `MediaRecorder`, capped at 90s. While
  recording, show a red "REC 0:42" pill and the current prompt overlaid on the preview.
- The three prompts:
  1. "Who you are, and the role you want next."
  2. "One problem you solved, and what changed because of it."
  3. "What you would do in your first 30 days on a new team."
- Add a "captions automatically" checkbox and a tips line.
- Save as a **draft**. Nothing goes public until the candidate presses Publish. Upload
  through the video service (§4.3) to get a stream URL, a poster frame, captions and the
  duration.

### 3.3 About you

- **Headline:** 90 chars. Note that changing it sends the profile back for re-approval,
  which is the existing frozen-at-approval behaviour.
- **Three questions**, 400 chars each:
  - "What problem do you most want to be handed?"
  - "Tell us about a time you caught something before it shipped."
  - "How do you like to work with a team?"
- **Toggle chips** for roles wanted (multi-select, max 5) and work setup (Remote, Hybrid,
  Onsite).
- City, earliest start date, and work authorization (internal only; never shown on Hire).

### 3.4 Interview times

- Time zone select.
- A weekly grid, Mon–Fri × Morning (9–12) / Afternoon (12–5) / Evening (5–8), of 44px
  toggle cells (`aria-pressed`, labelled "Mon morning").
- Formats accepted (toggle chips), most interviews per week, minimum notice, and an "auto
  confirm" checkbox.
- The schedule page turns these blocks into bookable slots.

### 3.5 Case studies

- An ordered list of their **published** case studies, each with the cover thumbnail,
  title, a ★ button to make it the signature, and ↑ ↓ buttons. Each button has a
  descriptive `aria-label`.
- Making one the signature moves it to the top. This order drives the carousel.

---

## Part 4: backend

Follow the existing `hire*` service style: one zod schema per input, idempotent writes,
structured JSON logs, and no internal messages leaking to unauthenticated callers.

### 4.1 Data (one migration, with a rollback)

- `hire_profile_intro`: enrollment_id (PK), headline_draft, answers jsonb (`[{key, text}]`),
  roles text[], setups text[], location, earliest_start date, work_auth (internal), video
  fields (`video_asset_id`, `video_status` draft|published, `video_seconds`,
  `poster_url`, `captions_url`), updated_at.
- `hire_interview_availability`: enrollment_id, tz, `blocks` jsonb (for example
  `["Mon-morning", ...]`), formats text[], max_per_week, min_notice_hours, auto_confirm.
- `hire_case_study_order`: enrollment_id, slugs text[] (validated against published slugs).
  The signature still comes from the existing field.
- `hire_interviews`: id, talent enrollment, format, case_study_slug, starts_at (UTC),
  minutes, status (`requested`|`confirmed`|`declined`|`rescheduled`|`cancelled`|`completed`),
  employer name/email/company/role/message, extra interviewer emails, record_requested,
  room_url, created_at. Link it to the same `lead_sources` row (`hire-refactored`) that
  intros use.

### 4.2 Endpoints

- **Public** (CORS open, rate-limited like `introLimiter`):
  - `GET /api/public/hire/talent/:slug/slots?tz=&from=`: open slots for 2 weeks, with
    booked and too-soon slots removed. `Cache-Control: no-store`.
  - `POST /api/public/hire/interviews`: creates a `requested` interview. JSON gets JSON;
    a form post gets a 303 back to `/talent/<slug>/schedule/?sent=1` (a fixed base URL,
    never taken from the request).
- **Extend** `GET /api/public/portfolios/:slug?surface=hire` with `hire.intro` (published
  answers, chips, video stream and poster URLs, duration), `hire.caseStudyOrder`,
  `hire.booking: { enabled, nextSlots[3], formats[] }`. Never return the work
  authorization, draft fields or any email.
- **Learner** (portal session, enrollment from the session, never from the body):
  - `GET/PUT /api/portal/career/portfolio-page/hire-intro`
  - `GET/PUT /api/portal/career/portfolio-page/interview-availability`
  - `PUT /api/portal/career/portfolio-page/case-study-order`
  - `GET /api/portal/career/hire-interviews`
  - `POST /api/portal/career/hire-interviews/:id/(confirm|decline|propose)`
- **Notifications:**
  - On a request: email the candidate and the Colaberry team.
  - On confirm: send both sides an .ics with the room link.
  - Reuse the mailer `hireIntro` uses.
  - Email copy follows the CLAUDE.md "a little less formal" rule.

### 4.3 Video

- Use the Colaberry video platform (`colaberry/video-analysis`) for upload, transcode,
  captions and a poster frame. **Open that repo first** and use its upload and asset API
  rather than building a new pipeline. If it can't serve public playback, store the
  rendition through the same media path `common.js mediaUrl()` already serves from
  (`/site-v2/...`).
- If it exposes transcript or quality analysis, show it to the **candidate only** as
  coaching ("you said 'um' 9 times", "2:05, over the 90s target"). Never show it on Hire.
- **Interview room:** start with a platform-generated meeting link stored in `room_url`,
  in the same place the `calendar/book` flow puts its link. An embedded in-browser room
  is phase 2.

---

## Part 5: tests (all must pass; add each with the change that needs it)

- **`__tests__/portfolio.test.js`:**
  - `carousel()` includes every published case study exactly once, with the signature first.
  - Unpublished projects render nothing.
  - `.fig` is absent without `heroMetric`.
  - The order follows `caseStudyOrder`.
  - Thumbnails markup contains no `overflow` style.
  - The ledger never prints a 0 tile.
- **`__tests__/motion.test.js`:** the carousel keyframes animate only transform and opacity,
  and the reduced-motion block disables them.
- **`__tests__/nginxConf.test.js`:** the schedule route resolves to its shell and is noindex.
- **Backend jest:**
  - The slots endpoint respects blocks, notice, max per week and existing bookings, with
    time zones (include a DST edge).
  - `POST /interviews` covers JSON and form 303, rejects unknown or unlisted talent and
    rejects a slot that is not open.
  - The public payload never contains an email or `work_auth`.
  - Learner routes only ever touch the session's enrollment.
- **Portal React tests** for each new panel: the checklist counts, the toggles, reorder,
  the recorder's fallback when no camera is available, and accept/decline.
- **Visual check:** Playwright screenshots of `/talent/kesetebirhan-delele/` at 1320 and
  390. `document.documentElement.scrollWidth === innerWidth` at 390, in both themes.

## Delivery

- **Ship in this order**, one PR each:
  1. The carousel, thumbnails and ledger fix (frontend only, no API change).
  2. Backend tables and endpoints, plus the extended payload.
  3. The candidate studio.
  4. The schedule page and notifications.
  5. Intro video on the video platform.
- **Each PR body has:**
  - before/after screenshots (light and dark, 1320 and 390)
  - the list of acceptance checks it ran and their results
  - which ladder rung it reached (built / tested / merged / deployed / production-verified).
- **Don't break `/intro/`.** It keeps working for profiles without booking enabled.
- **End every reply with the `brief-me` short block**, as CLAUDE.md requires.

## Acceptance (what "done" looks like)

- [ ] Kes's profile shows a 9-slide carousel that auto-advances, pauses on hover and focus,
      and respects reduced motion. The 9 thumbnails wrap, and nothing scrolls sideways at 390px.
- [ ] "In their words", About and Experience render. Empty sections render nothing.
- [ ] An employer can pick a format, a time and details, and see "Request sent" without JS
      errors. With JS off, the form still posts.
- [ ] A test candidate gets the request in the studio, accepts it, and both sides receive an
      .ics with a room link.
- [ ] The candidate can record or upload an intro video, answer the questions, set their
      times and reorder case studies, and the public profile reflects each one within 2
      minutes (the existing cache window).
- [ ] No email, phone or work-authorization value appears in any public payload or page.
