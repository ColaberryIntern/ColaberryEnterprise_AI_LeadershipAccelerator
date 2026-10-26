import React from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import { Claim } from '../../../components/publicV2/Claim';
import { useCampusView } from '../../../components/campus/useCampusView';
import { PLAN_CARDS, PLANS_ROUTE, cardAction } from '../../../components/campus/admissions/plansModel';
import { accountRows, isSubscribed, useAccountFacts } from '../../../components/campus/admissions/accountFacts';
import { ActionButton } from '../../../components/campus/admissions/AdmissionsServices';
import { openBookCall } from '../../../components/campus/admissions/admissionsCallApi';
import { openStaffCard } from '../../../components/campus/staffCard';
import '../../../components/campus/admissions/campusBook.css';

/**
 * Plans & services, /portal/plans (C21, v6 D3): the Admissions building's page. The four plans, each priced through the claims
 * registry (<Claim> for this route; month-to-month is not shown, the annual membership is pitched first) with the one action that
 * fits this viewer, then "Your account" (Settings' Enrollment and Subscription sources) and "Talk to a person" side by side.
 * Every action reuses an existing flow; nothing here starts a payment by itself.
 */
export default function PlansPage(): React.ReactElement {
  const navigate = useNavigate();
  const { audience } = useCampusView();
  const facts = useAccountFacts(true);
  const viewer = { audience, subscribed: facts ? isSubscribed(facts) : false };
  const account = facts ? accountRows(facts) : null;
  return (
    <PortalShell condensedSlot={<CondensedHeaderCard label="Admissions" title="Plans & services" sub="One license, team seats or services" tone="berry" />}>
      <div className="cm-plans" data-testid="cm-plans">
        <div className="cm-plans-kicker">ADMISSIONS</div>
        <h1 className="cm-plans-title">Plans &amp; services</h1>
        <p className="cm-plans-lead">Start exploring with no card needed, activate a license for yourself, add seats for your team, or bring us in to build with you.</p>
        <div className="cm-plans-cards">
          {PLAN_CARDS.map((c) => (
            <article key={c.id} className={`cm-plan-card${c.featured ? ' is-featured' : ''}`} data-testid={`cm-plan-${c.id}`}>
              <h2>{c.name}</h2>
              <div><span className="pr">{c.priceClaim ? <Claim claimKey={c.priceClaim} route={PLANS_ROUTE} /> : c.priceText}</span> {c.unit && <span className="unit">{c.unit}</span>}</div>
              {(c.subClaim || c.subText) && <div className="sub">{c.subClaim && <Claim claimKey={c.subClaim} route={PLANS_ROUTE} />}{c.subClaim && c.subText ? ' · ' : ''}{c.subText}</div>}
              <p>{c.blurb}</p>
              <ActionButton a={cardAction(c.id, viewer)} onNavigate={(to) => navigate(to)} testId={`cm-plan-action-${c.id}`} />
            </article>
          ))}
        </div>
        <div className="cm-plans-pair">
          <section aria-labelledby="cm-plans-acct" data-testid="cm-plans-account">
            <h2 id="cm-plans-acct">Your account</h2>
            {account ? account.rows.map((r) => <div key={r.label} className="kv"><span>{r.label}</span><b>{r.value}</b></div>)
              : <p className="cm-book-muted">{facts ? 'Nothing to show yet.' : 'Loading your account…'}</p>}
            <div className="cm-book-row">
              <button type="button" className="cm-btn-line" onClick={() => navigate('/portal/settings?tab=subscription')}>Subscription &amp; billing</button>
              <button type="button" className="cm-btn-line" onClick={() => navigate('/portal/settings?tab=enrollment')}>Enrollment</button>
            </div>
          </section>
          <section aria-labelledby="cm-plans-talk" data-testid="cm-plans-talk">
            <h2 id="cm-plans-talk">Talk to a person</h2>
            <p className="cm-book-muted">A real person from the admissions team, not an AI. 30 minutes on Google Meet. Or ask Maya, any time.</p>
            <div className="cm-book-row">
              <button type="button" className="cm-btn-red" onClick={() => openBookCall()} data-testid="cm-plans-book">📅 Book a call</button>
              <button type="button" className="cm-btn-line" onClick={() => openStaffCard('maya')}>Ask Maya</button>
            </div>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
