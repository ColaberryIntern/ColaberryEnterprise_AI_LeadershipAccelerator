/**
 * C8.4 - the commercial funnel, defined once so it is counted the same way every week.
 *
 * THE FAILURE MODE THIS FILE EXISTS TO PREVENT, in the ticket's own words: "counting a
 * stage on intent rather than evidence. Each stage needs an evidenced trigger." The
 * measure of success is also the ticket's: "two people independently count the pipeline
 * the same way." Both push the same direction: every stage below names the exact table,
 * column and value that fires it, and a stage with no such source says so instead of
 * being quietly inferred from a neighboring one.
 *
 * THE DECISION MOST LIKELY TO BE ARGUED WITH, flagged because the ticket says the stage
 * definitions are what Ali must personally review:
 *
 *   An EMAIL OPEN IS NOT ENGAGEMENT, and neither is a click.
 *
 * Measured on production 2026-10-23: 13,892 opens, 5,837 clicks, 15 email replies, 10 SMS
 * replies and 22 answered calls. Opens are fired by a tracking pixel, and Apple Mail
 * Privacy Protection plus corporate pre-fetchers load that pixel with no human involved.
 * Link scanners (Proofpoint, Mimecast, Defender) follow links for the same reason, so a
 * click is also machine-reachable. A reply and an answered call are not: both require a
 * person to produce something aimed at us.
 *
 * So Engaged is replied-or-answered, which makes it 47 events rather than 19,729. That is
 * a 400x difference and it is the entire point: the larger number is mostly machines, and
 * a funnel that reports it would have us celebrating mail servers. `clicked` is recorded
 * below as a declared-excluded signal with its count, so the decision is visible and Ali
 * can reverse it in one place if he disagrees.
 */

/** How much the evidence for a stage can actually be trusted today. */
export type EvidenceState =
  | 'live'          // the source exists, holds data, and means what the stage means
  | 'empty'         // the source exists and is correctly shaped, but has no rows yet
  | 'undeployed'    // the source ships in merged code that production has not taken yet
  | 'absent';       // nothing of the right shape exists anywhere

export interface FunnelStage {
  /** 1-based position. A funnel is ordered; the number is part of the definition. */
  n: number;
  key: string;
  label: string;
  /** What being at this stage MEANS, in a sentence two people would read the same way. */
  definition: string;
  /** The exact table, column and value that fires it. Never a feeling. */
  trigger: string;
  source: string | null;
  evidence: EvidenceState;
  /** Why this trigger and not a looser neighboring one. */
  rationale: string;
  /** A signal deliberately NOT counted here, and the reason. */
  excludes?: string;
}

