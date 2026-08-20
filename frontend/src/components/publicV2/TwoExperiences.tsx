import React from 'react';
import { SampleBadge } from './Claim';

/**
 * Section 2 — "One platform. Two experiences."
 *
 * Both panels check out against real surfaces:
 *  - Leadership  -> /portal/company (CompanyPage.tsx), authed behind
 *    requireParticipant + requireOrgManager, fetching the live org rollup.
 *  - Your people -> /portal/today, the command centre.
 *
 * ONE PROTOTYPE CLAIM DELETED: "readiness by department." There is no
 * department tier. `OrgMemberDetail.team` is `string | null`, a flat optional
 * label, and no department field exists on the participant or enrollment
 * models. The copy says "by person" and "by week", both of which are real
 * (`OrgOverview.builder_xp_by_week` is the last ~8 ISO weeks).
 *
 * Every figure quoted below maps to a field on OrgOverview or OrgMemberDetail.
 * The values are illustrative and badged; the fields are not.
 */

const LEAD = [
  { l: 'Average architect readiness', v: '63%', f: 'avg_readiness' },
  { l: 'Where everyone sits, ranks 0–8', v: '9 levels', f: 'level_distribution' },
  { l: 'Builder XP by week', v: '412', f: 'builder_xp_by_week' },
  { l: 'Evidence shipped this week', v: '37', f: 'evidence_this_week' },
  { l: 'Level-ups in 30 days', v: '6', f: 'level_ups_last_30d' },
];

const TEAM = [
  { l: 'Today’s next action', v: 'STORY-014' },
  { l: 'Architect readiness', v: '82 of 100' },
  { l: 'Build streak', v: '17 days' },
  { l: 'Verified from commit', v: 'STORY-013' },
  { l: 'Next live session', v: 'in the same feed' },
];

export default function TwoExperiences(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-2x-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">One platform. Two experiences.</p>
          <h2 id="cbv2-2x-title">You watch it. They work in it.</h2>
          <p className="cbv2-lede">
            Leadership gets a view of organizational AI capability. Your people get a daily place to
            build. Neither is a report written about the other &mdash; both are reading the same
            evidence ledger, which is why they cannot tell you different stories.
          </p>
        </div>

        <div className="cbv2-2x">
          <article className="cbv2-2x__side">
            <p className="cbv2-2x__k">Leadership</p>
            <h3>Capability, not course completion.</h3>
            <p className="cbv2-2x__p">
              Readiness across the organization, velocity by week, and where every person sits on the
              climb to Architect &mdash; with what is still missing before they get there.
            </p>
            <p className="cbv2-2x__route"><code>/portal/company</code> <SampleBadge /></p>
            <ul className="cbv2-2x__rows">
              {LEAD.map((r) => (
                <li key={r.l}><span>{r.l}</span><b>{r.v}</b></li>
              ))}
            </ul>
          </article>

          <div className="cbv2-2x__spine" aria-hidden="true">
            <span>the same evidence powers both</span>
          </div>

          <article className="cbv2-2x__side">
            <p className="cbv2-2x__k">Your people</p>
            <h3>They always know what to do next.</h3>
            <p className="cbv2-2x__p">
              A command center that opens on today&rsquo;s work &mdash; the current story, the skills
              it moves, the streak, the next live session.
            </p>
            <p className="cbv2-2x__route"><code>/portal/today</code> <SampleBadge /></p>
            <ul className="cbv2-2x__rows">
              {TEAM.map((r) => (
                <li key={r.l}><span>{r.l}</span><b>{r.v}</b></li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
