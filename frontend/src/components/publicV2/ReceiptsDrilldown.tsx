import React, { useState } from 'react';
import { SampleBadge } from './Claim';

/**
 * Section 4 — "every number has receipts."
 *
 * VERIFIED AGAINST THE ROUTE TABLE, not against a neighbouring file's comment.
 * `ManagementPreviewPage.tsx` (/try) is a static mockup and says in its header
 * that the org rollup endpoints "none exist yet" -- that comment is STALE and
 * cost me a wrong conclusion once already. The real authed surface is
 * /portal/company, and its endpoints are live in participantRoutes.ts 243-247:
 *
 *   GET /api/portal/org/overview
 *   GET /api/portal/org/members
 *   GET /api/portal/org/members/:enrollmentId   <- the drill-down
 *   GET /api/portal/org/feed
 *
 * TWO PROTOTYPE CLAIMS DELETED, both unsupported by the payload shapes:
 *
 *  1. The DEPARTMENT tier. `OrgMemberDetail.team` is `string | null` -- a flat
 *     optional label. There is no department rollup, no hierarchy above the
 *     roster, and no department field on the participant or enrollment models.
 *     The prototype's five-step ladder is three steps in reality.
 *  2. "Keep opening it until you are looking at the commit." The drill-down
 *     ends at `evidence_by_source` -- counts BY SOURCE TYPE, not individual
 *     records. There is no path from the manager view to a line of code, and
 *     the section says so rather than implying otherwise.
 *
 * WHAT THE PROTOTYPE GOT EXACTLY RIGHT, kept verbatim because it checks out:
 * the Engineer gate really does require 22 evidence, 7 artifacts, 10 GitHub,
 * 3 evaluations and 5 attendance, and it really is an AI approval step --
 * seeders.ts line 42, `requires_ai_approval: true`.
 */

interface Level {
  k: string;
  who: string;
  v: string;
  sub: string;
  rows: { l: string; r: string; note?: string }[];
  foot: string;
}

const LEVELS: Level[] = [
  {
    k: 'Organization',
    who: 'Northwind Logistics',
    v: '63%',
    sub: 'average architect readiness across everyone enrolled',
    rows: [
      { l: 'Members enrolled', r: '35' },
      { l: 'Evidence shipped this week', r: '37', note: '▲ 6' },
      { l: 'Builder XP this week', r: '412', note: '▲ 12%' },
      { l: 'Evaluations passed this month', r: '19', note: '▲ 4' },
      { l: 'Level-ups in the last 30 days', r: '6', note: '▲ 2' },
      { l: 'Live-session attendance', r: '84%', note: '▲ 3%' },
    ],
    foot: 'Nothing on this view is self-reported. Open the roster to keep going.',
  },
  {
    k: 'Person',
    who: 'Marcus Bell',
    v: '82%',
    sub: 'Senior Developer · rank 4 of 9 on the Builder ladder',
    rows: [
      { l: 'Builder XP per week', r: '+96' },
      { l: 'Projects', r: '3' },
      { l: 'Evidence records', r: '21' },
      { l: 'Reviewed artifacts', r: '5' },
      { l: 'Evaluations passed', r: '4' },
      { l: 'Knowledge growth', r: '44% → 87%', note: '+43' },
    ],
    foot: 'Team velocity is measured in evidence shipped, not hours logged.',
  },
  {
    k: 'What is behind it',
    who: 'The gate to Engineer',
    v: '4 gaps',
    sub: 'what is still missing before rank 5',
    rows: [
      { l: 'Evidence records', r: '21 of 22' },
      { l: 'Reviewed artifacts', r: '5 of 7' },
      { l: 'GitHub evidence', r: '9 of 10' },
      { l: 'Evaluations passed', r: '4 of 3', note: 'met' },
      { l: 'Attendance', r: '5 of 5', note: 'met' },
      { l: 'Approval step', r: 'pending', note: 'automated' },
    ],
    foot: 'The gate never passes on points alone.',
  },
];

export default function ReceiptsDrilldown(): React.ReactElement {
  const [at, setAt] = useState(0);
  const level = LEVELS[at];

  return (
    <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-rc-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">Every number has receipts</p>
          <h2 id="cbv2-rc-title">AI readiness you can click into</h2>
          <p className="cbv2-lede">
            Most capability dashboards end at the number. This one starts there. Open the
            organization&rsquo;s readiness figure and you get the roster behind it; open a person and
            you get the evidence behind them, and the specific things still missing before they are
            promoted.
          </p>
        </div>

        <div className="cbv2-rc">
          <div className="cbv2-rc__steps" role="tablist" aria-label="Drill-down level">
            {LEVELS.map((l, i) => (
              <React.Fragment key={l.k}>
                <button
                  type="button"
                  role="tab"
                  id={`cbv2-rc-tab-${i}`}
                  aria-selected={i === at}
                  aria-controls="cbv2-rc-panel"
                  className={`cbv2-rc__step${i === at ? ' is-on' : ''}${i < at ? ' is-past' : ''}`}
                  onClick={() => setAt(i)}
                >
                  <span className="cbv2-rc__k">{l.k}</span>
                  <span className="cbv2-rc__who">{l.who}</span>
                  <span className="cbv2-rc__v">{l.v}</span>
                </button>
                {i < LEVELS.length - 1 ? <b className="cbv2-rc__arrow" aria-hidden="true">&rsaquo;</b> : null}
              </React.Fragment>
            ))}
          </div>

          <div
            className="cbv2-rc__panel"
            id="cbv2-rc-panel"
            role="tabpanel"
            aria-labelledby={`cbv2-rc-tab-${at}`}
          >
            <p className="cbv2-rc__hd">
              <b>{level.who}</b>
              <span>{level.sub}</span>
              <SampleBadge />
            </p>
            <ul className="cbv2-rc__rows">
              {level.rows.map((r) => (
                <li key={r.l}>
                  <span>{r.l}</span>
                  <b>{r.r}</b>
                  {r.note ? <i>{r.note}</i> : null}
                </li>
              ))}
            </ul>
            <p className="cbv2-rc__foot">{level.foot}</p>
          </div>
        </div>

        {/* The boundary, stated rather than implied. Rationale in the header. */}
        <p className="cbv2-rc__note">
          <b>Where this stops.</b> The manager view reaches the evidence behind a person &mdash;
          counts by source, the promotion gaps, the evaluations &mdash; and stops there. It does not
          open the commit itself. Managers see that the repository verified the work; reading the code
          is the reviewer&rsquo;s job, in the repository, where it belongs.
          The Engineer thresholds above are the real ones: 22 evidence records, 7 reviewed artifacts,
          10 GitHub items, 3 evaluations, 5 attendance, and an approval step beyond all of them.
        </p>
      </div>
    </section>
  );
}
