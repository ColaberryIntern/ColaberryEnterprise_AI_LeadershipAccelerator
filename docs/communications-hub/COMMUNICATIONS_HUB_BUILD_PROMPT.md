# Build prompt: Communications Hub

Paste everything below the line into Claude Code, opened at the root of
`ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`.

Before you start, copy this package into the repo so the paths in the prompt resolve:

```
docs/communications-hub/
  COMMUNICATIONS_HUB_BUILD_PROMPT.md        (this file)
  design/01-today.html
  design/02-events-thumbnail-studio.html
  design/03-compose-approve.html
  design/04-schedule-history-groups.html
  reference/Colaberry_AI_Communications_Research_for_Ali.html
```

The repo facts in this prompt were read from the default branch on 2026-11-20. Anything marked
"confirm" was inferred rather than read in full, so check it before relying on it.

---

## The job

Build the **Communications Hub**: one admin page where Jackie (Community Organizer) manages
everything she communicates. She creates events, gets an AI-made thumbnail for each one, has AI
draft messages from an event or a typed subject, and sends them inside the platform (community
feed, in-app notification) and outside it (WhatsApp groups). She approves every message before it
goes anywhere.

Two rules hold in every release, and no later instruction in this prompt relaxes them:

1. **Nothing is sent or published without a recorded human approval** of the exact content,
   recipients and time. If any of those change after approval, the approval is void and the
   message returns to "Needs approval".
2. **No real WhatsApp message leaves this system until Ali says so in writing.** Until then the
   WhatsApp connector runs in mock mode. Do not create provider accounts, connect a phone number,
   or touch the office landline (+1 972-992-1024).

Follow the root `CLAUDE.md`, `frontend/CLAUDE.md` and any `backend/` rules as written: the
brief-me block, Central time, the per-session progress log, idempotency, tests before logic.
Where this prompt and `CLAUDE.md` disagree, `CLAUDE.md` wins and you say so in your reply.

## Read first

1. `docs/communications-hub/design/*.html`: the four screens. Open them in a browser. They are
   the layout, wording and behaviour to match. They are **not** code to copy: the inline styles
   and hex colours exist only so the mockups stand alone. All data in them is sample data and
   `[BRACKETED]` values are placeholders.
2. `docs/communications-hub/reference/Colaberry_AI_Communications_Research_for_Ali.html`: the
   brief from the meeting with Ali. It holds the WhatsApp provider research, the risks and the
   acceptance checklist.
3. The repo files listed under "What already exists".

## Decisions for Ali

These cross a governance boundary under `CLAUDE.md` ("Strategic decisions"). Each has a
recommended default. State in your first reply which defaults you are taking, then proceed. Stop
and ask only where marked **ASK**.

| # | Decision | Recommended default |
|---|---|---|
| 1 | Who can open the Hub. `community_organizer` holds only `dashboard` today (`backend/src/services/access/mgmtRoles.ts`), so Jackie cannot reach a page gated on `campaigns` or `program`. | Add a new section key `comms_hub`, granted to `owner`, `admin` and `community_organizer`. Update every place that mirrors `SECTION_KEYS`. |
| 2 | Name and path. `/admin/communications` already exists and is the log of messages sent to leads (`AdminCommunicationsPage`). | New page at `/admin/comms-hub`, nav label "Communications Hub". Leave the existing page and its route alone. Do not rename it. |
| 3 | How thumbnails are made. | Deterministic branded templates composed on the server (SVG, rasterised with `sharp`, which is already a dependency), with Jackie's uploaded photos placed into the template. AI chooses the copy and which template fits. No image-generation model in Release 1. |
| 4 | Adding an image-generation model for backgrounds or photo treatment. | **ASK.** New vendor, new cost, new content risk. Build the thumbnail source as a pluggable interface so it can be added later. |
| 5 | WhatsApp provider. The brief recommends piloting Whapi.Cloud, which is unofficial and carries account-restriction risk. | Build the provider-neutral interface and the mock. Write the Whapi.Cloud adapter in Release 3 behind an env flag that defaults to mock. **ASK** before any live call. |
| 6 | Whether one person may both write and approve. The design has Jackie doing both. | Allow it, record `approved_by` and `created_by` separately so a second-approver rule can be added later. |

