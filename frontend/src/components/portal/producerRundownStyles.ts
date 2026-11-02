/**
 * The segment rundown's stylesheet, in its own module for the reason the strip's own moved out:
 * `ProducerStrip.tsx` sits at 427 lines against CLAUDE.md's 500-line hard ceiling, and a
 * stylesheet is the part of a component that carries no logic, so it is the part that leaves
 * before the ceiling is an argument.
 *
 * Tokens with hex fallbacks throughout, matching `producerStripStyles.ts`. The two attention
 * colors are the same ones that file already uses — `#8a4b00` for a reading worth noticing and
 * `#b3261e` for one that needs action — so the strip and the rundown under it read as one
 * control rather than two surfaces that happen to be adjacent.
 */
export const CPR_CSS = `
.cpr{ margin:14px 0 0; padding:12px 0 0; border-top:1px solid var(--border-subtle,#d8dde5); }
.cpr-head{ display:flex; flex-wrap:wrap; align-items:baseline; gap:10px; margin-bottom:10px; }
.cpr-title{
  font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--text-muted,#55606f);
}
.cpr-plan{ font-size:12px; color:var(--text-muted,#55606f); font-variant-numeric:tabular-nums; }
/* The verdict is the one thing on this row a producer reads at a glance, so it carries weight. */
.cpr-pace{
  margin-left:auto;
  padding:2px 9px; border-radius:999px;
  font-size:12px; font-weight:700; letter-spacing:.03em;
  background:var(--surface-sunken,#eef1f6); color:var(--text-muted,#55606f);
  font-variant-numeric:tabular-nums;
}
.cpr-pace[data-verdict="behind"]{ background:#8a4b00; color:#fff; }
.cpr-pace[data-verdict="ahead"]{ color:var(--text-body,#1d2430); }

/* The plan as a single track, with one marker for where the class actually is. */
.cpr-track{
  position:relative; height:6px; margin:0 0 12px;
  border-radius:999px; background:var(--surface-sunken,#eef1f6);
  overflow:hidden;
}
.cpr-track-fill{ position:absolute; top:0; bottom:0; left:0; background:var(--border-strong,#aab3c0); }
.cpr-track-fill[data-verdict="behind"]{ background:#8a4b00; }

.cpr-table{ width:100%; border-collapse:collapse; font-size:13px; }
.cpr-table th{
  text-align:left; padding:0 8px 6px 0;
  font-size:10px; font-weight:700; letter-spacing:.07em; text-transform:uppercase;
  color:var(--text-muted,#55606f);
}
.cpr-table th:last-child,.cpr-table td:last-child{ text-align:right; padding-right:0; }
.cpr-table td{
  padding:5px 8px 5px 0;
  border-top:1px solid var(--border-subtle,#d8dde5);
  color:var(--text-body,#1d2430);
}
.cpr-table td.cpr-num{ font-variant-numeric:tabular-nums; color:var(--text-muted,#55606f); white-space:nowrap; }
/* Done segments recede; the current one is the only row that should pull the eye. */
.cpr-row[data-standing="done"] td{ color:var(--text-muted,#55606f); }
.cpr-row[data-standing="current"] td{ font-weight:700; background:var(--surface-sunken,#eef1f6); }
.cpr-mark{ display:inline-block; width:14px; color:var(--text-muted,#55606f); }
.cpr-row[data-standing="current"] .cpr-mark{ color:#b3261e; }
.cpr-at{ font-weight:500; color:var(--text-muted,#55606f); }

.cpr-note{ margin:10px 0 0; font-size:13px; color:var(--text-muted,#55606f); }
/* A position that cannot be believed is the one note here that asks for an action. */
.cpr-note[data-tone="warn"]{ color:#8a4b00; }
.cpr-note code{
  font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  font-size:12px; background:var(--surface-sunken,#eef1f6); padding:1px 4px; border-radius:4px;
}
@media (max-width:640px){
  .cpr-plan,.cpr-table th:nth-child(4),.cpr-table td:nth-child(4){ display:none; }
}
`;
