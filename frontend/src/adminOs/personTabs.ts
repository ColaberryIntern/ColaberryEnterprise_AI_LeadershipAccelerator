import type { Profile } from './personTypes';

/**
 * Which tabs this person's payload earns — as a pure function.
 *
 * ── WHY THIS IS NOT IN THE PAGE ─────────────────────────────────────────────
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212). It was a 104-line
 * `useMemo`, which breached CLAUDE.md's 100-line hard function ceiling inside a
 * 1,076-line file that breached the 500-line hard file ceiling. The rule is that
 * the next change to an oversize file splits it before adding new code, and T212
 * adds a panel.
 *
 * The move also makes it testable. The body never touched a setter, never
 * rendered, and read only three values, so it was already a pure function of
 * `(profile, tempHistoryCount, journeyTouchpoints)` — it just happened to live
 * inside a component, where it needed a DOM and a mocked API client to exercise.
 * Nothing about its behaviour changed in the move; the tab ORDER below is the
 * push order it already had, which is the nav display order and deliberately
 * not the alphabetical or declaration order.
 *
 * ── THE GATE IS THE PERMISSION MODEL, AND THE TWO ABSENCES DIFFER ───────────
 *
 * A tab exists only if the API actually sent its panel. Per `personTypes`, an
 * ABSENT key means "your role may not see this" and a NULL value means
 * "permitted, but this person has none". The two are different sentences and the
 * reader needs both, so:
 *
 *   - panels gated `!== undefined` show the tab whenever the caller MAY see it,
 *     and the tab itself then says the person has none;
 *   - panels gated on truthiness collapse both absences into a hidden tab.
 *
 * `explorerScore` is gated `!== undefined` for exactly that reason. A free
 * Explorer with no snapshot yet must still get the tab, saying "not scored" —
 * if the tab vanished, an unscored person would be indistinguishable from one
 * whose role withheld the panel, and `withheldPanels` already names the latter.
 *
 * This file introduces NO permission logic of its own. It reads the shape of the
 * payload the server chose to send; it never consults a role, a section or a
 * flag. The authority stays in `personProfileService.mayReadPanel`.
 */

export type TabKey = 'timeline' | 'journey' | 'acquisition' | 'notes' | 'strategy'
  | 'communications' | 'class' | 'work' | 'account' | 'growth'
  | 'engagement' | 'learning' | 'billing' | 'activity' | 'trust' | 'explorer' | 'readiness';

export interface PersonTab {
  key: TabKey;
  label: string;
  count?: number;
}

/**
 * How much of the acquisition record is actually filled in.
 *
 * A lead captured from a one-field form and one from a full brief request are
 * different objects, and the count says which this is. `leadScoreMax` is
 * excluded because it is a constant the server sends, not evidence about the
 * person.
 */
function filledAcquisitionFields(acq: Profile['acquisition']): number | undefined {
  if (!acq) return undefined;
  return Object.entries(acq).filter(
    ([k, v]) => k !== 'leadScoreMax' && v !== null && v !== undefined && v !== '',
  ).length;
}