## What already exists

Reuse these. Do not build a parallel version of something that is already here.

**Frontend** (React 18, CRA, TypeScript strict, Bootstrap 5, react-router v6)

- Admin chrome: `frontend/src/components/Layout/AdminLayout.tsx`. Sidebar groups and their
  section keys: `frontend/src/components/Layout/adminNav.ts`.
- Routes: `frontend/src/routes/adminRoutes.tsx` (lazy imports, one `<Route>` per page).
- Page building blocks: `frontend/src/components/admin/shell` exports `PageHeader`, `StatCard`,
  `StatusBadge`, `SectionCard`, `EmptyState`. `AdminCommunicationsPage.tsx` shows them in use.
- Design tokens: `frontend/src/colaberry/tokens/*.css`. Never hardcode a hex value. Map the
  mockup colours to tokens, for example cherry `--red-500/600/700`, berry `--blue-*`, leaf
  `--green-*`, surfaces `--surface-*`, text `--text-*`.
- API client: `frontend/src/utils/api` (confirm against `frontend/CLAUDE.md`, which also points
  at `src/services/`). Never call `fetch` from a component.
- Invoke the `/frontend-design` and `/fixing-accessibility` skills before writing UI, as
  `frontend/CLAUDE.md` requires.

**Backend** (Express, TypeScript, Sequelize, Zod)

- Admin routers are mounted in `backend/src/routes/adminRoutes.ts` with `router.use(...)`.
- Section gating by URL prefix: `backend/src/middlewares/mgmtSectionGate.ts`. Note the comments
  there about segment boundaries: `/api/admin/community` is `program` and
  `/api/admin/communications` is `campaigns`. An unmapped prefix is a defect, so map the new one.
- Roles: `backend/src/services/access/mgmtRoles.ts` (`SECTION_KEYS`, `MGMT_ROLE_DEFS`,
  `effectiveSections`).
- Schema changes are boot-time, additive and idempotent: `backend/src/db/ensure*Schema.ts`,
  called from `backend/src/server.ts`. The model must match the DDL exactly; existing schemas
  have parity tests. Follow `ensureChannelAccountSchema.ts` and `ensureMediaLibrarySchema.ts`.
- Events: `backend/src/models/CommunityEvent.ts` (requires `cohort_id`; has title, description,
  `event_type` of session / open_house / office_hours / other, starts_at, ends_at, location_url).
  It has **no** thumbnail, registration link, recurrence or cancelled state.
  `backend/src/services/communityCalendarService.ts` merges it with `LiveSession` and
  `OpenHouseEvent` for the calendar.
- Community feed: `backend/src/models/CommunityPost.ts` (body, `media_urls`, `pinned`, `status`,
  `cohort_id`, `member_id`) and `backend/src/services/community/`. Find the existing function
  that creates a post and call it; do not insert rows directly. Confirm which member identity a
  staff announcement should post as.
- In-app notifications: `backend/src/models/CommunityNotification.ts` and
  `communityNotificationService.createNotification`. Confirm the notification `type` enum and add
  a type by migration if none fits (see `backend/src/seeds/migrations/`).
- Central time: `backend/src/services/centralDate.ts` (`CENTRAL_TZ`, `centralWallClockToInstant`,
  `instantToWallClock`). Read the warning at the top of `communityCalendarService.ts` about naive
  date parsing before writing any date code. Do not add a second date helper.
- AI calls: `backend/src/services/llmCallWrapper.ts` (logging, cost, redaction, caching). All
  model calls for drafting go through it.