export const FUNNEL_STAGES: readonly FunnelStage[] = [
  {
    n: 1,
    key: 'target',
    label: 'Target',
    definition: 'An account we have decided to pursue. A decision, not a discovery.',
    trigger: "organizations.organization_type = 'strategic_account'",
    source: 'organizations',
    evidence: 'live',
    rationale:
      'The decision is the evidence, and it is a row somebody wrote rather than a list '
      + 'in a document. Zero accounts carry the type today (7 are enterprise_customer, '
      + '2 are client), so the funnel genuinely starts empty.',
  },
  {
    n: 2,
    key: 'mapped',
    label: 'Mapped',
    definition: 'We know at least one real, named person at the account.',
    trigger:
      'a leads row with organization_id = the account, or an account_warm_paths row',
    source: 'leads.organization_id, account_warm_paths',
    evidence: 'undeployed',
    rationale:
      'C6.1 called the account-to-person join the only genuine structural gap, and C8.3 '
      + 'shipped it. Merged is not deployed: neither column is in production yet, so this '
      + 'stage reports as undeployed rather than as zero.',
    excludes:
      'leads.company free text. 2,584 leads carry a company string, but C8.3 proved it '
      + 'cannot identify an account on its own: three organizations are named "Colaberry" '
      + 'and twelve leads match all three.',
  },
  {
    n: 3,
    key: 'contacted',
    label: 'Contacted',
    definition: 'We sent something to a named person at the account.',
    trigger: "interaction_outcomes.outcome = 'sent' for a lead at the account",
    source: 'interaction_outcomes',
    evidence: 'live',
    rationale:
      'A send is an act of ours and is recorded as one: 40,672 by email, 7,672 by SMS, '
      + '557 by system and 23 by voice. It claims nothing about the recipient.',
    excludes:
      "outcome = 'bounced' (440). A bounce is evidence the send FAILED, so an account "
      + 'whose only record is a bounce has not been contacted.',
  },
  {
    n: 4,
    key: 'engaged',
    label: 'Engaged',
    definition: 'A person at the account did something aimed at us.',
    trigger: "interaction_outcomes.outcome IN ('replied', 'answered')",
    source: 'interaction_outcomes',
    evidence: 'live',
    rationale:
      'A reply and an answered call both require a human to produce something directed '
      + 'at us. 25 replies and 22 answered calls, 47 in total.',
    excludes:
      "outcome = 'opened' (13,892) and 'clicked' (5,837). Both are machine-reachable: "
      + 'tracking pixels are loaded by Apple Mail Privacy Protection and pre-fetchers, '
      + 'and links are followed by corporate scanners. Counting them would report 19,729 '
      + 'engaged where 47 people acted.',
  },
  {
    n: 5,
    key: 'meeting_booked',
    label: 'Meeting booked',
    definition: 'A meeting with the account is on a calendar. Booked, not yet held.',
    trigger: "interaction_outcomes.outcome = 'booked_meeting'",
    source: 'interaction_outcomes',
    evidence: 'live',
    rationale:
      'Nine exist. The stage is deliberately named "booked" because that is all the '
      + 'evidence supports; calling it "Meeting" would imply one happened.',
    excludes:
      'Any claim that the meeting took place. Nothing records a commercial meeting as '
      + 'HELD. The completed_at columns in the schema belong to build, cert and '
      + 'internship-interview sessions, which are the student domain.',
  },
  {
    n: 6,
    key: 'demo_delivered',
    label: 'Demo delivered',
    definition: 'We showed the product to the account.',
    trigger: 'NONE - no source records a delivered demo',
    source: null,
    evidence: 'absent',
    rationale:
      'The ten recorded outcomes are sent, opened, clicked, bounced, no_answer, '
      + 'voicemail, replied, answered, booked_meeting and unsubscribed. None of them is a '
      + 'demo, and no other table carries one. This stage cannot be counted until '
      + 'something logs it.',
  },
  {
    n: 7,
    key: 'pilot_proposed',
    label: 'Pilot proposed',
    definition: 'A priced pilot proposal went to the account.',
    trigger: "a revenue_opportunities row for the account with a proposal status and an estimated_value",
    source: 'revenue_opportunities',
    evidence: 'empty',
    rationale:
      'The table exists with estimated_value, confidence, status and deal_closed_at, and '
      + 'has never been written to. The stage is countable the day somebody records an '
      + 'opportunity; it is zero now because nothing is recorded, not because nothing fits.',
    excludes:
      'gov_proposal_response (2 rows). Those are requirement-level response TEXT for one '
      + 'project and carry no value, so they cannot evidence a priced proposal.',
  },
  {
    n: 8,
    key: 'contract',
    label: 'Contract',
    definition: 'A contract with the account is approved.',
    trigger: 'delivery_contracts.approved_at IS NOT NULL for the account',
    source: 'delivery_contracts',
    evidence: 'empty',
    rationale:
      'approved_at is a timestamp somebody sets deliberately, which is the right shape '
      + 'for this stage. The table exists and is empty.',
  },
  {
    n: 9,
    key: 'pilot_running',
    label: 'Pilot running',
    definition: 'Paid delivery to the account is underway.',
    trigger: 'NONE - nothing marks an engagement as paid',
    source: null,
    evidence: 'absent',
    rationale:
      'delivery_engagements holds two active rows, but a schema-wide search for a '
      + 'contract, deal or pilot value column returned one hit, '
      + 'referral_commissions.deal_value, which belongs to referral payouts. A paid '
      + 'pilot could not be recorded today.',
    excludes:
      'delivery_engagements.status = active. Both rows have no start date, no end date, '
      + 'no source lead and no metadata, and one is named "AI Project Factory - demo '
      + 'engagement". Counting them as pilots would overstate the funnel by two.',
  },
  {
    n: 10,
    key: 'expansion',
    label: 'Expansion',
    definition: 'The account committed to a second, separate piece of paid work.',
    trigger:
      'a second delivery_contracts row with approved_at set, or a second closed-won '
      + 'revenue_opportunities row, for the same account',
    source: 'delivery_contracts, revenue_opportunities',
    evidence: 'empty',
    rationale:
      'Expansion is a count, not a judgment: the second approved commitment is the '
      + 'evidence. Both tables exist and are empty, so this is zero for the same reason '
      + 'stages 7 and 8 are.',
  },
];

