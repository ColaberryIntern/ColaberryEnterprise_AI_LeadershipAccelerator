import { Op } from 'sequelize';
import { GrowthJourneyClassification, GrowthJourneyProfile } from '../../models';

/**
 * The Growth Journey dimension on the Marketing Operations graph (Phase 4 T411).
 *
 * ─── ONE READ PER BUILD, NOT PER NODE ───────────────────────────────────────
 *
 * Two grouped queries over the whole population (the latest classification per
 * lead, the newest profile per lead), assembled into a map the path builder
 * reads while it assembles its records. The graph builds 7 layers and dozens of
 * nodes from the same path list; a per-node lookup would multiply these two
 * reads by the node count for an answer that cannot change between nodes.
 *
 * ─── A LEAD WITH NO CLASSIFICATION IS KEPT, AS `null` ───────────────────────
 *
 * The journey is a DIMENSION, not a population: the graph's leads are the
 * leads, classified or not. An unclassified lead reads `journey: null` and
 * still appears in every node and edge it belongs to - dropping it would
 * quietly rescope every "of N leads" denominator on the page to the subset
 * Phase 2 has reached, which is the sort of silent narrowing the graph's brand
 * filter is careful to avoid.
 *
 * Nothing here decides or writes: stored rows only, read-only, and the shape
 * is ids and slugs - no email, no evidence, no candidate.
 */

export interface LeadJourneyFacts {
  /** The programme the latest classification named, e.g. `business-growth`. */
  program_slug: string | null;
  /** The primary offer-family path the latest classification chose, e.g. `workflow_automation`. */
  path_slug: string | null;
  /** The lifecycle state from the newest profile row, e.g. `EXPLORING_SOLUTIONS`. */
  state: string | null;
  /** The brand the journey rows are under - NOT the campaign's brand (the graph's brand filter keeps its own meaning). */
  brand_id: string | null;
  classified_at: Date | null;
}

export type LeadJourneyMap = Map<number, LeadJourneyFacts>;

/** The empty answer: every lead reads `journey: null`, which is what a brand with no Phase 2 rows looks like. */
export const NO_JOURNEYS: LeadJourneyMap = new Map();

type ClassificationRow = { lead_id: number; brand_id: string; journey_program_slug: string | null; primary_path: string | null; created_at: Date };
type ProfileRow = { lead_id: number; brand_id: string; state: string; state_entered_at: Date | null; updated_at: Date };

/**
 * The latest classification and the newest profile per lead, in two grouped reads.
 *
 * "Latest" is `created_at DESC` on an append-only table, so an override (a new
 * row pointing at the one it supersedes) wins over what it replaced. A lead
 * with rows under two brands keeps the newest, which is what the graph shows in
 * an unfiltered view; a brand-filtered graph filters the CAMPAIGN side, so this
 * does not pretend to answer per brand.
 *
 * Both reads tolerate a missing table (a deploy where Phase 2's tables are not
 * there yet returns no journeys rather than failing the whole graph) - the same
 * `.catch(() => [])` discipline every other read in the path builder uses.
 */
export async function loadLeadJourneyMap(leadIds: readonly number[]): Promise<LeadJourneyMap> {
  if (leadIds.length === 0) return NO_JOURNEYS;
  const where = { lead_id: { [Op.in]: [...leadIds] } };

  const [classifications, profiles] = await Promise.all([
    GrowthJourneyClassification.findAll({
      attributes: ['lead_id', 'brand_id', 'journey_program_slug', 'primary_path', 'created_at'],
      where,
      order: [['lead_id', 'ASC'], ['created_at', 'DESC']],
      raw: true,
    }).catch(() => []) as Promise<ClassificationRow[]>,
    GrowthJourneyProfile.findAll({
      attributes: ['lead_id', 'brand_id', 'state', 'state_entered_at', 'updated_at'],
      where,
      order: [['lead_id', 'ASC'], ['updated_at', 'DESC']],
      raw: true,
    }).catch(() => []) as Promise<ProfileRow[]>,
  ]);

  const map: LeadJourneyMap = new Map();
  // Ordered newest-first per lead, so the first row seen for a lead is the one that counts.
  for (const row of classifications) {
    if (row.lead_id === null || map.has(row.lead_id)) continue;
    map.set(row.lead_id, {
      program_slug: row.journey_program_slug ?? null,
      path_slug: row.primary_path ?? null,
      state: null,
      brand_id: row.brand_id ?? null,
      classified_at: row.created_at ?? null,
    });
  }
  const seenProfile = new Set<number>();
  for (const row of profiles) {
    if (row.lead_id === null || seenProfile.has(row.lead_id)) continue;
    seenProfile.add(row.lead_id);
    const existing = map.get(row.lead_id);
    if (existing) {
      existing.state = row.state ?? null;
    } else {
      // A profile without a classification: the lifecycle ran, the ladder has not. Still a journey fact.
      map.set(row.lead_id, { program_slug: null, path_slug: null, state: row.state ?? null, brand_id: row.brand_id ?? null, classified_at: null });
    }
  }
  return map;
}

export interface JourneyScopeTerms {
  programSlug?: string;
  pathSlug?: string;
  state?: string;
}

/** Is any journey term set? An empty scope means "no journey filter", as absent does. */
export function hasJourneyScope(terms: JourneyScopeTerms | undefined | null): boolean {
  return Boolean(terms && (terms.programSlug || terms.pathSlug || terms.state));
}

/**
 * Does one lead's journey satisfy the terms? An unclassified lead matches NO
 * term - it is kept in the unfiltered population and excluded from a filtered
 * one, because "leads on the business-growth programme" cannot include a lead
 * no classification names.
 */
export function journeyMatches(journey: LeadJourneyFacts | null, terms: JourneyScopeTerms): boolean {
  if (!journey) return false;
  if (terms.programSlug && journey.program_slug !== terms.programSlug) return false;
  if (terms.pathSlug && journey.path_slug !== terms.pathSlug) return false;
  if (terms.state && journey.state !== terms.state) return false;
  return true;
}