- Marketing composer: `backend/src/routes/admin/contentComposerRoutes.ts` with
  `services/content/contentWorkflowService.ts`, `contentApprovalService.ts` and
  `services/publishing/providerCapabilities.ts`. This serves public social channels (see
  `models/ChannelAccount.ts`). Read it for its draft, variant, approval and workflow patterns and
  reuse what fits. Keep the Hub a separate module: its audience is enrolled members and WhatsApp
  groups, not social followers. If you find the two should share a table, say so and stop.
- Thumbnails: `backend/src/services/components/thumbnailService.ts` builds a deterministic
  branded SVG and names `'ai'` and `'custom'` as planned sources. Extend that idea.
- Media: the `media_assets` library (`ensureMediaLibrarySchema.ts`), `multer` upload configs in
  `backend/src/config/`.
- Scheduling: `node-cron` jobs registered in `backend/src/server.ts`, `models/CronScheduleConfig.ts`
  and `routes/admin/schedulerControlRoutes.ts`.
- WhatsApp: there is no sender. `alertDeliveryService.ts` has a logging placeholder only. Brand
  assets and message templates are in `frontend/public/knowledge/design/assets/whatsapp/` and
  `frontend/public/knowledge/design/templates/whatsapp-kit/`.

## What to build

### The page

One route, `/admin/comms-hub`, with four tabs that match the four design files. Use nested
routes so each tab has its own URL (`/admin/comms-hub`, `/events`, `/compose`, `/schedule`) and a
refresh keeps the tab. Put components under `frontend/src/components/admin/commsHub/`, one file
per section, each within the size targets in `CLAUDE.md`.

Every page header carries the three controls from the design: Pause all sending, New event, New
message.

**Today** (`01-today.html`): four summary tiles; the "What do you want to tell people?" box that
opens Compose with the text carried over; the approval queue with Review & approve, Edit and
Reject; "Going out next"; upcoming events with their thumbnails; channel status.

**Events** (`02-events-thumbnail-studio.html`): the event strip; the event form (title, type,
audience, date, time in Central, repeat rule, join link, registration link, hosts, description
with "Write with AI", platform placement checkboxes, Save, Duplicate, Cancel this event); the
thumbnail studio (upload up to 6 pictures, headline, supporting line, show date and time,
Generate, Try 3 more, pick one, ask for a change in words, choose sizes 16:9 / 1:1 / 3:1, Use for
this event, Download, Upload my own instead); the promotion plan (Announcement, Reminder 1 day
before, Starting in 1 hour, Recording and thanks) that creates one draft message per ticked row.

**Compose** (`03-compose-approve.html`): step 1, start from an event or a subject, kind of
message, extra notes, tone, what to include; step 2, one draft per channel with a faithful
preview and an edit box, plus Shorter, Warmer, More detail and earlier drafts; step 3, recipients
on the platform and WhatsApp groups, send now or at a set time, the "You are approving" summary,
Approve and schedule, Save as draft, Reject, and the approved state with Undo approval.

**Schedule & history** (`04-schedule-history-groups.html`): filters; the next 7 days grouped by
day with Cancel and Review; the history table with per-row failure detail and retry; the WhatsApp
group list with Sync and a per-group "Can receive" switch; safety controls; the activity log.

### Statuses

`draft`, `needs_approval`, `approved`, `scheduled`, `sending`, `sent`, `partially_failed`,
`failed`, `cancelled`. The brief lists eight; the design adds `needs_approval` for an AI draft
that is ready for Jackie. Write the allowed transitions as a single pure function with a test for
every transition, allowed and refused. Use `StatusBadge` and make sure each status differs from
the others in more than colour.

### Data

Proposed tables, all new, all prefixed `comms_hub_`. Adjust names to match repo conventions, and
check each against what already exists before creating it.

