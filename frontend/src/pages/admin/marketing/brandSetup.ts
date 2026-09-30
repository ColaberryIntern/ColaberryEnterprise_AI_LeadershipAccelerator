/**
 * brandSetup - the tabs of a brand's setup, and what is still missing from it.
 *
 * WHY. Loomly puts everything about a calendar on ONE page with nine tabs, so setting a calendar
 * up is a task with an end. Ours was spread across four pages - channels on Brands, approvals in
 * the composer, campaign slugs under Campaigns, readiness in a panel - so it was a tour, and
 * nobody could tell when it was finished. This is the same page, and this module is the "what is
 * left" line at the top of it.
 *
 * Pure: the rules are decided here from plain counts, so "is this brand set up?" is a tested
 * function rather than something inferred by looking at four screens.
 */

export type BrandTabKey = 'channels' | 'domains' | 'approvals' | 'campaigns' | 'details';

export interface BrandTab {
  key: BrandTabKey;
  label: string;
  /** One line under the heading, saying what the tab is for. */
  hint: string;
}

export const BRAND_TABS: readonly BrandTab[] = [
  { key: 'channels', label: 'Channels', hint: 'The networks this brand posts to, and whether each one still works.' },
  { key: 'domains', label: 'Sending domains', hint: 'The domains this brand sends email from, and whether they are verified.' },
  { key: 'approvals', label: 'Approvals', hint: 'Posts for this brand waiting for someone to approve them.' },
  { key: 'campaigns', label: 'Campaigns', hint: 'The campaigns and tracked-link slugs posts can be attributed to.' },
  { key: 'details', label: 'Details', hint: 'The brand itself: its name, timezone and public address.' },
];

export function isBrandTab(value: string | null | undefined): value is BrandTabKey {
  return typeof value === 'string' && BRAND_TABS.some((t) => t.key === value);
}

/** Plain counts, so the rules below are testable without the page. */
export interface BrandSetupFacts {
  /** Live (non-revoked) channel accounts on this brand. */
  channelCount: number;
  /** Channels that are connected but failing or expiring. */
  channelsNeedingAttention: number;
  /** Sending domains recorded for this brand; null when readiness has not loaded. */
  domainCount: number | null;
  /** Domains that are fully verified. */
  verifiedDomainCount: number;
  /** Posts waiting for approval. Not a setup step - shown so the tab carries a number. */
  pendingApprovals: number;
}

export interface SetupStep {
  key: string;
  /** What is missing, as an instruction. */
  label: string;
  done: boolean;
  /** Which tab fixes it. */
  tab: BrandTabKey;
}

/**
 * What a brand still needs before it can publish, in the order someone would do it.
 *
 * Deliberately short. A checklist that lists everything a brand COULD have is a checklist nobody
 * finishes; these are the two things without which the product does not work, plus a warning when
 * a connection that exists has stopped working.
 */
export function setupSteps(facts: BrandSetupFacts): SetupStep[] {
  return [
    {
      key: 'channel',
      label: 'Connect a network to post to',
      done: facts.channelCount > 0,
      tab: 'channels',
    },
    {
      key: 'channel_health',
      label: 'Fix the connection that has stopped working',
      // Only a step when there is something to fix; a brand with healthy channels has finished it.
      done: facts.channelsNeedingAttention === 0,
      tab: 'channels',
    },
    {
      key: 'domain',
      label: 'Verify a sending domain for email',
      // Null means readiness has not loaded; not evidence of absence, so it is not "missing" yet.
      done: facts.domainCount === null ? true : facts.verifiedDomainCount > 0,
      tab: 'domains',
    },
  ];
}

/** The line at the top of the page. Says what is left, or that nothing is. */
export function setupSummary(facts: BrandSetupFacts): { done: boolean; text: string } {
  const outstanding = setupSteps(facts).filter((s) => !s.done);
  if (outstanding.length === 0) {
    return { done: true, text: 'This brand is set up: it has a working connection and a verified sending domain.' };
  }
  const first = outstanding[0];
  return {
    done: false,
    text: outstanding.length === 1
      ? `One thing left: ${first.label.toLowerCase()}.`
      : `${outstanding.length} things left, starting with: ${first.label.toLowerCase()}.`,
  };
}
