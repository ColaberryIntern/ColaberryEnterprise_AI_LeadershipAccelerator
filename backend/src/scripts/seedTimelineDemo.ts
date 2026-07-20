/**
 * Demo seed for the Timeline Engine dev stack — NOT for production.
 * Creates a self-contained demo cohort + enrollment + a spread of published
 * Timeline Cards across every bucket/type so /portal/classroom renders a real,
 * varied feed. Idempotent (findOrCreate by natural key). Points are pulled from
 * the type registry so the XP chips show.
 *
 * Run inside the classroom-be container:
 *   npx ts-node src/scripts/seedTimelineDemo.ts
 */
import Cohort from '../models/Cohort';
import Enrollment from '../models/Enrollment';
import TimelineCard from '../models/TimelineCard';
import { resolve as resolveType } from '../services/timeline/typeRegistry';

const DEMO_COHORT = 'Timeline Demo Cohort';
const DEMO_EMAIL = 'demo+timeline@colaberry.com';
const DEMO_TOKEN = '11111111-1111-1111-1111-111111111111';

interface CardSpec { type: string; title: string; subtitle?: string; week: number; }
const CARDS: CardSpec[] = [
  { type: 'announcement', title: 'Welcome to the AI Systems Architect Accelerator', subtitle: 'Read this first — how your timeline works', week: 1 },
  { type: 'warmup', title: 'Warm-up: what is an AI system, really?', week: 1 },
  { type: 'overview', title: 'Overview: the Architect mindset', subtitle: 'Deterministic execution, agent-first design', week: 1 },
  { type: 'video', title: 'Video: anatomy of an AI operating system', week: 1 },
  { type: 'live_class', title: 'Live Class — Architecture Day', subtitle: 'Tuesday 1:30pm CT', week: 1 },
  { type: 'deep_dive', title: 'Deep Dive: context engineering', week: 1 },
  { type: 'knowledge_check', title: 'Knowledge Check: core concepts', week: 1 },
  { type: 'prompt_lab', title: 'Prompt Lab: your first system prompt', subtitle: 'Build + iterate with the mentor', week: 2 },
  { type: 'prompt_challenge', title: 'Prompt Challenge: constrain the model', week: 2 },
  { type: 'implementation_task', title: 'Implementation Task: ship a working endpoint', subtitle: 'GitHub-tracked, AI + instructor reviewed', week: 2 },
  { type: 'artifact_submission', title: 'Artifact: architecture decision record', week: 2 },
  { type: 'reflection', title: 'Reflection: what surprised you this week?', week: 2 },
  { type: 'demo', title: 'Demo Tuesday: present your build', week: 3 },
  { type: 'community_discussion', title: 'Community: share a win', week: 3 },
  { type: 'certification_exercise', title: 'Certification Exercise: design review', week: 3 },
  { type: 'milestone', title: 'Milestone: Practitioner unlocked', week: 3 },
];

async function main(): Promise<void> {
  // When SEED_COHORT_ID is set, seed the CARDS into that EXISTING cohort (e.g.
  // the live Founding Cohort, so the logged-in student's Classroom is populated).
  // Otherwise spin up a self-contained demo cohort + enrollment.
  const targetCohortId = process.env.SEED_COHORT_ID;
  const future = new Date(); future.setFullYear(future.getFullYear() + 1);
  let cohort: any;
  let enrollment: any = null;

  if (targetCohortId) {
    cohort = await Cohort.findByPk(targetCohortId);
    if (!cohort) throw new Error(`SEED_COHORT_ID ${targetCohortId} not found`);
  } else {
    [cohort] = await Cohort.findOrCreate({
      where: { name: DEMO_COHORT },
      defaults: {
        name: DEMO_COHORT, status: 'open', max_seats: 50, seats_taken: 0,
        start_date: '2026-07-13', core_day: 'Tuesday', core_time: '13:30',
        timezone: 'America/Chicago',
      } as any,
    });
    [enrollment] = await Enrollment.findOrCreate({
      where: { email: DEMO_EMAIL },
      defaults: {
        full_name: 'Timeline Demo Student',
        email: DEMO_EMAIL,
        company: 'Colaberry Demo',
        title: 'Student',
        cohort_id: cohort.id,
        portal_enabled: true,
        portal_token: DEMO_TOKEN,
        portal_token_expires_at: future,
        status: 'active',
        payment_status: 'paid',
      } as any,
    });
    // ensure token + cohort are current even if the row pre-existed
    await enrollment.update({ cohort_id: cohort.id, portal_enabled: true, portal_token: DEMO_TOKEN, portal_token_expires_at: future } as any);
  }

  let created = 0;
  for (let i = 0; i < CARDS.length; i++) {
    const spec = CARDS[i];
    const def = resolveType(spec.type);
    const points = def ? { learning: def.learning_xp, builder: def.builder_xp, community: def.community_xp } : {};
    const [, wasCreated] = await TimelineCard.findOrCreate({
      where: { cohort_id: cohort.id, type: spec.type, title: spec.title },
      defaults: {
        type: spec.type,
        title: spec.title,
        subtitle: spec.subtitle || null,
        week: spec.week,
        bucket: (def?.bucket || 'learn'),
        order: i,
        visibility: 'published',
        status: 'active',
        difficulty: (def?.difficulty || 'core'),
        estimated_time: def?.evidence_required ? 45 : 15,
        points,
        competencies: (def?.competencies || []).map((d) => ({ domain_id: d, weight: 1 })),
        cohort_id: cohort.id,
      } as any,
    });
    if (wasCreated) created += 1;
  }

  console.log(`[seedTimelineDemo] cohort=${cohort.id} enrollment=${enrollment?.id || '(existing cohort — no demo enrollment)'} cards +${created}/${CARDS.length}`);
  if (enrollment) console.log(`[seedTimelineDemo] LOGIN: /portal/verify?token=${DEMO_TOKEN}`);
  process.exit(0);
}

main().catch((e) => { console.error('[seedTimelineDemo] failed:', e); process.exit(1); });