export function buildPersonTabs(
  profile: Profile | null,
  tempHistoryCount: number | null,
  journeyTouchpoints: number | null,
): PersonTab[] {
  if (!profile) return [];
  const t: PersonTab[] = [];

  if (profile.timeline !== undefined) {
    t.push({ key: 'timeline', label: 'Timeline', count: profile.timeline.length });
  }
  if (profile.acquisition !== undefined) {
    t.push({
      key: 'acquisition',
      label: 'Acquisition',
      count: filledAcquisitionFields(profile.acquisition),
    });
  }
  // Journey needs a lead: the analysis is built from lead touchpoints. The count
  // is TOUCHPOINTS, the same figure the campaign modal shows — the Journey
  // card's own number, not a sum assembled here. An earlier version added
  // sessions + page events + emails + campaigns and read 2 against a card
  // showing 15: two definitions of one word on one screen.
  if (profile.acquisition?.leadId) {
    t.push({ key: 'journey', label: 'Journey', count: journeyTouchpoints ?? undefined });
  }
  // The Lead page's Activity tab, moved across whole.
  if (profile.acquisition?.leadId) {
    t.push({ key: 'notes', label: 'Notes & activity', count: tempHistoryCount ?? undefined });
  }
  // Not gated on a lead: a student has no lead record and is precisely who the
  // coaching brief is written for.
  t.push({ key: 'strategy', label: 'Strategy prep' });
  if (profile.communications) {
    t.push({
      key: 'communications',
      label: 'Communications',
      count: profile.communications.totalMessages,
    });
  }
  // T212: Engagement / Intent / Fit. Gated on PRESENCE, not truthiness — see
  // the docblock. No count: a count of 0 beside a null panel is the precise
  // confusion this panel exists to avoid.
  if (profile.explorerScore !== undefined) {
    t.push({ key: 'explorer', label: 'Explorer score' });
  }
  // M26: the Sales Readiness Score. Gated on PRESENCE for the same reason as the panel above,
  // and with no count: the number people want is the score, and a factor count beside it would
  // read as the score. The tab itself carries the per-factor explanation, because a score without
  // its reasons is a number a rep cannot argue with or act on.
  if (profile.salesReadiness !== undefined) {
    t.push({ key: 'readiness', label: 'Sales readiness' });
  }
  if (profile.appointments !== undefined || profile.automation !== undefined) {
    t.push({
      key: 'engagement',
      label: 'Appointments & automation',
      count: (profile.appointments?.length ?? 0) + (profile.automation?.length ?? 0),
    });
  }
  if (profile.learning !== undefined) {
    t.push({ key: 'learning', label: 'Enrolments', count: profile.learning.length });
  }
  // The programme surfaces, added 2026-09-09. Each appears only when the API
  // sent its panel, so a caller without the programme sections never sees the
  // tab — the same rule every other tab here follows.
  if (profile.classActivity || profile.curriculum) {
    t.push({
      key: 'class',
      label: 'Class & curriculum',
      // Cards they COMPLETED plus register entries and written work.
      // `curriculum.total` counts cards available to them — 1,131 for a learner
      // who has finished 10 — so it promised a full report and opened on an
      // almost empty one.
      count: (profile.curriculum?.completed ?? 0)
        + (profile.classActivity?.attendanceTotal ?? 0)
        + (profile.curriculum?.reflections ?? 0)
        + (profile.curriculum?.surveys ?? 0) || undefined,
    });
  }
  if (profile.work) {
    t.push({
      key: 'work',
      label: 'Projects & portfolio',
      count: profile.work.projects.length + profile.work.caseStudies.length
        + profile.work.capstones.length,
    });
  }
  if (profile.account || profile.billingDetail) {
    t.push({
      key: 'account',
      label: 'Account & subscription',
      count: profile.billingDetail?.subscriptions.length ?? undefined,
    });
  }
  if (profile.skills || profile.mentor || profile.content || profile.community
      || profile.profileContext) {
    t.push({
      key: 'growth',
      label: 'Skills & context',
      count: (profile.skills?.skillEvidence ?? 0)
        + (profile.mentor?.mentorTurns ?? 0)
        + (profile.content?.podcasts ?? 0) + (profile.content?.blogPosts ?? 0)
        + (profile.content?.videos ?? 0) || undefined,
    });
  }
  if (profile.billing !== undefined) {
    t.push({ key: 'billing', label: 'Payment record', count: profile.billing.length });
  }
  if (profile.engagement !== undefined) {
    t.push({
      key: 'activity',
      label: 'Site activity',
      count: profile.engagement?.sessions ?? undefined,
    });
  }
  // Last, because it is about the data rather than the person — but present for
  // everyone, because "how much of this should I believe" always applies.
  if (profile.trust) {
    t.push({
      key: 'trust',
      label: 'Data & trust',
      count: profile.trust.gaps.length + (profile.history?.enrolments.length ?? 0),
    });
  }
  return t;
}
