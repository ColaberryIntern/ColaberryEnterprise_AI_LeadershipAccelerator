/**
 * v2Maturity.ts -- "From AI Aware to AI Organization".
 *
 * Carried over from the live site, where it is the clearest thing on the page:
 * five levels an organization climbs, each with what the platform measures at
 * that level. It is a FRAMEWORK, not a claim -- it describes how capability is
 * assessed, not an outcome anyone achieved -- so nothing here needs registry
 * gating.
 *
 * The `measures` line on each level is the part that earns the diagram. Without
 * it this is another maturity pyramid; with it, each level names the signal the
 * product actually captures, which is the argument the rest of the site makes.
 */

export interface MaturityLevel {
  readonly n: number;
  readonly name: string;
  readonly what: string;
  /** What the platform measures at this level. Ties the model to the product. */
  readonly measures: string;
}

export const MATURITY_LEVELS: readonly MaturityLevel[] = [
  {
    n: 1,
    name: 'AI Aware',
    what: 'People understand what AI can and cannot do.',
    measures: 'Baseline literacy across every department.',
  },
  {
    n: 2,
    name: 'AI Enabled',
    what: 'People use AI in their daily work.',
    measures: 'Daily active usage and adoption by team.',
  },
  {
    n: 3,
    name: 'AI Builders',
    what: 'People build working AI solutions.',
    measures: 'Automations shipped and hours saved.',
  },
  {
    n: 4,
    name: 'AI Architects',
    what: 'People design enterprise AI systems.',
    measures: 'Systems designed, governed and deployed.',
  },
  {
    n: 5,
    name: 'AI Organization',
    what: 'AI is part of every business process.',
    measures: 'AI-touched processes and governance org-wide.',
  },
];
