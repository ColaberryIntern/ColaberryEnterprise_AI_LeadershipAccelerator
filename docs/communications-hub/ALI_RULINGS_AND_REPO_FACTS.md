# Ali's rulings and verified repo facts (2026-11-20)

These override `COMMUNICATIONS_HUB_BUILD_PROMPT.md` wherever the two disagree. Where `CLAUDE.md`
disagrees with either, `CLAUDE.md` wins, except for the rulings below. Do not re-litigate them.

## Rulings (Ali, 2026-11-20)

1. **One PR, one deployment for the whole build.** This replaces the kit's five releases.
   Each ticket group ends in a checkpoint: the full quality gate on the branch, with no PR, no
   deploy and no question to Ali. Ask Ali only for something that cannot be done without him.
2. **Who gets in.** Jackie Chalk (Community Organizer, jackie@colaberry.com) and Taiwo
   Oludimimu (taiwo@colaberry.com) both get access. Add a new section key `comms_hub`. Grant it
   to the `owner`, `admin` and `community_organizer` roles. Give it to Taiwo as a per-user
   extra section (`community_members.mgmt_extra_sections`), not by adding it to her whole role.
3. **Where events live.** In our platform DB only. They appear on the member portal Events page
   and calendar. There is **no Eventbrite API integration**: no token exists, and none is to be
   requested. Jackie pastes the Eventbrite registration link into the event when she wants it on
   training.colaberry.com.
4. **Thumbnails.** An AI image model (OpenAI, using the existing prod key) generates them from
   Jackie's uploaded photos and the style families in `reference/THUMBNAIL_STYLE_PROMPTS.md`.
   The deterministic branded templates are the fallback, and the path tests run on.
5. **WhatsApp is out of scope** until after this build ships. Do not build a WhatsApp
   connector, mock, group sync or UI beyond a "WhatsApp: coming next" line. Channels in this
   build are `community_post` and `in_app`.
6. **Move an event to LIVE, streamed via Cloudflare**, using the existing broadcast system.
7. **Look.** The admin event list mirrors training.colaberry.com/events: a featured next-event
   card (the thumbnail on the left; a dark panel on the right with the type chip, title, date,
   time and place, a blurb and a Register button), then a "More upcoming events" grid of cards
   with red date chips. Screenshots are in `reference/training-events-*.png`. Add admin status
   chips and the create/edit controls from `design/02-events-thumbnail-studio.html`.

## Verified repo facts (origin/main, 2026-11-20). Re-verify in CH0.1.

### Access
- `backend/src/services/access/mgmtRoles.ts:15-61`: `SECTION_KEYS`. `community_organizer` has only
  `['dashboard']` (:111). `COMMUNITY_MODERATOR_ROLES` is at :228.
- `backend/src/middlewares/mgmtSectionGate.ts`: `/api/admin/communications` maps to campaigns
  (:31); `/api/admin/community` and `/api/admin/accelerator` map to program (:127). Unmapped
  prefixes are denied to scoped roles: `pathToSection` :446, then the final `res.status(403)` :486
  (corrected in CH0.1; the earlier ":86-87" pointed at comment text).
- The frontend mirrors `SECTION_KEYS` in
  `frontend/src/pages/admin/communityRoles/ExtraSectionsEditor.tsx:11`. Nav:
  `frontend/src/components/Layout/adminNav.ts` (`NAV_GROUPS` :59, `UNLISTED_PATH_SECTIONS` :400).
  Routes: `frontend/src/routes/adminRoutes.tsx`.
- Roles live in `community_members.mgmt_role` and `mgmt_extra_sections`
  (`CommunityMember.ts:18-20, 87-95`). They are set via
  `PATCH /api/admin/community/members/:memberId/mgmt-role` and `/mgmt-extra-sections`
  (`communityMemberRoutes.ts:101, 163`). Rules: `mgmtRoleGrant.ts`. UI: `/admin/community-roles`.
- No seed grants Jackie or Taiwo anything. `mgmtRbac.test.ts:195` refers to "revenue (Taiwo)".

### Events
- `community_events` (`CommunityEvent`): `cohort_id` NOT NULL, title, description, event_type,
  starts_at, ends_at, location_url. No thumbnail and no status.
- `communityCalendarService.getUpcomingEvents` (:49) merges CommunityEvent, LiveSession and
  OpenHouseEvent. It serves `GET /api/portal/community/calendar`.
- The member portal page `/portal/events` (`frontend/src/pages/portal/events/EventsPage.tsx`) reads
  only CCPP Eventbrite events through `publicEventsService.ts`. Hub events will not appear there
  unless that page merges them (CH2.3).
- Nothing in the repo creates Eventbrite events or writes to CCPP. Keep it that way.

### Broadcast / Cloudflare Stream
- Provider: `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts`
  (`createLiveInput()` :304 is unused). Binding is the **shared** strategy: one durable input from
  `CLOUDFLARE_STREAM_LIVE_INPUT_UID` (`broadcastInputBinding.ts:52-73`). That means **one live
  broadcast at a time**. Prod env has `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`,
  `CLOUDFLARE_STREAM_SUBDOMAIN`, `CLOUDFLARE_STREAM_LIVE_INPUT_UID` and the signing key vars.
- Tables (`ensureBroadcastSchema.ts`): `broadcast_series`, `broadcast_occurrences` (:103) and
  `broadcast_source_refs` (:153), whose `(source_type, source_id)` is unique.
  `SOURCE_TYPES` already includes `community_event`, but nothing creates occurrences from it.
- The LiveSession path to copy: `ensureOccurrenceForSession` (`broadcastSessionOccurrence.ts:183`).
  It refuses `no_room`, `undeterminable_start` and `no_live_input`. The room comes from
  `acceleratorService.resolveRoomId` (`studioSetupService.ts:253`); `access_mode` is
  free / paid / preview / private.
- State machine (`broadcastStateMachine.ts`): scheduled, backstage, live, reconnecting, ended,
  processing, replay_ready, cancelled. `go_live` is refused until provider health is ready and
  `content_started_at` is set.
- The portal API `/api/portal/broadcasts` (behind `env.broadcastEnabled`) holds the command,
  active, replays, playback and heartbeat routes. Producer rights are
  `community_members.role='staff'`, not mgmt roles.
- The recording binds automatically through the health loop (`broadcastHealthLoop.ts:58-61`).
- Admin UI: `/admin/live/studio` and `/admin/live/studio/:sessionId`. The viewer page is
  `/portal/live/:sessionId`. The only "Go live" button today is in the portal ProducerStrip.

### Thumbnails and media
- `services/components/thumbnailService.ts` produces a deterministic SVG; 'ai' is a planned
  source. `presentation/recordingThumbnail.ts` takes an ffmpeg frame. `media_assets`
  (`ensureMediaLibrarySchema.ts`) is brand-scoped. The `openai` SDK is already a dependency
  (`intelligence/assistant/openaiHelper.ts`).
- **Correction (CH0.1, re-verified at f89fce619):** one image-generation call already exists.
  `backend/src/services/spark/sparkService.ts:299-323` calls
  `POST https://api.openai.com/v1/images/generations` with `gpt-image-1-mini` and
  `env.openaiApiKey` (it merged in PR #4232 on 2026-11-20). CH4.3 follows that request shape and
  adds what Spark lacks: photo input (`/v1/images/edits`), cost logging and a template fallback.

### Not on main yet
- `docs/communications-hub/` (CH0.1 commits the kit there).
