import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchSubscription, startSubscriptionCheckout, cancelSubscription, confirmSubscriptionCheckout,
  SubscriptionView, PlanId,
} from '../../../services/subscriptionApi';
import { formatClassDate } from '../../../services/portalEnrollmentApi';
import { trackEvent } from '../../../utils/tracker';
import { markOncePerSession } from '../../../utils/oncePerSession';

/**
 * SubscriptionSection — the Settings billing block.
 *  - Free (Explorer): three cards — Free (their current, selected), Annual,
 *    Monthly. Picking a paid plan redirects to the PaySimple hosted checkout.
 *  - Active: a "manage your subscription" screen — which plan, amount, next
 *    payment / renews-in-N-days, access-through, and Cancel (reason captured).
 *  - Canceled: access-until + resubscribe.
 */

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
const money = (n: number): string => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// PaySimple can't charge $0, so a credit never reduces a charge below $1 — mirror
// of MIN_CHARGE_CENTS in the backend accountCreditService so the "you pay today"
// shown here equals what is actually charged.
const MIN_CHARGE_CENTS = 100;
/** Credit applied to a plan's first charge, and the resulting amount due today. */
const firstCharge = (priceDollars: number, creditCents: number): { appliedCents: number; chargeDollars: number } => {
  const priceCents = Math.round(priceDollars * 100);
  const appliedCents = Math.min(creditCents, Math.max(0, priceCents - MIN_CHARGE_CENTS));
  return { appliedCents, chargeDollars: (priceCents - appliedCents) / 100 };
};

const CANCEL_REASONS = ['Too expensive', 'Not enough time', 'Not what I expected', 'Found another option', 'Just exploring'];

// Named window target for the PaySimple checkout tab -- see onChoose() for why
// this needs a name rather than a held JS reference.
const CHECKOUT_WINDOW_NAME = 'colaberryCheckout';

