import { getCertAvailability } from '../../certPrep/certAvailabilityService';
import { computeReadiness } from '../../certPrep/certReadinessService';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';
import { ART } from './railArt';

/**
 * The certification lane, from Week 7.
 *
 * THE FENCE DECIDES, NOT THE WEEK NUMBER IN THE URL. `getCertAvailability`
 * derives the week from the enrollment's own cohort start date and fails
 * CLOSED — an error reads as "not yet" rather than accidentally opening the
 * lane. The rail is absent, not locked-looking, before the fence opens: a
 * greyed-out certification section in Week 2 is an advertisement for something
 * a student cannot act on for five weeks.
 *
 * NOTHING HERE PROMISES A SCORE. Every label is a readiness estimate on the
 * same axis as the exam, never a predicted Anthropic result. That constraint
 * lives in certScoring and is repeated here because this is a student-facing
 * surface and the wording is the product.
 *
 * The weak-domain drill only appears when a domain is measurably weakest among
 * domains the student has ANSWERED. The weakest unanswered domain is just the
 * one they have not reached yet, and drilling it would be noise.
 */

export async function resolveCertPrepRail(ctx: RailContext): Promise<Rail | null> {
  const availability = await getCertAvailability(ctx.enrollmentId);
  if (!availability?.available) return null;      // student not past the fence

  /**
   * AND the week being LOOKED AT must be at or past the fence.
   *
   * The first version checked only the student's eligibility, so a Week 9
   * student paging back to Week 1 saw the certification rail sitting in Week 1 —
   * which reads as "certification starts in week one" to anybody who does not
   * already know the programme. Availability answers "may this student practise
   * at all"; it does not answer "does this belong on the page in front of me".
   *
   * Both conditions, and they are genuinely different: eligibility is about the
   * person, the week gate is about the page. `startWeek` is the track's own
   * `availability_start_week` rather than a 7 written here, so moving the fence
   * moves both together.
   */
  const startWeek = availability.startWeek;
  if (startWeek != null && ctx.week < startWeek) return null;

  const readiness = await computeReadiness(ctx.enrollmentId).catch(() => null);
  const measured = readiness && typeof (readiness as any).readiness_scaled === 'number'
    ? (readiness as any).readiness_scaled as number
    : null;
  const answered = Number((readiness as any)?.items_answered ?? 0);

  const tiles: RailTile[] = [];

  /**
   * EVERY TAB CERT PREP HAS, not only the sittings.
   *
   * The first version offered a diagnostic, a drill and a mock -- the Practice
   * and Mock Exams tabs. Cert Prep has four: Domain Map, Practice, Mock Exams
   * and Build Evidence. A rail that shows half a surface teaches a student that
   * the surface is half that size, and Build Evidence is the half that connects
   * everything they have BUILT to the exam, which is the part they would never
   * guess at from the name.
   */

  if (answered === 0) {
    tiles.push({
      id: 'cert-diagnostic',
      title: 'Take the baseline diagnostic',
      detail: 'Sets your first readiness estimate. Free to repeat.',
      meta: '15 items · 25 minutes',
      image_url: ART.diagnostic,
      glyph: '\u{1F3AF}',
      stamp: 'START HERE',
      action: { label: 'Start diagnostic', href: '/portal/cert-prep?start=diagnostic', kind: 'primary' },
      featured: true,
    });
  }

  const weakest = (readiness as any)?.weakest_domain ?? null;
  if (weakest?.domain_id) {
    tiles.push({
      id: `cert-drill-${weakest.domain_id}`,
      title: `${weakest.label ?? weakest.domain_id} drill`,
      detail: 'Untimed practice on your weakest answered domain.',
      meta: weakest.weight_pct ? `${weakest.weight_pct}% of the exam` : null,
      image_url: ART.drill,
      glyph: '\u{1F4CF}',
      stamp: '10 ITEMS',
      action: {
        label: 'Start drill',
        href: `/portal/cert-prep?start=practice&domain=${encodeURIComponent(weakest.domain_id)}`,
        kind: 'primary',
      },
      featured: tiles.length === 0,
    });
  } else if (answered > 0) {
    tiles.push({
      id: 'cert-practice',
      title: 'Practice set',
      detail: 'A short untimed set across the domains you have sampled.',
      meta: '10 items · untimed',
      image_url: ART.drill,
      glyph: '\u{1F4CF}',
      stamp: 'PRACTICE',
      action: { label: 'Start practice', href: '/portal/cert-prep?tab=practice', kind: 'primary' },
    });
  }

  tiles.push({
    id: 'cert-mock',
    title: 'Full mock exam',
    detail: 'The real shape, end to end.',
    meta: '60 items · 120 minutes',
    image_url: ART.mock,
    glyph: '\u{23F3}',
    stamp: '60 ITEMS',
    action: { label: 'Begin mock', href: '/portal/cert-prep?tab=mocks', kind: 'quiet' },
  });

  tiles.push({
    id: 'cert-domains',
    title: 'Domain map',
    detail: 'Where you are strong and where you are thin, by exam domain.',
    meta: '5 domains · 30 objectives',
    image_url: ART.domainMap,
    glyph: '\u{1F5FA}',
    stamp: 'DOMAIN MAP',
    action: { label: 'Open the map', href: '/portal/cert-prep?tab=domains', kind: 'quiet' },
  });

  tiles.push({
    id: 'cert-evidence',
    title: 'Build evidence',
    detail: 'What you have built already, matched to the objectives it proves.',
    meta: 'verified evidence counts toward readiness',
    image_url: ART.evidence,
    glyph: '\u{1F5C2}',
    stamp: 'EVIDENCE',
    action: { label: 'Review evidence', href: '/portal/cert-prep?tab=evidence', kind: 'quiet' },
  });

  return omitIfEmpty({
    surface: 'cert_prep',
    label: 'Certification prep',
    count_label: measured === null ? 'readiness not measured yet' : `readiness ${Math.round(measured)}`,
    href: '/portal/cert-prep',
    tiles,
  });
}
