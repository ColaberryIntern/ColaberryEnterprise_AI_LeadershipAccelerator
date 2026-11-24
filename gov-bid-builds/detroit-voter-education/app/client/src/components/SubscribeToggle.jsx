// STORY-016: in-app "notify me" toggle. Presentational -- subscribed state
// and the actual API calls are owned by the parent (SummaryList) so a list
// of N cards doesn't each independently fetch subscription state.
export default function SubscribeToggle({ subscribed, onToggle, busy }) {
  return (
    <button
      type="button"
      className="subscribe-toggle"
      aria-pressed={subscribed}
      disabled={busy}
      onClick={onToggle}
    >
      {subscribed ? '🔔 Notifications on' : '🔕 Notify me of updates'}
    </button>
  );
}