| Table | Holds |
|---|---|
| `comms_hub_events` | The event as Jackie enters it: title, type, audience, start and end instants, repeat rule, join and registration links, hosts, description, placement flags, status (`active` / `cancelled`), chosen thumbnail. |
| `comms_hub_thumbnails` | One row per generated or uploaded option: event, source (`template` / `upload` / later `ai`), style, inputs used, and a `media_assets` reference per size. |
| `comms_hub_messages` | One message (the brief calls this a campaign): optional event, subject, kind, tone, status, send time, created_by. |
| `comms_hub_drafts` | Versioned text per message per channel (`community_post`, `in_app`, `whatsapp`): version number, body, title, author (`ai` or the admin id). Never overwrite a version. |
| `comms_hub_destinations` | Who a message goes to: channel plus the cohort feed, audience or WhatsApp group it targets. |
| `comms_hub_approvals` | Who approved, when, and a hash of the exact drafts, destinations and send time approved. |
| `comms_hub_deliveries` | One row per destination per message: unique idempotency key, status, attempt count, provider message id, error, timestamps. |
| `comms_hub_whatsapp_groups` | Provider group id, display name, `can_receive`, `is_test`, linked cohort, last synced. Show names in the UI, send by id. |
| `comms_hub_settings` | Global pause, quiet hours, failure-alert recipients. |

To put an event on the platform, write through to `community_events` (one row per cohort in the
audience, linked back by a nullable `hub_event_id`) so the existing calendar and campus rails keep
working without changes to their readers. Confirm this against every reader of `community_events`
before choosing it; if a reader would break or double-count, report that and propose an
alternative.

Record every create, edit, approval, rejection, cancellation, pause, group change and send in the
activity log. Check `backend/src/middlewares/auditMiddleware.ts` first and use the existing audit
trail if it can carry these events.

### API

Mount under `/api/admin/comms-hub` and map that prefix in `mgmtSectionGate.ts`. Zod-validate
every body before any service runs. Suggested surface: events (list, create, update, duplicate,
cancel); thumbnails (upload pictures, generate, revise, select, download); messages (list with
filters, create from event or subject, regenerate, edit draft, list versions, set destinations,
set schedule, submit, approve, revoke approval, reject, cancel, retry failed deliveries);
whatsapp-groups (list, sync, update); settings (get, update, pause, resume); activity (list).

Provider tokens and any phone number stay on the server. Nothing from the WhatsApp provider's
credentials may appear in an API response or in browser code.

### AI drafting

- One service that takes an event or subject, the kind of message, tone and extra notes, and
  returns one draft per requested channel plus recommended destinations with a one-line reason.
  Call the model through `llmCallWrapper`.
- Ship the prompts as files in the repo. Give each channel its own constraints: WhatsApp is short
  and uses WhatsApp formatting; the community post is a paragraph; the in-app notification is a
  title and one line.
- Facts in a draft (date, time, links, host names) are inserted by code from the event record,
  never left to the model. Validate that every draft about an event contains the correct Central
  date and time before it can be submitted for approval.
- A draft never triggers a send. The drafting service has no import path to the delivery service.

### Thumbnails

- Three or more templates in Colaberry colours and fonts, matching the three options in the
  design (bold cherry, berry night, clean white). Each renders at 16:9, 1:1 and 3:1.
- Inputs: headline, supporting line, optional date badge from the event, up to 6 uploaded
  pictures. Validate uploads for type and size, strip metadata, and store through the existing
  media library.
- "Ask for a change" maps a typed request to template parameters (headline size, photo
  arrangement, template choice) through the model, then re-renders deterministically. If the
  request cannot be mapped, say so in the UI rather than guessing.
- The chosen 16:9 image becomes the event's thumbnail everywhere the event is shown, including
  the recording. Find where recordings take their thumbnail
  (`backend/src/services/presentation/recordingThumbnail.ts`) and confirm how to attach it.

### Delivery and scheduling

- A connector interface per channel. For WhatsApp, exactly the four calls in the brief:
  `listGroups()`, `sendText()`, `sendMedia()`, `getMessageStatus()`. Implement a mock first that
  records what it would have sent. Community and in-app connectors call the existing services.
- A database-backed worker, registered the way existing jobs are in `server.ts`, that claims due
  deliveries with a row lock so two instances cannot send the same one.
