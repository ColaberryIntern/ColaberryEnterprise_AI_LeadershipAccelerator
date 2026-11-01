/**
 * What governs each campaign, and why each number is that number (C0.12).
 *
 * Separated from the seed that writes it so that a test can read the declarations without
 * opening a database connection, and so the rationale is reviewable as data rather than as
 * a comment inside an imperative script.
 *
 * Measured in production on 2026-11-01: `campaign_governance_configs` held **zero rows
 * against 47 campaigns**. `validateCampaignForPublish` requires one, so no campaign in the
 * system could pass that check, and the six campaigns that are nevertheless `status=active`
 * got there through `activateCampaign`, which never consulted it.
 *
 * ## Why no value here is a column default
 *
 * Every column in the table has a database default, so a row of defaults is what you get
 * for making no decision at all. C0.12 names that outcome: *"a governance record that
 * governs nothing is worse than its absence, because the gate then reads green."* Where a
 * platform default is genuinely the right answer it is restated with its reason; the
 * advance/hold thresholds on the CEO motion are left at 70/50 deliberately, because
 * nothing measured argues for moving them and inventing a different number would be the
 * same failure in the other direction.
 */

export interface DeclaredConfig {
  readonly key: string;
  readonly campaign_id: string;
  readonly campaign_name: string;
  /** Why this campaign gets a config at all. */
  readonly why: string;
  /** Per-field derivation. Keyed on the column so the reason sits next to the number. */
  readonly rationale: Readonly<Record<string, string>>;
  readonly values: {
    readonly max_unsubscribe_rate: number;
    readonly max_bounce_rate: number;
    readonly max_sms_failure_rate: number;
    readonly min_open_rate: number;
    readonly min_reply_rate: number;
    readonly ramp_profile: {
      readonly phase_sizes: readonly number[];
      readonly advance_threshold: number;
      readonly hold_threshold: number;
      readonly evaluation_window_hours: number;
    };
  };
}

/** Stamped on every row so a config's provenance is readable from the table alone. */
export const UPDATED_BY = 'seed:C0.12';

export const DECLARED_CONFIGS: readonly DeclaredConfig[] = [
  {
    key: 'ceo_direct',
    campaign_id: '36272d49-c2e9-4688-b497-047c83afd125',
    campaign_name: 'CEO Direct - Funded AI Transformation Partner',
    why: 'The campaign C0.12 was written to unblock. Nine named chief executives, letters '
      + 'sent by hand, no auto-dialer, email only.',
    rationale: {
      max_unsubscribe_rate:
        'Ten leads are enrolled and the daily limit is ten, so one unsubscribe is 10%. The '
        + 'ramp compares with >=, so this pauses the motion on the first chief executive '
        + 'who asks not to be contacted.',
      max_bounce_rate:
        'Same arithmetic: one bounce in ten is 10%. A bounce here means the address '
        + 'research was wrong for that company, which invalidates the target list rather '
        + 'than the copy, so it should stop the motion and not be retried.',
      max_sms_failure_rate:
        'channel_config.sms.enabled is false - this campaign must never send an SMS. 0.01% '
        + 'therefore means any SMS failure at all pauses it, because a failure implies a '
        + 'send that should not have happened. The platform default of 10% would tolerate '
        + 'nine of them.',
      min_open_rate:
        'A JUDGMENT, not a derivation, and the one value here Ali should expect to change. '
        + 'A personally addressed letter to a named chief executive that fewer than one in '
        + 'four open has an addressing problem rather than a copy problem. Measured '
        + 'executive_outreach bulk sends opened at 2.15% and 2.63%, which is the wrong '
        + 'comparison for nine hand-sent letters, so there is no measured floor to use.',
      min_reply_rate:
        'settings.stop_rule.no_reply_after_contacts is 10, so the campaign already records '
        + 'ten contacts with no reply as the point of concern. One reply in ten is 0.10.',
      ramp_profile:
        'C6.13 qualified nine companies and disqualified one, so [3,3,3] spends the list in '
        + 'three phases with two review points. 72 hours because the platform default of 12 '
        + 'assumes a marketing audience, while this campaign\'s own stop rule is written in '
        + 'days (21 to review); 72 is the smallest window that always spans a weekend. '
        + 'advance 70 / hold 50 are the platform defaults, kept because nothing measured '
        + 'argues for moving them.',
    },
    values: {
      max_unsubscribe_rate: 10.0,
      max_bounce_rate: 10.0,
      max_sms_failure_rate: 0.01,
      min_open_rate: 0.25,
      min_reply_rate: 0.10,
      ramp_profile: {
        phase_sizes: [3, 3, 3],
        advance_threshold: 70,
        hold_threshold: 50,
        evaluation_window_hours: 72,
      },
    },
  },
  {
    key: 'alumni_champion',
    campaign_id: '56bf7412-8f51-4d3d-958b-8c82dbbff151',
    campaign_name: 'Colaberry Alumni Re-Engagement Campaign',
    why: 'The reusability check C0.12 asks for. Deliberately the opposite shape from the '
      + 'CEO motion - a bulk alumni list rather than nine hand-written letters - so that a '
      + 'config whose numbers came out the same would be visible as a template rather than '
      + 'a decision. NOT written by default: this campaign is status=active, so changing '
      + 'its live ceilings is Ali\'s call. Run with --only alumni_champion to apply it.',
    rationale: {
      max_unsubscribe_rate:
        'The comparable alumni campaign measured 922 sends against a 10,343-lead list with '
        + 'zero unsubscribes, so one unsubscribe would be 0.108%. The platform default of '
        + '1.5% would tolerate fourteen before pausing, which is too many to notice on a '
        + 'list this size. 0.5% pauses at five.',
      max_bounce_rate:
        'Measured zero bounces across 922 sends. An alumni list decays by address, not by '
        + 'copy, so 2% is the point at which the list needs re-verification rather than '
        + 'the campaign needing a rewrite.',
      max_sms_failure_rate:
        'This is the one campaign family where sms_failure_rate is actually populated - 1 '
        + 'of 30 campaign_health rows carries the key, and it is an alumni one. 10% is the '
        + 'platform default and is kept, because there is measured history behind it here '
        + 'and none anywhere else.',
      min_open_rate:
        'Measured 1.53% open rate on the comparable alumni campaign. 0.01 (1%) is a floor '
        + 'below the observed rate rather than an aspiration above it, so it marks a '
        + 'collapse in deliverability instead of normal alumni apathy.',
      min_reply_rate:
        'Measured reply_rate 0 across 922 sends. 0.0025 (one reply per 400 sends) is the '
        + 'smallest floor that is not zero; zero would be unenforceable and 0.10 would '
        + 'condemn the campaign on arrival.',
      ramp_profile:
        'The alumni_re_engagement type map already ramps [10,25,50,-1], which suits a list '
        + 'of ten thousand; it is restated here so the config, not the type map, is what '
        + 'governs it. 12-hour window kept: a bulk send is judged the next morning, unlike '
        + 'nine letters to chief executives. advance 65 / hold 50 is a fifteen-point hold '
        + 'band, narrower than the CEO motion on purpose: a bulk alumni send that is '
        + 'underperforming should stop sooner than nine hand-written letters.',
    },
    values: {
      max_unsubscribe_rate: 0.5,
      max_bounce_rate: 2.0,
      max_sms_failure_rate: 10.0,
      min_open_rate: 0.01,
      min_reply_rate: 0.0025,
      ramp_profile: {
        phase_sizes: [10, 25, 50, -1],
        advance_threshold: 65,
        hold_threshold: 50,
        evaluation_window_hours: 12,
      },
    },
  },
];
