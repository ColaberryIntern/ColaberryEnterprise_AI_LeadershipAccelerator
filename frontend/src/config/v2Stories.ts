/**
 * v2Stories.ts -- ILLUSTRATIVE FIXTURE. NOT A PRODUCTION DATA SOURCE.
 *
 * DEMOTED 2026-08-24 (spec section 26). `/stories` is API-backed: `StoriesV2`
 * reads `/api/public/case-studies` and renders only records a human published
 * through the Case Study OS. This module is retained as a dev/test fixture --
 * useful for asserting that none of its wording can reach a page again, and as
 * a worked example of the card format -- and it is imported by NOTHING in the
 * production path.
 *
 * That is enforced, not asked for. `pages/publicV2/__tests__/storiesV2Contract.test.ts`
 * greps every source file under `src/` and fails if any module outside a
 * `__tests__` or `__fixtures__` directory imports this one. If you find yourself
 * wanting to render these on a public surface, the answer is a published Case
 * Study record, not this file: every entry below is invented, and section 26 is
 * explicit that invented people, companies, quotations and metrics are never
 * seeded as verified production Case Studies.
 *
 * The entries carry `evidence: 'illustrative'` in spirit -- the page that used
 * them rendered a visible "Illustrative demo" badge on every card through the
 * same primitive the rest of the site uses -- and each one states the evidence a
 * real version would need before it could be published.
 *
 * WHY NOT COPY THE LIVE ONES
 * The live /case-studies page carries "Priya Nair shipped the Claims Triage
 * Copilot" and "Marcus Bell shipped the Maintenance Knowledge Agent" with
 * invented client quotations, presented as real. That is `casestudy.fabricated`,
 * DO_NOT_PUBLISH. The difference between those and these is not the content, it
 * is that these say what they are -- an unlabelled illustration is a fabrication
 * and a labelled one is a worked example.
 *
 * The names below are deliberately generic role descriptions rather than
 * invented people, so nothing here can be mistaken for a real person even if a
 * badge were ever dropped.
 */

import type { IconName } from '../components/publicV2/Icon';

export interface Story {
  readonly slug: string;
  /** Role rather than a person, until real, consented stories replace these. */
  readonly who: string;
  readonly sector: string;
  readonly icon: IconName;
  /** The one-line hook, in the format the live site uses. */
  readonly headline: string;
  readonly problem: string;
  readonly built: string;
  readonly result: string;
  /** What a REAL version of this card would have to carry before publishing. */
  readonly evidenceNeeded: string;
}

export const STORIES: readonly Story[] = [
  {
    slug: 'claims-triage',
    who: 'A claims operations lead',
    sector: 'Insurance',
    icon: 'clipboard',
    headline: 'Triage that used to take a morning now runs before standup',
    problem:
      'Every claim arrived as a PDF and a human decided where it went. The backlog grew ' +
      'faster than the team, and the decisions were inconsistent between reviewers.',
    built:
      'A triage assistant that reads the claim, proposes a route with its reasoning, and ' +
      'holds anything it is unsure about for a person. Built by the operations lead, not by ' +
      'a vendor.',
    result:
      'The queue clears before the morning stand-up, and every routing decision carries the ' +
      'reason it was made.',
    evidenceNeeded:
      'Before-and-after cycle time from the claims system, the reviewer who approved the ' +
      'build, and written consent from the customer to publish.',
  },
  {
    slug: 'maintenance-knowledge',
    who: 'A maintenance supervisor',
    sector: 'Manufacturing',
    icon: 'wrench',
    headline: 'Thirty years of fault knowledge, answerable in a sentence',
    problem:
      'The people who knew why a line failed were retiring, and the manuals did not carry ' +
      'what they knew. New technicians re-learned the same faults.',
    built:
      'A knowledge agent grounded in the maintenance logs and the manuals, answering in the ' +
      'technician’s own words and citing the log entry it drew from.',
    result:
      'Technicians reach an answer without waiting for the one person who remembers, and ' +
      'every answer is traceable to a record.',
    evidenceNeeded:
      'Mean-time-to-resolution before and after, the artifact record for the build, and ' +
      'consent from the plant.',
  },
  {
    slug: 'finance-close',
    who: 'A financial controller',
    sector: 'Finance',
    icon: 'gauge',
    headline: 'The month-end close stopped depending on one person',
    problem:
      'Reconciliation lived in one analyst’s spreadsheets and their head. Close slipped ' +
      'whenever they were away.',
    built:
      'A reconciliation assistant that proposes matches with its working shown, and escalates ' +
      'anything outside tolerance to a named approver.',
    result:
      'Close runs to the same calendar regardless of who is in, and every match has an audit ' +
      'trail.',
    evidenceNeeded:
      'Close-calendar variance before and after, the approval log, and consent to name the ' +
      'function even if the company stays anonymous.',
  },
];

/** Stated at the top of the page, not buried. */
export const STORIES_NOTICE =
  'These are worked examples of the format, not customers. Every card is labelled as an ' +
  'illustration, and each one lists the evidence a real version would have to carry before ' +
  'it could be published here.';