- Before each send the worker re-checks, in this order: global pause; message status; the
  approval hash still matches the current drafts, destinations and time; the destination is still
  allowed (`can_receive`); quiet hours. Any failure holds or cancels the delivery and logs why.
- One delivery row per destination with a unique idempotency key. A retry reuses the key. Bounded
  retries with backoff, then `failed`. A message with mixed results is `partially_failed`, and
  Jackie can retry only the failed destinations.
- Scheduling is in `America/Chicago` with daylight-saving handling through `centralDate.ts`.
  Store instants, show Central with the zone written out.
- Recurring events regenerate their promotion plan each occurrence as new drafts in
  `needs_approval`. A recurring message is never auto-approved.
- Cancelling an event cancels its pending deliveries in the same transaction and offers a
  cancellation draft. Editing an event's date, time or links voids approvals on its pending
  messages.
- Failure alerts go to the recipients in settings through the existing alert path.

## Releases

Ship in this order, one PR per release, each one tested and usable by itself. Follow the
branch, PR and session-log rules in `CLAUDE.md` and match the file naming already used in
`docs/sessions/`.

1. **Access and shell.** Section key, role grant, gate mapping, nav entry, route, the four tabs
   rendering against the real API with empty states. Access tests in the style of the existing
   `*.access.test.ts` files: `community_organizer` gets in, a role without the section gets 403.
2. **Events and thumbnails.** Tables, event CRUD, write-through to the community calendar,
   template thumbnails with uploads, all three sizes.
3. **Compose and approve, mock sending.** Drafting, versions, destinations, approval hash, status
   machine, activity log. Every connector is a mock. This release satisfies "unapproved messages
   never send" from the brief's checklist.
4. **Platform delivery.** Real community posts and in-app notifications through the existing
   services, to a test cohort first. The scheduler, pause, quiet hours, retries and history.
5. **WhatsApp pilot.** Group sync and the provider adapter behind an env flag that defaults to
   mock, restricted to groups marked `is_test`. Stop here and report. Going live on a real number,
   widening beyond the test group, and anything involving the office landline are Ali's calls.

## Tests

Follow the test pyramid and the "mandatory test types per feature" section of `CLAUDE.md`. At
minimum:

- The status transition function, every pair.
- Approval hash: changing the body, a destination or the send time voids approval.
- Worker: unapproved, paused, cancelled, disallowed-group and quiet-hours deliveries do not send;
  a double-claimed delivery sends once; a restart mid-send does not duplicate; a retry reuses the
  idempotency key.
- Central time: a message scheduled across the daylight-saving change sends at the right wall
  clock time.
- Event cancel cancels pending deliveries; event edit voids approvals.
- Drafting: the date, time and links in a draft match the event record.
- Access: section gate for every new route; no provider credential in any response body.
- Model and DDL parity for every new table.
- Frontend: `npx tsc --noEmit` clean, plus an accessibility pass on each tab (labels, focus
  order, 44px targets, status not conveyed by colour alone).
- One Playwright path in `/tests/systemV2`: create event, generate thumbnail, draft, approve,
  see it scheduled, see the mock delivery in history.

Run `npm test` in `backend/` and the type-check in `frontend/` before calling anything done, and
report the actual results.

## Do not

- Do not send, publish or deploy anything outside local and test environments.
- Do not rename or change `/admin/communications`.
- Do not add an image-generation vendor, a WhatsApp provider account or a new queue dependency
  without asking.
- Do not copy inline styles or hex colours from the design files.
- Do not put event facts in the model's hands, or parse dates without `centralDate.ts`.
- Do not mark a release done on the strength of the mock for a channel whose real connector that
  release was meant to ship.

## Done means

For each release: the PR is open with tests passing and their output quoted, the session log has
an entry with verification evidence, and your reply ends with the brief-me block stating which of
built, tested, merged, deployed and production-verified is true. Report the brief's seven-point
pilot checklist line by line once Release 5 is built, marking each as passed in mock, passed
against the test group, or not yet run.
