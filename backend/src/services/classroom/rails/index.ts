import { ClassroomRailsResult, Rail, RailContext, RailSurface } from './types';
import { resolveEventsRail } from './eventsRail';
import { resolveProjectRail } from './projectRail';
import { resolveCommunityRail } from './communityRail';
import { resolveRoomsRail } from './roomsRail';
import { resolveCertPrepRail } from './certPrepRail';
import { resolvePortfolioRail } from './portfolioRail';
import { resolveTimelineRail } from './timelineRail';

export * from './types';

/**
 * Resolve every rail for a week, independently.
 *
 * ORDER IS THE RENDER ORDER, and it is a product decision rather than an
 * implementation detail. It runs roughly: what is happening soon, what you are
 * building, what your cohort is saying, where you can go and work, what you are
 * being measured on, what you have made, and where you are in the programme.
 * The frontend interleaves them between curriculum cards in this sequence and
 * never puts two rails back to back.
 *
 * ONE FAILING SURFACE DEGRADES ITSELF AND NOTHING ELSE. Every resolver runs
 * under `allSettled`; a rejection names its surface in `degraded` and drops
 * that rail. A student whose Rooms service is down still gets their week, their
 * project and their certification lane, and the failure is countable rather
 * than a blank space nobody can explain.
 *
 * WHICH RAILS APPEAR IS DECIDED BY THE RESOLVERS, NOT HERE. Each returns null
 * when it should be absent — no project, before the certification fence, Rooms
 * flag off, nothing published — and `omitIfEmpty` drops any rail that resolved
 * to zero tiles. There is deliberately no central "should this show" table,
 * because the condition and the data that answers it belong together.
 */

const RESOLVERS: { surface: RailSurface; run: (ctx: RailContext) => Promise<Rail | null> }[] = [
  { surface: 'events', run: (c) => resolveEventsRail(c) },
  { surface: 'project', run: resolveProjectRail },
  { surface: 'community', run: resolveCommunityRail },
  { surface: 'rooms', run: resolveRoomsRail },
  { surface: 'cert_prep', run: resolveCertPrepRail },
  { surface: 'portfolio', run: resolvePortfolioRail },
  { surface: 'timeline', run: resolveTimelineRail },
];

export async function getClassroomRails(ctx: RailContext): Promise<ClassroomRailsResult> {
  const settled = await Promise.allSettled(RESOLVERS.map((r) => r.run(ctx)));

  const rails: Rail[] = [];
  const degraded: RailSurface[] = [];

  settled.forEach((outcome, i) => {
    const surface = RESOLVERS[i].surface;
    if (outcome.status === 'rejected') {
      // Named, logged, and survivable. Never rethrown: the week renders.
      console.error('[classroom] rail failed', { surface, message: (outcome.reason as any)?.message });
      degraded.push(surface);
      return;
    }
    if (outcome.value) rails.push(outcome.value);
  });

  return { week: ctx.week, rails, degraded };
}