const SubscriptionSection: React.FC<{ onToast?: (m: string) => void }> = ({ onToast }) => {
  const [view, setView] = useState<SubscriptionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
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
    if (busy || waiting) return;
    setBusy(true);
    // Explorer Growth OS §6.3 friction. Checkout is a PaySimple HOSTED redirect,
    // so the app never observes the payment failing — only that an attempt was
    // made. Pairing this with enrollments.payment_status is what makes
    // "tried to pay and did not complete" derivable at all; inventing a
    // client-side payment_failed here would be inventing an event this flow
    // cannot produce.
    if (markOncePerSession(`payment_attempt:${plan}`)) {
      trackEvent('payment_attempt', { plan });
    }
    // Open the tab SYNCHRONOUSLY, in direct response to the click, before any
    // await. Once window.open() happens after an async gap (even a fast one),
    // most browsers no longer treat it as tied to the user gesture and the
    // popup blocker silently swallows it -- found live 2026-07-30 ("I'm having
    // issues Enrolling... it stays on this page, no other tab opens"), and the
    // UI still showed the "waiting on payment" spinner even though no tab had
    // actually opened. A named target lets the later, post-await call navigate
    // this SAME tab without needing to hold a JS reference to it, so 'noopener'
    // still protects against the payment page reaching back into window.opener.
    const opened = window.open('', CHECKOUT_WINDOW_NAME);
    if (opened) {
      try { opened.document.write('<title>Redirecting to checkout…</title><body style="font-family:sans-serif;padding:40px;color:#555">Redirecting to secure checkout…</body>'); } catch { /* best-effort only */ }
    } else {
      flash('Your browser blocked the payment window. Please allow pop-ups for this site and try again.');
      setBusy(false);
      return;
    }
    try {
      const { payment_link } = await startSubscriptionCheckout(plan);
      window.open(payment_link, CHECKOUT_WINDOW_NAME, 'noopener'); // navigates the tab opened above
      setWaiting(true);
    } catch (err: any) {
      opened.close();
      const code = err?.response?.data?.error;
      flash(code === 'billing_unconfigured'
        ? 'Payments aren’t enabled in this environment yet.'
        : 'Could not start checkout right now. Please try again.');
    } finally { setBusy(false); }
  };

  // While waiting on a payment, poll for activation (and re-check whenever this
  // tab regains focus, e.g. after the user finishes in the payment tab).
  const checkPayment = useCallback(async (): Promise<boolean> => {
    try {
      const r = await confirmSubscriptionCheckout();
      if (r.view.subscription?.status === 'active') {
        setView(r.view); setWaiting(false); setShowPlans(false);
        flash('You’re all set — welcome to the program!');
        return true;
      }
    } catch { /* keep polling */ }
    return false;
  }, [onToast]);

  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    let stop = false;
    const tick = async () => { if (stop) return; tries += 1; const done = await checkPayment(); if (done || tries >= 45) stop = true; };
    const id = window.setInterval(tick, 4000);
    const onFocus = () => { tick(); };
    window.addEventListener('focus', onFocus);
    tick(); // immediate first check
    return () => { stop = true; window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [waiting, checkPayment]);

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
  const planCfg = sub ? plans.find((p) => p.id === sub.plan) : null;

  const creditCents = view.available_credit_cents || 0;

  // Plan-selection grid. `withFree` prepends the current (Free) plan, selected.
  const renderPlans = (withFree: boolean) => (
    <div className={`set-plans${withFree ? ' has-free' : ''}`}>
      {creditCents > 0 && (
        <div className="set-credit-banner" style={{ gridColumn: '1 / -1' }}>
          <span className="set-credit-chip">${money(creditCents / 100)} credit</span>
          <span>Your ${money(creditCents / 100)} Open House deposit is on your account — it comes off your first payment automatically, whichever plan you choose.</span>
        </div>
      )}
      {withFree && (
        <div className="set-plan current">
          <span className="set-plan-badge current"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg> Your plan</span>
          <div className="set-plan-name">Free · Explorer</div>
          <div className="set-plan-price">$0<span>/mo</span></div>
          <div className="set-plan-terms">Week 0 preview access</div>
          <p className="set-plan-blurb">You’re exploring for free. Upgrade any time to unlock live classes, projects, mentorship, and cert prep.</p>
          <button className="te-btn ghost sm" disabled>Current plan</button>
        </div>
      )}
      {plans.map((p) => {
        const { appliedCents, chargeDollars } = firstCharge(p.price, creditCents);
        return (
        <div key={p.id} className={`set-plan${p.id === 'annual' ? ' featured' : ''}`}>
          {p.id === 'annual' && <span className="set-plan-badge">Best value</span>}
          <div className="set-plan-name">{p.label}</div>
          <div className="set-plan-price">${money(p.per_month)}<span>/mo</span></div>
          <div className="set-plan-terms">{p.cadence === 'year' ? `Billed $${money(p.price)} once a year` : 'Billed monthly · cancel anytime'}</div>
          {appliedCents > 0 && (
            <div className="set-plan-credit">
              <span className="was">${money(p.price)}</span>
              <span className="now">You pay ${money(chargeDollars)} today</span>
              <span className="lbl">−${money(appliedCents / 100)} credit applied</span>
            </div>
          )}
          <p className="set-plan-blurb">{p.blurb}</p>
          <button className={`te-btn ${p.id === 'annual' ? 'cherry' : 'berry'} sm`} disabled={busy} onClick={() => onChoose(p.id)}>
            {busy ? 'Starting…' : `Choose ${p.label}`}
          </button>
        </div>
        );
      })}
      <p className="set-sub" style={{ gridColumn: '1 / -1', margin: '6px 0 0' }}>
        Secure checkout by PaySimple — pay by card or bank. You’ll be enrolled and everything unlocks the moment your payment clears.
      </p>
      {view.class_start?.is_future && (
        <div className="set-enroll-callout" style={{ gridColumn: '1 / -1' }}>
          <div className="ttl">Pay early, lose nothing</div>
          <p>
            Your subscription month starts on your <b>class start date ({formatClassDate(view.class_start.start_date)})</b>,
            not the day you pay. Paying now locks your seat — your first month still runs
            from {formatClassDate(view.class_start.start_date)}.
          </p>
        </div>
      )}
    </div>
  );

  const cancelFlow = (
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
  );

  return (
    <section className="te-card set-section">
      <h3>Subscription &amp; billing</h3>

      {/* ── WAITING: payment opened in a new tab; poll until it activates ── */}
      {waiting && (
        <div className="set-sub-waiting">
          <div className="set-sub-wait-spinner" />
          <div className="lab">Complete your payment in the new tab</div>
          <div className="desc">This page updates automatically once your payment clears — it’s safe to close the payment tab when you’re done.</div>
          <div className="set-actions" style={{ gap: 8, justifyContent: 'center', marginTop: 4 }}>
            <button className="te-btn berry sm" onClick={() => checkPayment()}>I’ve paid — check now</button>
            <button className="te-btn ghost sm" onClick={() => setWaiting(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── FREE: no subscription yet → Free (current) + the two paid plans ── */}
      {!sub && !waiting && (
        <>
          <p className="set-sub">You’re on the free plan. Upgrade to unlock the full program.</p>
          {renderPlans(true)}
        </>
      )}

      {/* ── ACTIVE: the manage-your-subscription screen ── */}
      {sub && sub.status === 'active' && !waiting && (
        <div className="set-sub-manage">
          <div className="set-sub-head">
            <div>
              <span className="set-sub-badge active">● Active</span>
              <div className="set-sub-plan">{planCfg?.label || sub.plan} plan</div>
              <div className="set-sub-sub">${money((planCfg?.per_month ?? sub.amount_cents / 100))}/mo · billed {sub.plan === 'annual' ? 'yearly' : 'monthly'}</div>
            </div>
            <div className="set-sub-amt">${money(sub.amount_cents / 100)}<span>/{sub.plan === 'annual' ? 'yr' : 'mo'}</span></div>
          </div>

          <div className="set-sub-facts">
            <div className="fact"><span className="k">Plan</span><span className="v">{planCfg?.label || sub.plan}</span></div>
            {sub.next_payment && (
              <div className="fact"><span className="k">Next payment</span><span className="v">{fmtDate(sub.next_payment.date)} · in {sub.next_payment.in_days} day{sub.next_payment.in_days === 1 ? '' : 's'}</span></div>
            )}
            <div className="fact"><span className="k">Access through</span><span className="v">{fmtDate(sub.current_period_end)}</span></div>
            {/* Billing is anchored to class start — an early payer's period hasn't started yet. */}
            {sub.started_at && <div className="fact"><span className="k">{new Date(sub.started_at).getTime() > Date.now() ? 'Starts' : 'Started'}</span><span className="v">{fmtDate(sub.started_at)}</span></div>}
          </div>

          {!showCancel
            ? <button className="te-btn ghost sm" onClick={() => setShowCancel(true)}>Cancel subscription</button>
            : cancelFlow}
        </div>
      )}

      {/* ── CANCELED: access-until + resubscribe ── */}
      {sub && sub.status === 'canceled' && !waiting && (
        <div className="set-sub-manage">
          <div className="set-sub-head">
            <div>
              <span className="set-sub-badge canceled">Canceled</span>
              <div className="set-sub-plan">{planCfg?.label || sub.plan} plan</div>
              <div className="set-sub-sub">{sub.access_until ? <>Full access until <b>{fmtDate(sub.access_until)}</b></> : 'Your plan is canceled.'}</div>
            </div>
          </div>
          {sub.cancel_reason && <div className="set-sub-facts"><div className="fact"><span className="k">Reason</span><span className="v">{sub.cancel_reason}</span></div></div>}
          {showPlans ? renderPlans(false) : (
            <button className="te-btn cherry sm" onClick={() => setShowPlans(true)}>Resubscribe</button>
          )}
        </div>
      )}
    </section>
  );
};

export default SubscriptionSection;