/** Stages that can be counted from data today. */
export const COUNTABLE_STAGES = FUNNEL_STAGES.filter(
  (s) => s.evidence === 'live' || s.evidence === 'empty',
);

/**
 * Every stage names the table, column and value that fires it.
 *
 * A trigger that reads like a description rather than a query is how "counting on intent"
 * gets back in, so a stage with a source must mention its source in its trigger.
 */
export function assertEveryStageHasAnEvidencedTrigger(): number {
  for (const s of FUNNEL_STAGES) {
    if (!s.trigger || !s.rationale) {
      throw new Error(`stage ${s.key} is missing a trigger or its rationale`);
    }
    if (s.source === null) {
      if (!/^NONE/.test(s.trigger)) {
        throw new Error(`stage ${s.key} has no source but its trigger does not say NONE`);
      }
      continue;
    }
    const first = s.source.split(',')[0].trim().split('.')[0];
    if (!s.trigger.includes(first)) {
      throw new Error(`stage ${s.key} names source ${first} but its trigger never uses it`);
    }
  }
  return FUNNEL_STAGES.length;
}

/** A stage with no source must be declared absent, and one with a source must not be. */
export function assertAbsentStagesAreDeclared(): void {
  for (const s of FUNNEL_STAGES) {
    if (s.source === null && s.evidence !== 'absent') {
      throw new Error(`stage ${s.key} has no source but is not declared absent`);
    }
    if (s.source !== null && s.evidence === 'absent') {
      throw new Error(`stage ${s.key} is declared absent but names source ${s.source}`);
    }
  }
}

/**
 * The funnel is ordered and the positions are dense. A gap or a duplicate would make two
 * readers disagree about what "further along" means, which is the metric this ticket is
 * judged by.
 */
export function assertStagesAreOrderedAndDense(): void {
  FUNNEL_STAGES.forEach((s, i) => {
    if (s.n !== i + 1) throw new Error(`stage ${s.key} is at position ${s.n}, expected ${i + 1}`);
  });
  const keys = new Set(FUNNEL_STAGES.map((s) => s.key));
  if (keys.size !== FUNNEL_STAGES.length) throw new Error('duplicate stage key');
}

/**
 * The open-and-click exclusion must stay written down.
 *
 * It is the one definition that materially changes the headline number, so if a later
 * edit quietly folds opens into Engaged, the build should fail rather than the weekly
 * report silently gaining nineteen thousand engaged accounts.
 */
export function assertOpensAreNotEngagement(): void {
  const engaged = FUNNEL_STAGES.find((s) => s.key === 'engaged');
  if (!engaged) throw new Error('the engaged stage is missing');
  if (/opened|clicked/.test(engaged.trigger)) {
    throw new Error('engagement must not be triggered by an open or a click');
  }
  if (!engaged.excludes || !/opened/.test(engaged.excludes)) {
    throw new Error('the open exclusion must be recorded on the engaged stage');
  }
}
