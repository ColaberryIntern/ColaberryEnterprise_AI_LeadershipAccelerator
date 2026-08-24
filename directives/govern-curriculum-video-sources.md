# Directive — Govern Curriculum Video Sources

**Status:** active · **Policy owner:** Swati Raman (curriculum) · **Implementation owner:** Ali Muwwakkil · **Decided:** 2026-08-24 · **System:** AI Systems Architect Accelerator curriculum (`enterprise.colaberry.ai`)

## Purpose
Curriculum video cards link to third-party YouTube content we do not control. Roughly two in five week-assigned video cards (31 of 73 audited on 2026-08-24) sit on personal or small individual channels, which can be deleted, made private, renamed, or have embedding switched off at any moment with no notice and no recourse. This directive records the standing sourcing policy and the procedure for replacing a video once it dies, so the decision is not re-litigated per incident and so no replacement reaches students unreviewed.

## The decision (Swati Raman, 2026-08-24)

> "I agree with your proposed approach of using Option C as the baseline. Additionally, if a video becomes unavailable, we should find an alternative with similar content and review it together before uploading."

**Option C is the baseline for all curriculum video:** personal and third-party channels are permitted, and we rely on the automated daily health check to tell us when one breaks. We accept that we learn about a break after it happens rather than before.

Two refinements carried over from the same thread, recommended and not objected to:
- **Prefer an official channel wherever a genuine equivalent exists** (Anthropic, IBM Technology, Google Cloud Tech, Visual Studio Code). Cheap, and reduces the exposed surface at no cost.
- **Record our own version only for videos that actually gate a student's progress.** A supporting video going dark is an annoyance; one that seals a week is an outage. Cost is justified only for the latter.

**Known and accepted gap:** the daily check cannot see a channel quietly changing hands or being renamed, nor a video that still plays but is no longer appropriate. Adding channel-ownership comparison to the daily check is a recommended follow-up, not part of this decision.

## Inputs
- Daily health check: `backend/src/services/curriculumHealth/videoLinkHealthService.ts`, scheduled `20 6 * * *` `America/Chicago` in `backend/src/services/schedulerService.ts`, gated on `CURRICULUM_VIDEO_HEALTH_ENABLED=true` and a non-empty `YOUTUBE_API_KEY`.
- Its findings: the `alerts` table (`impact_area='curriculum'`, `entity_type IN ('curriculum_video','curriculum_card')`), the structured `service="curriculum-video-health"` log lines, and the `curriculum_video_health_last_run` settings key.
- Read-only CLI alternative, no API key required: `backend/src/scripts/auditCurriculumVideoLinks.ts`.

## Steps — replacing a video the health check has flagged

1. **Confirm the video is genuinely dead, not the checker misfiring.**
   Re-resolve the id through YouTube oEmbed alongside a known-good control video in the same run. Success signal: the dead id returns HTTP 404 while the control returns 200. A run where both fail is a YouTube or network problem, not a curriculum problem — stop here.

2. **Establish who is affected.**
   Identify the cards carrying the dead id and whether any of them gate progress (a watch gate armed on that card). Success signal: a concrete count of affected cards and students, and a yes/no on whether the week is sealed by it.

3. **Source a candidate replacement with similar content.**
   Prefer an official/vendor channel; fall back to an established education brand; a personal channel is acceptable under the Option C baseline. Resolve the owning channel from YouTube's oEmbed `author_name` field, **never from the title** — several videos titled as though they were Anthropic's belong to unrelated individuals. Success signal: a candidate URL with its resolved channel name, duration, and a one-line note on why it covers the same ground.

4. **Send the candidate to Swati and wait for her approval. This gate is mandatory.**
   No replacement is uploaded, seeded, or written to a card before she has reviewed it. Success signal: an explicit approval from Swati naming the candidate.

5. **Apply the approved replacement in the durable location.**
   For seeded sample cards the seed file is the only durable place — `backend/src/seeds/seedIntelSampleCards.ts` re-asserts its cards on boot and will silently revert a DB-only edit (this has already happened once, on 2026-08-12). For authored curriculum cards, update the card record. Success signal: the new id survives a backend restart.

6. **Re-run the health check for that card.** Success signal: the card no longer appears in the flagged set, and the next daily run does not re-raise it.

## Outputs
- An updated video reference on the affected card(s), in a location that survives a redeploy.
- An approval record from Swati in the relevant email thread or Basecamp ticket.
- A closed alert row for the previously-flagged video.

## Verification
- `SELECT created_at, title, entity_id, metadata FROM alerts WHERE impact_area='curriculum' AND entity_type='curriculum_video' ORDER BY created_at DESC LIMIT 20;` — the replaced id is no longer being raised.
- oEmbed on the new id returns HTTP 200 with the expected `author_name`, checked alongside a control video in the same run.
- The card opens for a student in the portal and the player loads.

## Edge cases / failure modes
- **The card is unpublished rather than the video being dead.** A student-visible card whose underlying record is not `visibility='published'` fails every gated action while still rendering. Symptom: the video appears in the feed but the workspace 404s "Card not available". That is a platform defect, not a video-sourcing problem — do not replace the video.
- **Seed reversion.** Editing the DB for a seeded card without editing the seed file looks fixed and reverts on the next boot. Always fix the seed.
- **Checker false positives.** The health check confirms a failure twice and carries a known-good control per batch specifically so a YouTube outage cannot make the whole curriculum look dead. Anything it cannot verify is reported as `UNKNOWN` and must not be treated as a dead link.
- **No suitable replacement exists.** Escalate to Swati with the gap rather than shipping a loosely-related video; if the card gates progress, recording our own version is the sanctioned answer.

## Safety constraints
- **Never upload or swap a replacement before Swati has reviewed it.** This is the explicit condition of the 2026-08-24 decision.
- Mirroring a third-party video to our own channel is a copyright problem without written permission; in practice "mirror it" means record our own version.
- The health check and the audit CLI are read-only by design — neither edits, archives, nor repairs a card. Replacement is a curriculum judgement, never an automated one.
- `YOUTUBE_API_KEY` is read from the environment and must never be echoed into logs or committed.
