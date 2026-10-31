/**
 * AF10.6's one-page visual and its spec document.
 *
 * The visual leads with the `enabled` trap rather than with the naming feature, because the
 * feature is small and the trap is the part that would have shipped broken while green: a
 * disabled agent already held the exact name this ticket exists to refuse.
 */
const D = require('./af106Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + '&middot; no migration, no schema change';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  h2 { font-size: 9.5pt; margin: 6px 0 3px; }
  .mermaid { font-size: 7.8pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.warn { border-top-color: ${SEV.bad}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
  .names { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; margin: 7px 0; }
  .nm {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.CHERRY};
    border-radius: 5px; padding: 6px 4px; text-align: center; background: #fff;
  }
  .nm .n2 { font-size: 13pt; font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; }
  .nm .d { font-size: 7pt; color: ${TOKENS.MUTED}; line-height: 1.25; margin-top: 2px; }
  `;

  const names = D.NAMES.map(([n, d]) => `
    <div class="nm"><div class="n2">${esc(n)}</div><div class="d">${esc(d)}</div></div>`).join('');

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${D.NAMES.length}</div>
      <div class="k">Names the interns chose</div></div>
    <div class="card"><div class="n">0</div><div class="k">Stored in the product before this</div></div>
    <div class="card good"><div class="n">0</div>
      <div class="k">Migrations, schema or seeder changes</div></div>
    <div class="card good"><div class="n">2</div>
      <div class="k">Tests guarding the enabled trap</div></div>
  </div>`;

  const body = `
  <h1>An intern names their own agent, and a name already taken is refused.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">A disabled agent already held the exact name this ticket exists to
    refuse.</div>
    <div>A read-only production probe found <code>agent_name</code> = <strong>Maya</strong> with
    <code>enabled: false</code>, and Maya is the name the admissions builder chose. So the
    uniqueness check deliberately does NOT filter on <code>enabled</code> -- a
    <code>WHERE enabled = true</code> would have allowed exactly that one name,
    <strong>and would have passed any test whose fixtures only held enabled rows</strong>.</div>
  </div>

  ${kpi}
  <h2>The seven names, now stored on the agent rather than chosen in a chat</h2>
  <div class="names">${names}</div>

  <div class="mermaid">
  graph LR
    A["Intern types a name<br/>on My Domain"] --> B["normalize:<br/>trim, case-fold"]
    B --> C{"any OTHER agent<br/>already answers to it?"}
    C -->|"yes, including<br/>a DISABLED one"| D["REFUSED"]
    C -->|"no"| E["saved to<br/>ai_agents.config.display_name"]
    F["its own current name"] -.->|"self-excluded"| C
  </div>

  <div class="cols">
    <div class="col panel warn">
      <div class="hd" style="color:${SEV.bad}">Why the check ignores "enabled"</div>
      <div class="bd">${esc(D.ENABLED_TRAP.why)} ${esc(D.ENABLED_TRAP.consequence)}</div>
    </div>
    <div class="col panel">
      <div class="hd">How it is guarded</div>
      <div class="bd">${esc(D.ENABLED_TRAP.guards)}</div>
    </div>
    <div class="col panel">
      <div class="hd">How a name is matched</div>
      <div class="bd">${esc(D.MATCHING)}</div>
    </div>
  </div>
  <div class="tiny" style="margin-top:4px">The My Domain page previously rendered the agent as a
  bare UUID. The name lands on <code>ai_agents.config.display_name</code>. Full detail in the spec
  document beside this page.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  `;

  const nameRows = D.NAMES.map(([n, d]) => `
    <tr><td class="p">${esc(n)}</td><td>${esc(d)}</td></tr>`).join('');

  const body = `
  <h1>${D.TICKET}: let an intern name their own agent</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Delivered, and the uniqueness check carries one property that a tidy
    test suite would never have defended.</div>
    <div>${esc(D.DELIVERED)}</div>
  </div>

  <h2>Asked</h2>
  <p>${esc(D.ASKED)}</p>
  <table>
    <thead><tr><th>Name</th><th>Domain</th></tr></thead>
    <tbody>${nameRows}</tbody>
  </table>

  <h2>The one thing to read: the check ignores "enabled" on purpose</h2>
  <p><strong>${esc(D.ENABLED_TRAP.rule)}</strong></p>
  <p>A read-only production probe found <code>agent_name</code> = "Maya" with
  <code>enabled: false</code>, and Maya is the name the admissions builder chose.</p>
  <p>${esc(D.ENABLED_TRAP.why)}</p>
  <p>${esc(D.ENABLED_TRAP.consequence)}</p>
  <p>${esc(D.ENABLED_TRAP.guards)}</p>

  <h2>How a name is matched</h2>
  <p>${esc(D.MATCHING)}</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
