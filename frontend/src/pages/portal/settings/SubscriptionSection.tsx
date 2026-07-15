import React, { useEffect, useState } from 'react';
import {
  fetchSubscription, startSubscriptionCheckout, cancelSubscription,
  SubscriptionView, PlanId,
} from '../../../services/subscriptionApi';

/**
 * SubscriptionSection — the Settings billing block. Three states:
 *  - No plan (Explorer): show the two plans; picking one redirects to the
 *    PaySimple hosted checkout (card or bank). On payment the account converts
 *    to a paying member automatically (webhook).
 *  - Active: show the plan + the next payment date ("in N days") + Cancel.
 *  - Canceled: show access-until + let them resubscribe.
 *
 * Cancellation requires a captured reason (chips + free text).
 */

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

const CANCEL_REASONS = ['Too expensive', 'Not enough time', 'Not what I expected', 'Found another option', 'Just exploring'];

const SubscriptionSection: React.FC<{ onToast?: (m: string) => void }> = ({ onToast }) => {
  const [view, setView] = useState<SubscriptionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [showPlans, setShowPlans] = useState(false);

  const flash = (m: string) => { if (onToast) onToast(m); };

  useEffect(() => {
    let alive = true;
    fetchSubscription().then((v) => { if (alive) setView(v); }).catch(() => { /* section stays hidden-ish */ });
    return () => { alive = false; };
  }, []);

  const onChoose = async (plan: PlanId) => {
    if (busy) return;
    setBusy(true);
    try {
      const { payment_link } = await startSubscriptionCheckout(plan);
      // Hand off to the PaySimple hosted checkout in the same tab.
      window.location.href = payment_link;
    } catch (err: any) {
      const code = err?.response?.data?.error;
      flash(code === 'billing_unconfigured'
        ? 'Payments aren’t enabled in this environment yet.'
        : 'Could not start checkout right now. Please try again.');
      setBusy(false);
    }
  };

  const onConfirmCancel = async () => {
    if (busy || !reason.trim()) { flash('Please tell us why you’re canceling'); return; }
    setBusy(true);
    try {
      const r = await cancelSubscription(reason.trim());
      flash(r.access_until ? `Canceled — you keep access until ${fmtDate(r.access_until)}` : 'Subscription canceled');
      setShowCancel(false); setReason('');
      const v = await fetchSubscription(); setView(v);
    } catch { flash('Could not cancel right now'); } finally { setBusy(false); }
  };

  if (!view) return null;
  const sub = view.subscription;
  const plans = view.plans;

  const renderPlans = () => (
    <div className="set-plans">
      {plans.map((p) => (
        <div key={p.id} className={`set-plan${p.id === 'annual' ? ' featured' : ''}`}>
          {p.id === 'annual' && <span className="set-plan-badge">Best value</span>}
          <div className="set-plan-name">{p.label}</div>
          <div className="set-plan-price">${p.per_month}<span>/mo</span></div>
          <div className="set-plan-terms">{p.id === 'annual' ? `Billed $${p.price.toLocaleString()} once a year` : 'Billed monthly · cancel anytime'}</div>
          <p className="set-plan-blurb">{p.blurb}</p>
          <button className={`te-btn ${p.id === 'annual' ? 'cherry' : 'berry'} sm`} disabled={busy} onClick={() => onChoose(p.id)}>
            {busy ? 'Starting…' : `Choose ${p.label}`}
          </button>
        </div>
      ))}
      <p className="set-sub" style={{ gridColumn: '1 / -1', margin: '6px 0 0' }}>
        Secure checkout by PaySimple — pay by card or bank. You’ll be enrolled and everything unlocks the moment your payment clears.
      </p>
    </div>
  );

  return (
    <section className="te-card set-section">
      <h3>Subscription &amp; billing</h3>

      {/* No subscription yet (Explorer / never subscribed) → show the plans */}
      {!sub && (
        <>
          <p className="set-sub">Unlock the full program — live classes, projects, mentorship, and certification prep.</p>
          {renderPlans()}
        </>
      )}

      {/* Active plan */}
      {sub && sub.status === 'active' && (
        <>
          <div className="set-billrow">
            <div>
              <div className="lab">{plans.find((p) => p.id === sub.plan)?.label || sub.plan} plan · active</div>
              <div className="desc">
                {sub.next_payment
                  ? <>Next payment on <b>{fmtDate(sub.next_payment.date)}</b> · in {sub.next_payment.in_days} day{sub.next_payment.in_days === 1 ? '' : 's'}</>
                  : <>Access through <b>{fmtDate(sub.current_period_end)}</b></>}
              </div>
            </div>
            <div className="set-bill-amt">${(sub.amount_cents / 100).toLocaleString()}</div>
          </div>
          {!showCancel ? (
            <button className="te-btn ghost sm" onClick={() => setShowCancel(true)}>Cancel subscription</button>
          ) : (
            <div className="set-cancel">
              <div className="lab">Sorry to see you go — what’s the main reason?</div>
              <div className="set-reasons">
                {CANCEL_REASONS.map((r) => (
                  <button key={r} type="button" className={`set-reason${reason === r ? ' sel' : ''}`} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <textarea className="set-input" style={{ minHeight: 70, marginTop: 8 }} placeholder="Anything else you’d like us to know? (optional)"
                value={CANCEL_REASONS.includes(reason) ? '' : reason}
                onChange={(e) => setReason(e.target.value)} />
              <div className="set-actions" style={{ gap: 8 }}>
                <button className="te-btn ghost sm" disabled={busy} onClick={() => { setShowCancel(false); setReason(''); }}>Keep my plan</button>
                <button className="te-btn danger sm" disabled={busy || !reason.trim()} onClick={onConfirmCancel}>{busy ? 'Canceling…' : 'Confirm cancellation'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Canceled → access-until + resubscribe */}
      {sub && sub.status === 'canceled' && (
        <>
          <div className="set-billrow">
            <div>
              <div className="lab">{plans.find((p) => p.id === sub.plan)?.label || sub.plan} plan · canceled</div>
              <div className="desc">{sub.access_until ? <>You keep full access until <b>{fmtDate(sub.access_until)}</b>.</> : 'Your plan is canceled.'}</div>
            </div>
          </div>
          {showPlans ? renderPlans() : (
            <button className="te-btn cherry sm" onClick={() => setShowPlans(true)}>Resubscribe</button>
          )}
        </>
      )}
    </section>
  );
};

export default SubscriptionSection;
