# Connect the enterprise intake to the client demo build

Paste everything below the line into the "Enterprise site v5 handoff" tab.

---

Connect the enterprise.colaberry.ai intake to the project spine, so that when a client finishes our intake interview (typed or spoken), the platform automatically writes their project plan and builds and hosts their Command Center and clickable demo. The goal: by the client call, the research, the Command Center and the demo are ready to show.

Read `origin/main` first. The spine side (L13.7, https://app.basecamp.com/3945211/buckets/7463955/todos/10548031255) must be merged: check that `backend/src/services/sbp/clientDemo.ts` exists on main. If it does not, stop and tell me.

## How the spine works

Every build runs one pipeline (`startBuild`) in one of two modes:

- `student` (default): Story 000 (Command Center) and Story 900 (demo) are tasks the student builds. No cost to us. Every student project uses this.
- `platform`: the platform builds and hosts both. About $2 per project. Only client demos use this.

You never set the mode yourself. Call this one door, and nothing else:

```ts
import { startClientDemo, clientDemoStatus, clientDemosLeft } from '../sbp/clientDemo';

await startClientDemo({ understandingId });
// { ok: true, projectId, reused }
// { ok: false, reason: 'off' | 'not_configured' | 'daily_cap' | 'not_found' | 'not_extracted'
//                    | 'not_confirmed' | 'too_thin' | 'failed', error }

await clientDemoStatus(understandingId);
// { state: 'none' | 'planning' | 'building' | 'ready' | 'failed',
//   project_id, command_center_url, demo_url, link_expires_at }
```

- `understandingId` is `EnterpriseIntake.understanding_id`.
- It is safe to call twice: the same understanding always returns the same project.
- It refuses before spending anything when the switch is off, no client enrollment is configured, or the daily cap (default 5 builds in 24 hours) is reached.
- Timing: the plan took about a minute and the pages 18 to 22 minutes in our two test builds. Do not promise the client a time.

## What to build

1. **Start it.** In `enterpriseIntakeService.ts`, `recordInterviewed` is where both the typed interview and the finished call arrive, and where `researchSoon` starts. Right beside `researchSoon`, on the first successful interview only, start the demo. It must never delay or fail the client's interview response. Keep `buildFor: { kind: 'none' }` on every interview path: that route makes a student-mode build. Update the comments that say nothing is built.
2. **Any new voice agent must end at the same place.** Whatever places the call (Kes's GHL agent now, Voice AI Studio later), the finished transcript must go through `finishIntake` with source `voice_transcript` and then `recordEnterpriseCallOutcome`, as `flotationCallCompletion.ts` does today. Do not add a second path into the build.
3. **Retry.** Add a step to `enterpriseIntakeSweep.ts` for interviewed intakes with no demo started (a deploy can interrupt the first try). Store the start result on the intake. Retry only `daily_cap`, `off`, `not_configured` and `failed`, with a capped number of attempts; never retry `too_thin`. Only look back 7 days, so switching the feature on does not build demos for every old intake.
4. **Show it to us.** On the admin Enterprise client view: the state, and "Open Command Center" and "Open demo" buttons when ready. When `failed` or refused, show the reason in plain words.
5. **My meeting brief.** Say whether the demo is ready. Link to the admin client page, not to the demo itself.
6. **Do not show or send the demo to the client automatically.** I show it on the call.

## Rules

- **Links expire after 12 hours.** Call `clientDemoStatus` on each page load. Never store these links and never put them in an email or Basecamp. They are relative; prefix `https://enterprise.colaberry.ai`.
- Never call `startBuild`, `startBuildFromUnderstanding` or `queuePlatformBuild` directly for this. A test fails if any other file asks for platform mode.
- Never start a demo from the form alone: it needs a finished interview, because the form is public and each build costs money.
- Nothing is turned on by your PR. Production stays `SBP_PLATFORM_BUILD=off` until I say to run a test.

## Tests required

- Typed interview finished: `startClientDemo` called once with that understanding.
- Call finished: the same.
- A repeated final turn, or the webhook delivered twice: no second start.
- `startClientDemo` throws or refuses: the client's response is unchanged.
- Sweep: retries what it should, never `too_thin`, stops at the attempt limit, ignores old intakes.
- Admin view: every state, including failed and refused.

## Known limits to tell me about, not to fix here

- The demo is built from the interview and the written form. Our company research is not fed into it yet.
- All client projects are held under one internal enrollment. Do not create a student account for a client.

One PR, with a Basecamp ticket. When CI is green, give me the PR and ticket links. After I merge and it is deployed, we turn it on together and run one test intake as a made-up company.
