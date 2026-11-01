/**
 * The producer strip's stylesheet, lifted out of the component byte for byte.
 *
 * WHY IT MOVED. Adding the live clock and the viewer count took `ProducerStrip.tsx` past 500
 * lines, which is CLAUDE.md's hard ceiling — and the rule there is that the change which
 * crosses it splits the file rather than deferring again. The stylesheet is the part that
 * carries no logic, so it is the part that leaves. No rule changed, no class name moved, and
 * the component still injects it through the same `<style>` tag.
 *
 * The hex values are `var(--token, #fallback)` fallbacks, plus `#b3261e` for the on-air badge
 * and `#8a4b00` for the two readings that want attention — an overdue clock and a notice. Those
 * two are the live surfaces' existing warning and danger colors; they are not new.
 */
export const CPS_CSS = `
.cps{
  width:100%; margin:18px 0 0; padding:14px 16px;
  text-align:left;
  border:1px solid var(--border-subtle,#d8dde5); border-radius:12px;
  background:var(--surface-raised,#fbfcfe);
  font-family:var(--font-body);
}
.cps-head{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:12px; }
.cps-badge{
  display:inline-flex; align-items:center; gap:6px;
  padding:3px 9px; border-radius:999px;
  font-size:11px; font-weight:700; letter-spacing:.06em;
  background:var(--surface-sunken,#eef1f6); color:var(--text-muted,#55606f);
}
.cps-badge.is-live{ background:#b3261e; color:#fff; }
.cps-dot{ width:7px; height:7px; border-radius:50%; background:currentColor; }
.cps-health,.cps-version{ font-size:12px; color:var(--text-muted,#55606f); }
.cps-version{ margin-left:auto; font-variant-numeric:tabular-nums; }
/* Tabular figures so a ticking clock does not shuffle everything beside it once a second. */
.cps-clock{
  font-size:13px; font-weight:600;
  color:var(--text-body,#1d2430);
  font-variant-numeric:tabular-nums;
}
/* Past the scheduled start is the reading worth noticing, so it is the one that is colored. */
.cps-clock[data-kind="overdue"]{ color:#8a4b00; }
.cps-clock[data-kind="final"]{ font-weight:500; color:var(--text-muted,#55606f); }
.cps-aud{ font-size:12px; color:var(--text-muted,#55606f); font-variant-numeric:tabular-nums; }
/* Not a number, and must not look like one. */
.cps-aud[data-state="unknown"],.cps-aud[data-state="failed"]{ font-style:italic; }
.cps-actions{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.cps-btn{
  min-height:40px; padding:0 14px;
  border:1px solid var(--border-strong,#aab3c0); border-radius:8px;
  background:var(--surface-default,#fff); color:var(--text-body,#1d2430);
  font-size:14px; font-weight:600; cursor:pointer;
}
.cps-btn:hover:not(:disabled){ background:var(--surface-sunken,#eef1f6); }
.cps-btn:disabled{ opacity:.55; cursor:default; }
.cps-btn-danger{ border-color:#b3261e; color:#b3261e; }
.cps-btn-ghost{ border-color:var(--border-subtle,#d8dde5); font-weight:500; }
.cps-confirm{ display:inline-flex; flex-wrap:wrap; align-items:center; gap:8px; }
.cps-confirm-q{ font-size:13px; font-weight:600; color:#b3261e; }
.cps-note,.cps-blocked,.cps-notice{ margin:10px 0 0; font-size:13px; }
.cps-note{ color:var(--text-muted,#55606f); }
.cps-blocked{ color:var(--text-muted,#55606f); }
.cps-notice{ color:#8a4b00; }
`;
