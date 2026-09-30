import type { ScoreFactor } from '../governor/types';
import { normalizeTitleCategory } from '../../leadTitleCategory';
import type { ScoreDimensionSpec } from './dimensions';
import { clamp, type Scored } from './scored';
import type { SubjectSignals } from './scoreVector';

/**
 * The three business dimensions T407 sourced: engagement and friction from the
 * counted `interaction_outcomes` and `appointments` rows, authority from
 * `leads.title`. Pure, like the vector they plug into; kept in their own module
 * because `scoreVector.ts` sits under CLAUDE.md's 500-line ceiling only without
 * them. The same no-zero-default rule applies here, and the same text scan reads
 * this file (`newSources.test.ts`).
 */
/**
 * A count is a MEASUREMENT when the caller read it - zero replies is a fact
 * about a lead nobody has answered - and a GAP when the caller could not (no
 * lead to count for, or the tables unavailable). `null` in, `null` out, with
 * the gap named; numbers in, a number out, zero included. No default anywhere.
 */

/** The counterparty's side of the relationship: what THEY did, capped at the dimension. */
export function scoreRelationshipEngagement(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const inbound = signals.inbound;
  const appointments = signals.appointments;
  if (!inbound || !appointments) return { value: null, factors: [], nullReason: 'counts_unavailable' };
  const factors: ScoreFactor[] = [];
  const add = (factor: string, count: number, each: number, noun: string) => {
    if (count > 0) factors.push({ factor, label: `${count} ${noun}`, points: count * each });
  };
  add('replied', inbound.replied, 25, 'replies');
  add('booked_meeting', inbound.booked_meeting, 30, 'meetings booked');
  add('answered', inbound.answered, 20, 'calls answered');
  add('appointments_completed', appointments.completed, 30, 'appointments completed');
  add('appointments_scheduled', appointments.scheduled, 15, 'appointments scheduled');
  if (factors.length === 0) {
    factors.push({ factor: 'no_engagement', label: 'no reply, booking, answer or appointment recorded', points: 0, detail: 'measured: the counts were read and are zero' });
  }
  return { value: clamp(factors.reduce((sum, f) => sum + f.points, 0), spec.cap), factors };
}

/** Deal risk from what THEY did not do: declines, silence, no-shows, cancellations. Higher is worse (`inverse`). */
export function scoreFrictionRisk(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const inbound = signals.inbound;
  const appointments = signals.appointments;
  if (!inbound || !appointments) return { value: null, factors: [], nullReason: 'counts_unavailable' };
  const factors: ScoreFactor[] = [];
  const add = (factor: string, count: number, each: number, noun: string) => {
    if (count > 0) factors.push({ factor, label: `${count} ${noun}`, points: count * each });
  };
  add('declined', inbound.declined, 30, 'declines');
  add('no_response', inbound.no_response, 15, 'sequences ended with no response');
  add('no_show', appointments.no_show, 20, 'appointments missed');
  add('cancelled', appointments.cancelled, 15, 'appointments cancelled');
  if (factors.length === 0) {
    factors.push({ factor: 'no_friction', label: 'no decline, silence, no-show or cancellation recorded', points: 0, detail: 'measured: the counts were read and are zero' });
  }
  return { value: clamp(factors.reduce((sum, f) => sum + f.points, 0), spec.cap), factors };
}

/**
 * Seniority from `leads.title`, through the SAME rule `interactionService` uses
 * for its aggregations (`normalizeTitleCategory`, lifted to a pure module in
 * T407 - one definition, no copy). A lead with no title is `unknown` and scores
 * the floor: that is a measurement of a person whose seniority nobody recorded,
 * not a gap - the gap is having no lead at all.
 */
export const AUTHORITY_POINTS: Readonly<Record<string, number>> = Object.freeze({
  'C-Suite': 100,
  Founder: 90,
  SVP: 90,
  VP: 80,
  Director: 65,
  'Sr. Manager': 50,
  Manager: 40,
  'Senior IC': 25,
  IC: 15,
  unknown: 0,
});

/** Placeholders an import writes where a title should be; they read as no title, never as a rank. */
const PLACEHOLDER_TITLES: ReadonlySet<string> = new Set(['unknown', 'n/a', 'na', 'none', 'null', '-', '']);

export function scoreAuthority(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const lead = signals.lead;
  if (!lead) return { value: null, factors: [] };
  const title = typeof lead.title === 'string' && !PLACEHOLDER_TITLES.has(lead.title.trim().toLowerCase()) ? lead.title : undefined;
  const category = normalizeTitleCategory(title);
  const points = category in AUTHORITY_POINTS ? AUTHORITY_POINTS[category] : AUTHORITY_POINTS.unknown;
  return {
    value: clamp(points, spec.cap),
    factors: [{ factor: 'title_category', label: `title reads as ${category}`, points, detail: 'normalizeTitleCategory over leads.title; unknown is the floor, never a gap' }],
  };
}
