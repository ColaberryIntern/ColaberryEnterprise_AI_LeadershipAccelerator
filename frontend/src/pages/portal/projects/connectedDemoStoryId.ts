/**
 * The Connected Demo story id, in one place on the frontend.
 *
 * The backend's copy is `backend/src/services/sbp/connectedDemoStory.ts`, and the frontend cannot
 * import across the workspace boundary. So this is a second copy, which is exactly the kind of
 * thing that drifts; keeping it in its own module means there is ONE place to correct rather than
 * one string typed into every component that cares. `demoPrepGuide.ts` and
 * `DemoEvidencePanel.ts`'s `DEMO_DAY_STORY_ID` already do this for their ids.
 */
export const CONNECTED_DEMO_STORY_ID = 'STORY-900';
