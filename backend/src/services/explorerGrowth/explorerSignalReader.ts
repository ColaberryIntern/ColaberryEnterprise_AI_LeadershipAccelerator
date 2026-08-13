import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ExplorerJourneyProfile } from '../../models';
import {
  EXPLORER_SIGNAL_DEFINITIONS,
  getSignalDefinition,
  decayedWeight,
  highestTier,
} from './explorerSignalDefinitions';
import type {
  ExplorerSignalBand,
  ExplorerSignalBandTotal,
  ExplorerSignalReadout,
} from '../../types/explorerGrowth';

/**
 * Explorer Growth OS — unified signal reader. Plan EPIC 2 T004, §4.2, §6.
 *
 * Reads every captured signal for one learner, decays each occurrence by its
 * own half-life, caps each signal's total, and returns per-band roll-ups.
 *
 * TWO KEYSPACES, ONE LEARNER. Learning data is enrollment-keyed (UUID); campaign
 * and web data is lead-keyed (INTEGER). They are joined through
 * explorer_journey_profiles.lead_id — the durable bridge built in EPIC 1 — NOT by
 * re-deriving email at read time. A learner with no bridged lead still returns
 * their learner-side bands rather than throwing: the bridge is nullable by
 * design, and a missing CRM record is a reportable condition, not an error.
 *
 * RETURNS RAW CONTRIBUTIONS, NOT A 0-100 SCORE. Normalising to E/I/F is EPIC 3's
 * job; doing it here would split the scoring rules across two epics and leave
 * neither able to explain a number on its own.
 *
 * Every query is parameterised and scoped to one learner.
 */

interface RawOccurrence {
  signal: string;
  occurred_at: Date;
}

/**
 * One query per source table, each returning (signal, occurred_at) rows.
 *
 * Written as raw SQL rather than through the models because these are pure
 * read-only aggregations across ten heterogeneous tables — the ORM would add a
 * model import graph and no safety. `sequelize.query` with `replacements` is
 * parameterised; nothing is interpolated.
 */
const LEARNER_SOURCES: Record<string, string> = {
  // EPIC 2's own stream.
  student_navigation_events: `
    SELECT event_type AS signal, created_at AS occurred_at
    FROM student_navigation_events WHERE enrollment_id = :enrollmentId`,

  timeline_card_progress: `
    SELECT 'card_completed' AS signal, COALESCE(completed_at, started_at) AS occurred_at
    FROM timeline_card_progress
    WHERE enrollment_id = :enrollmentId AND status = 'completed'
      AND COALESCE(completed_at, started_at) IS NOT NULL`,

  // served vs interacted is the single best engagement discriminator we have.
  today_feed_impressions: `
    SELECT CASE WHEN interacted_at IS NOT NULL THEN 'first_card_interacted'
                ELSE 'first_card_served' END AS signal,
           COALESCE(interacted_at, served_at) AS occurred_at
    FROM today_feed_impressions WHERE enrollment_id = :enrollmentId`,

  student_points_events: `
    SELECT CASE
             WHEN event_type = 'daily_streak' THEN 'streak_day'
             WHEN event_type LIKE 'open_house_rsvp%' THEN 'event_registered'
             WHEN event_type LIKE 'open_house_attended%' THEN 'event_attended'
             ELSE 'points_earned' END AS signal,
           created_at AS occurred_at
    FROM student_points_events WHERE enrollment_id = :enrollmentId`,

  community_contributions: `
    SELECT 'community_contribution' AS signal, created_at AS occurred_at
    FROM community_contributions WHERE enrollment_id = :enrollmentId`,

  attendance_records: `
    SELECT 'live_session_attended' AS signal, created_at AS occurred_at
    FROM attendance_records WHERE enrollment_id = :enrollmentId AND status = 'present'`,

  assignment_submissions: `
    SELECT 'assignment_submitted' AS signal, submitted_at AS occurred_at
    FROM assignment_submissions
    WHERE enrollment_id = :enrollmentId AND submitted_at IS NOT NULL`,
};

/**
 * Lead-keyed sources. Reachable only once the identity bridge has resolved.
 * page_events.lead_id exists because of EPIC 1's D1 fix.
 */
const LEAD_SOURCES: Record<string, string> = {
  page_events: `
    SELECT CASE
             WHEN event_type = 'form_start' THEN 'enrollment_form_started'
             WHEN event_type = 'payment_attempt' THEN 'payment_attempted_no_completion'
             WHEN event_type = 'booking_modal_opened' THEN 'booking_modal_opened'
             WHEN event_type = 'booking_date_selected' THEN 'booking_date_selected'
             WHEN event_type = 'cta_click' THEN 'enrollment_cta_click'
             WHEN page_category = 'pricing' THEN 'pricing_page_view'
             WHEN page_category = 'program' THEN 'accelerator_page_view'
             ELSE NULL END AS signal,
           timestamp AS occurred_at
    FROM page_events WHERE lead_id = :leadId`,

  interaction_outcomes: `
    SELECT CASE
             WHEN outcome = 'clicked' THEN 'email_link_click'
             WHEN outcome = 'replied' THEN 'reply_interested'
             WHEN outcome = 'bounced' THEN 'email_hard_bounce'
             ELSE NULL END AS signal,
           created_at AS occurred_at
    FROM interaction_outcomes WHERE lead_id = :leadId`,
};

/** Run one source query, swallowing its failure so one bad table cannot blind the rest. */
async function runSource(
  sql: string,
  replacements: Record<string, unknown>,
  label: string,
): Promise<RawOccurrence[]> {
  try {
    const rows = await sequelize.query<RawOccurrence>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });
    return rows.filter((r) => r && r.signal && r.occurred_at);
  } catch (err: any) {
    // A reader that throws because one source table is unavailable would take
    // the whole learner's profile dark. Degrade per-source instead, and say so.
    console.warn(
      JSON.stringify({
        event: 'explorer.signal.source_read_failed',
        service: 'explorer-growth',
        level: 'warn',
        outcome: 'partial',
        error_class: err?.name || 'SourceReadError',
        source: label,
        detail: err?.message,
      }),
    );
    return [];
  }
}

function emptyBand(band: ExplorerSignalBand): ExplorerSignalBandTotal {
  return { band, total: 0, signals: [] };
}

/**
 * Read, decay, cap and group every captured signal for one learner.
 *
 * @param asOf point in time to decay against. Injectable so decay is testable
 *             deterministically rather than against the wall clock.
 */
export async function readLearnerSignals(
  enrollmentId: string,
  options: { asOf?: Date } = {},
): Promise<ExplorerSignalReadout> {
  const asOf = options.asOf ?? new Date();

  const profile = (await ExplorerJourneyProfile.findByPk(enrollmentId, {
    attributes: ['enrollment_id', 'lead_id'],
  })) as { lead_id: number | null } | null;
  const leadId = profile?.lead_id ?? null;

  const occurrences: RawOccurrence[] = [];

  for (const [label, sql] of Object.entries(LEARNER_SOURCES)) {
    occurrences.push(...(await runSource(sql, { enrollmentId }, label)));
  }

  // Only reachable once the bridge resolves. An unbridged learner keeps their
  // learner-side bands rather than failing.
  if (leadId !== null) {
    for (const [label, sql] of Object.entries(LEAD_SOURCES)) {
      occurrences.push(...(await runSource(sql, { leadId }, label)));
    }
  }

  // Decay each occurrence, sum per signal, then apply the per-signal cap.
  const perSignal = new Map<string, { occurrences: number; raw: number }>();
  for (const o of occurrences) {
    if (!getSignalDefinition(o.signal)) continue; // unmapped row — ignored, not counted at 0
    const entry = perSignal.get(o.signal) ?? { occurrences: 0, raw: 0 };
    entry.occurrences += 1;
    entry.raw += decayedWeight(o.signal, new Date(o.occurred_at), asOf);
    perSignal.set(o.signal, entry);
  }

  const bands: Record<ExplorerSignalBand, ExplorerSignalBandTotal> = {
    engagement: emptyBand('engagement'),
    intent: emptyBand('intent'),
    friction: emptyBand('friction'),
  };

  for (const [signal, entry] of perSignal) {
    const def = EXPLORER_SIGNAL_DEFINITIONS[signal];
    const contribution = Math.min(entry.raw, def.cap);
    const band = bands[def.band];
    band.signals.push({ signal, occurrences: entry.occurrences, contribution });
    band.total += contribution;
  }

  for (const band of Object.values(bands)) {
    band.signals.sort((a, b) => b.contribution - a.contribution);
  }

  return {
    enrollment_id: enrollmentId,
    lead_id: leadId,
    asOf,
    bands,
    // Drives the HIGH_INTENT gate: readiness needs a tier-3+ signal, never an
    // accumulation of tier-1 views.
    highestIntentTier: highestTier([...perSignal.keys()]),
  };
}
