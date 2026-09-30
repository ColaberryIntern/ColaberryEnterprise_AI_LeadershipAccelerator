/**
 * intelCardFormats — the DISTINCT visual format for each of the 10 Intelligence
 * Pipeline curriculum types. Because these render over the generic `intel` band
 * (lessonDoc, which PRESERVES <style>), each type ships a self-contained, richly
 * styled body_html — like the Announcement type does. This is the single source
 * of truth for BOTH:
 *   • the hand-authored sample cards (seedIntelSampleCards) — exact reference render
 *   • the runtime generation prompts (seedComponentAuthoring) — "copy this <style>
 *     verbatim, then fill this structure" so live LLM cards match the design.
 *
 * Each format = { style, render(data), sample, structure }. No two look alike:
 * different layouts, components, and accents. All self-contained (no <script>,
 * no external assets); the drawer/workspace iframe supplies nothing but a white
 * surface.
 */

const FONT = `font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif`;

/** shared reset + typographic base, tinted by an accent. */
const base = (accent: string, ink = '#16202e') => `
  *{box-sizing:border-box} body{margin:0;${FONT};color:${ink};background:#fff;font-size:14px;line-height:1.62}
  .ip{max-width:720px;margin:0 auto;padding:24px 22px}
  .ip h1,.ip h2,.ip h3{margin:0;line-height:1.25;letter-spacing:-.01em}
  .ip p{margin:0 0 10px} .ip a{color:${accent};text-decoration:none;font-weight:600}
  .ip small{color:#6b7688}
  .kick{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${accent}}
  .lead{font-size:16px;line-height:1.55;color:#2b3646}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
  .chip{font-size:12px;font-weight:600;color:${accent};background:${accent}14;border:1px solid ${accent}30;border-radius:999px;padding:3px 11px}
  .foot{margin-top:20px;padding-top:12px;border-top:1px solid #eceef2;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:#6b7688}
  .conf{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-weight:700}
  .dot{width:8px;height:8px;border-radius:50%}
`;

const esc = (s: string) => String(s ?? '');
const li = (arr: string[]) => arr.map((x) => `<li>${esc(x)}</li>`).join('');

export interface IntelFormat {
  style: string;
  render: (d: any) => string;
  sample: any;
  /** plain-language description of the body structure for the generation prompt */
  structure: string;
}

/* ─────────────────────────── 1. AI News Flash ─────────────────────────── */
const news: IntelFormat = {
  style: base('#e11d48') + `
    .nf-rib{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .nf-src{font-size:12px;font-weight:800;color:#fff;background:#e11d48;border-radius:6px;padding:4px 10px;letter-spacing:.02em}
    .nf-when{font-size:12.5px;color:#8a94a4;font-weight:600}
    .nf-h{font-size:26px;font-weight:800;margin:2px 0 12px}
    .nf-gist{background:#fff1f3;border-left:4px solid #e11d48;border-radius:0 10px 10px 0;padding:13px 16px;font-size:15px;color:#7f1d33}
    .nf-imp{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:18px 0}
    .nf-imp div{border:1px solid #eceef2;border-radius:12px;padding:12px 13px}
    .nf-imp b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#e11d48;margin-bottom:5px}
    .nf-mean{background:#0f172a;color:#e7ecf3;border-radius:14px;padding:16px 18px;margin:16px 0}
    .nf-mean b{color:#fff;display:block;margin-bottom:6px;font-size:15px}
    @media(max-width:560px){.nf-imp{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <div class="nf-rib"><span class="nf-src">${esc(d.source)}</span><span class="nf-when">${esc(d.date)}</span><span class="kick" style="margin-left:auto">News Flash</span></div>
    <div class="nf-gist"><b>The gist.</b> ${esc(d.gist)}</div>
    <div class="nf-imp">
      <div><b>Business</b>${esc(d.business)}</div>
      <div><b>Technical</b>${esc(d.technical)}</div>
      <div><b>Enterprise</b>${esc(d.enterprise)}</div></div>
    <div class="nf-mean"><b>Why an AI Systems Architect should care</b>${esc(d.architect)}</div>
    <p><strong>Do this next:</strong> ${esc(d.next)}</p>
    <div class="chips">${d.tags.map((t: string) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="foot">Source: ${esc(d.source)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">link</a>` : ''}<span class="conf"><span class="dot" style="background:#e11d48"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A news-brief (the card title is shown above by the app — do NOT repeat it as a headline): a red source badge + date ribbon (.nf-rib); a "The gist" callout (.nf-gist); a 3-cell Business/Technical/Enterprise impact grid (.nf-imp); a dark "Why an architect should care" panel (.nf-mean); a "Do this next" line; related tag chips; a source footer with a confidence dot.',
  sample: {
    source: 'Anthropic', date: 'Jul 19, 2026', url: 'https://www.anthropic.com/news',
    headline: 'Anthropic Ships Claude Opus 4.8 With a 1M-Token Context Window',
    gist: 'A new flagship model pairs a one-million-token context window with stronger agentic coding, aimed squarely at long-horizon enterprise workflows.',
    business: 'Lower integration cost for document-heavy work; faster time-to-value.',
    technical: 'Re-draws the RAG boundary — chunking, caching, and cost math all shift.',
    enterprise: 'Data residency + retention still apply to whatever the bigger context ingests.',
    architect: 'It changes the build-vs-retrieve tradeoff: you can hold an entire codebase or policy corpus in-context instead of standing up a vector store for every task. Re-baseline your retrieval designs against long context before committing to new infrastructure.',
    next: 'Benchmark one existing RAG workflow against a long-context prompt — compare cost, latency, and answer quality.',
    tags: ['long-context', 'RAG', 'Claude', 'cost modeling'],
    confidence: 'High',
  },
};

/* ─────────────────────────── 2. AI Research Digest ─────────────────────── */
const research: IntelFormat = {
  style: base('#4f46e5') + `
    .rd-badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#4f46e5;background:#eef0ff;border:1px solid #d8dcff;border-radius:8px;padding:4px 10px;margin-bottom:12px}
    .rd-h{font-size:23px;font-weight:800;margin:0 0 6px}
    .rd-abs{background:#f7f8ff;border:1px solid #e6e8fb;border-radius:14px;padding:15px 17px;margin:12px 0;font-size:15px;color:#33306b}
    .rd-abs b{color:#4f46e5}
    .rd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin:16px 0}
    .rd-card{border:1px solid #e6e8fb;border-radius:12px;padding:13px;background:#fff}
    .rd-card .t{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#4f46e5;margin-bottom:6px}
    .rd-idea{border-left:4px solid #4f46e5;padding:6px 0 6px 14px;margin:14px 0;color:#2b3040}
    .rd-idea b{color:#4f46e5}
    .rd-meter{height:8px;border-radius:99px;background:#e6e8fb;overflow:hidden;margin:6px 0 0}
    .rd-meter i{display:block;height:100%;background:#4f46e5}
    @media(max-width:560px){.rd-grid{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <span class="rd-badge">▲ ${esc(d.venue)}</span>
    <div class="kick">Research Digest</div>
    <div class="rd-abs"><b>In plain English.</b> ${esc(d.plain)}</div>
    <div class="rd-grid">
      <div class="rd-card"><div class="t">Innovation</div>${esc(d.innovation)}</div>
      <div class="rd-card"><div class="t">Business value</div>${esc(d.business)}</div>
      <div class="rd-card"><div class="t">Architecture impact</div>${esc(d.architecture)}</div></div>
    <div class="rd-idea"><b>Implementation idea.</b> ${esc(d.idea)}</div>
    <p style="margin-bottom:4px"><strong>Enterprise-readiness</strong></p>
    <div class="rd-meter"><i style="width:${esc(d.readiness)}%"></i></div>
    <small>${esc(d.readinessNote)}</small>
    <div class="chips">${d.tags.map((t: string) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="foot">Source: ${esc(d.venue)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">paper</a>` : ''}<span class="conf"><span class="dot" style="background:#4f46e5"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A paper card: a venue badge (.rd-badge, e.g. arXiv); a plain-English abstract box (.rd-abs); a 3-card row Innovation / Business value / Architecture impact (.rd-grid); an "Implementation idea" left-rule note (.rd-idea); an enterprise-readiness meter bar (.rd-meter); tag chips; source footer.',
  sample: {
    venue: 'arXiv', url: 'https://arxiv.org', title: 'Self-Reflection Improves Agent Reliability',
    plain: 'Letting an agent critique and revise its own output before it finishes meaningfully cuts error rates on multi-step tasks, at a modest token cost.',
    innovation: 'A cheap verify-before-commit pass added to the agent loop.',
    business: 'Fewer wrong actions → less human review, lower operational risk.',
    architecture: 'A verifier step you can add without new infrastructure.',
    idea: 'Add a single self-critique pass to one production agent workflow and measure the reliability delta before rolling it wider.',
    readiness: 65, readinessNote: 'Promising, but validate on your own tasks — reliability gains vary by domain.',
    tags: ['agents', 'evaluation', 'reliability'], confidence: 'Medium',
  },
};

/* ─────────────────────────── 3. AI Tool of the Day ─────────────────────── */
const tool: IntelFormat = {
  style: base('#0d9488') + `
    .tl-head{display:flex;align-items:center;gap:13px;margin-bottom:6px}
    .tl-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:none}
    .tl-name{font-size:22px;font-weight:800} .tl-name span{display:block;font-size:13px;font-weight:600;color:#6b7688}
    .tl-stats{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:9px;margin:16px 0}
    .tl-stats div{background:#f0fdfa;border:1px solid #cdeee9;border-radius:12px;padding:11px 10px;text-align:center}
    .tl-stats b{display:block;font-size:16px;color:#0f766e} .tl-stats span{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#5b7d78;font-weight:700}
    .tl-pc{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
    .tl-pc ul{margin:6px 0 0;padding:0;list-style:none} .tl-pc li{padding:3px 0 3px 22px;position:relative;font-size:13.5px}
    .tl-pc .pro li:before{content:'✓';position:absolute;left:0;color:#0d9488;font-weight:800}
    .tl-pc .con li:before{content:'✕';position:absolute;left:0;color:#e11d48;font-weight:800}
    .tl-pc h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0f766e}
    @media(max-width:560px){.tl-stats{grid-template-columns:1fr 1fr}.tl-pc{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <div class="kick">Tool of the Day</div>
    <div class="tl-head"><div class="tl-logo">${esc(d.initial)}</div><div class="tl-name">${esc(d.name)}<span>${esc(d.tagline)}</span></div></div>
    <p class="lead">${esc(d.what)}</p>
    <div class="tl-stats">
      <div><b>${esc(d.pricing)}</b><span>Pricing</span></div>
      <div><b>${esc(d.enterprise)}</b><span>Enterprise</span></div>
      <div><b>${esc(d.popularity)}</b><span>Popularity</span></div>
      <div><b>${esc(d.stack)}</b><span>Stack</span></div></div>
    <div class="tl-pc">
      <div class="pro"><h3>Pros</h3><ul>${li(d.pros)}</ul></div>
      <div class="con"><h3>Cons</h3><ul>${li(d.cons)}</ul></div></div>
    <p><strong>Alternatives:</strong> ${d.alternatives.map((a: string) => `<span class="chip">${esc(a)}</span>`).join(' ')}</p>
    <p><strong>Suggested project:</strong> ${esc(d.project)}</p>
    <div class="foot">Source: ${esc(d.source)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">site</a>` : ''}<span class="conf"><span class="dot" style="background:#0d9488"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A product spec sheet: a logo tile + name/tagline header (.tl-head); a one-line "what it does"; a 4-tile stat grid Pricing / Enterprise / Popularity / Stack (.tl-stats); a two-column Pros (✓) vs Cons (✕) block (.tl-pc); an Alternatives chip row; a Suggested project line; source footer.',
  sample: {
    initial: 'C', name: 'Claude Code', tagline: 'Agentic coding in the terminal', source: 'Claude Code docs', url: 'https://claude.com/claude-code',
    what: 'Plans, edits, tests, and commits across a real repository from the terminal or IDE — AI that executes tasks end-to-end, not just autocomplete.',
    pricing: 'Sub', enterprise: 'High', popularity: 'Fast', stack: 'MCP',
    pros: ['End-to-end task execution', 'Hooks, subagents, MCP', 'Real repo + GitHub'],
    cons: ['Needs review discipline', 'Scope permissions carefully'],
    alternatives: ['Cursor', 'Copilot', 'Aider'],
    project: 'Run one small refactor through it and review the diff before merging.',
    confidence: 'High',
  },
};

/* ─────────────────────────── 4. AI Video Stream ────────────────────────── */
const video: IntelFormat = {
  style: base('#dc2626') + `
    .vs-poster{position:relative;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#1a365d,#0d5967);height:200px;margin:6px 0 14px}
    .vs-poster .play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
    .vs-poster .play span{width:62px;height:62px;border-radius:50%;background:rgba(220,38,38,.92);display:flex;align-items:center;justify-content:center}
    .vs-poster .play span:after{content:'';border-left:20px solid #fff;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:5px}
    .vs-poster .cap{position:absolute;left:16px;right:16px;bottom:14px;color:#fff;font-weight:800;font-size:17px;text-shadow:0 1px 4px rgba(0,0,0,.5)}
    .vs-meta{display:flex;gap:14px;font-size:12.5px;color:#6b7688;margin-bottom:10px;font-weight:600}
    .vs-mom{list-style:none;margin:10px 0;padding:0}
    .vs-mom li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #f0f1f4}
    .vs-mom .ts{font-variant-numeric:tabular-nums;font-weight:800;color:#dc2626;flex:none;font-size:13px}
    .vs-take{background:#fef2f2;border-radius:12px;padding:13px 15px;margin-top:12px;color:#7f1d1d}`,
  render: (d) => `<div class="ip">
    <div class="kick">Video Stream</div>
    <div class="vs-poster"><div class="play"><span></span></div><div class="cap">${esc(d.title)}</div></div>
    <div class="vs-meta"><span>▸ ${esc(d.speaker)}</span><span>◷ ${esc(d.length)}</span><span>◈ ${esc(d.venue)}</span></div>
    <p class="lead">${esc(d.summary)}</p>
    ${d.moments?.length ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#dc2626;margin:14px 0 4px">Key moments</h3>
    <ul class="vs-mom">${d.moments.map((m: any) => `<li><span class="ts">${esc(m.t)}</span><span>${esc(m.text)}</span></li>`).join('')}</ul>` : ''}
    <div class="chips">${d.skills.map((s: string) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <div class="vs-take"><strong>Try first:</strong> ${esc(d.take)}</div>
    <div class="foot">Source: ${esc(d.venue)}<span class="conf"><span class="dot" style="background:#dc2626"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A watch card: a poster hero with a play button + title caption (.vs-poster); a speaker/length/venue meta row (.vs-meta); a summary; a chaptered "Key moments" list with timestamps (.vs-mom); skill chips; a "Try first" takeaway box (.vs-take).',
  sample: {
    // These values ship to students as a real published card, so they must
    // describe the video actually linked in seedIntelSampleCards.ts. They
    // previously did not: the copy claimed a 32-minute "Conference talk" with
    // chapter marks at 02:10 / 11:40 / 21:05 against a 2m50s video, and the
    // link itself was dead. Title, speaker and length below are verified via
    // the YouTube oEmbed endpoint. `moments` is empty because real chapter
    // marks cannot be verified without watching the video, and inventing them
    // is what produced the wrong ones — the renderer now omits the "Key
    // moments" block entirely when there are none.
    title: 'How Claude Code Works', speaker: 'Claude', length: '3 min', venue: 'Anthropic video',
    summary: 'How Claude Code runs an agentic loop: gathering context, taking action, and verifying the result.',
    moments: [],
    skills: ['agent orchestration', 'context engineering'], take: 'Try a read-only exploration subagent on your own codebase before your next big change.',
    confidence: 'Medium',
  },
};

/* ─────────────────────────── 5. AI Quote of the Day ────────────────────── */
const quote: IntelFormat = {
  style: base('#b45309') + `
    .qt{text-align:center;padding:8px 0 4px}
    .qt-mark{font-size:64px;line-height:.5;color:#f0c98a;font-family:Georgia,serif;height:34px}
    .qt-q{font-size:26px;line-height:1.3;font-weight:700;color:#7c3a09;max-width:600px;margin:8px auto 18px;font-family:Georgia,'Times New Roman',serif}
    .qt-who{display:inline-flex;align-items:center;gap:12px;text-align:left;background:#fffaf1;border:1px solid #f3e3c6;border-radius:14px;padding:11px 16px}
    .qt-av{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#b45309,#92400e);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
    .qt-who b{display:block} .qt-who span{font-size:12.5px;color:#8a6d3b}
    .qt-ctx{margin:18px 0;color:#3a3a3a}
    .qt-end{background:#fef7e9;border-left:4px solid #b45309;border-radius:0 10px 10px 0;padding:12px 15px;color:#6b4a12}`,
  render: (d) => `<div class="ip">
    <div class="kick" style="text-align:center">Quote of the Day</div>
    <div class="qt">
      <div class="qt-mark">&ldquo;</div>
      <div class="qt-q">${esc(d.quote)}</div>
      <div class="qt-who"><span class="qt-av">${esc(d.initial)}</span><span><b>${esc(d.person)}</b><span>${esc(d.org)} · ${esc(d.date)}</span></span></div>
    </div>
    <p class="qt-ctx"><strong>Context.</strong> ${esc(d.context)}</p>
    <div class="qt-end"><strong>Why it endures.</strong> ${esc(d.endures)}</div>
    <p style="margin-top:14px"><strong>Reflect:</strong> ${esc(d.reflect)}</p>
    <div class="foot">Source: ${esc(d.source)}<span class="conf"><span class="dot" style="background:#b45309"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A pull-quote design: a big serif quotation mark; the quote in large serif type (.qt-q); an attribution card with an avatar circle, name, org, date (.qt-who); a "Context" paragraph; a "Why it endures" callout (.qt-end); a reflect line.',
  sample: {
    quote: 'Enterprises do not adopt intelligence they cannot trust.', initial: 'R', person: 'An enterprise-AI leader', org: 'Industry keynote', date: '2026', source: 'Keynote',
    context: 'Said in the context of why governance precedes capability — reliability and auditability, not raw model power, gate real-world adoption.',
    endures: 'It reframes the enterprise AI problem from "smarter models" to "trustworthy systems" — which is exactly the architect\'s remit.',
    reflect: 'Do you agree that trust precedes intelligence for enterprise adoption? Why?', confidence: 'Low',
  },
};

/* ─────────────────────────── 6. AI Architecture Breakdown ──────────────── */
const architecture: IntelFormat = {
  style: base('#2563eb') + `
    .ab-h{font-size:22px;font-weight:800;margin:2px 0 4px}
    .ab-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#f4f7ff;border:1px solid #dde6fb;border-radius:12px;padding:11px 13px;margin:12px 0;font-size:12.5px;font-weight:700;color:#1e40af}
    .ab-flow span.a{color:#94a3b8}
    .ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
    .ab-b{border:1px solid #e3e8f2;border-radius:12px;padding:12px 13px;background:#fff}
    .ab-b .t{display:flex;align-items:center;gap:8px;font-weight:800;color:#2563eb;font-size:13.5px;margin-bottom:4px}
    .ab-b .ic{width:22px;height:22px;border-radius:6px;background:#2563eb14;display:inline-flex;align-items:center;justify-content:center;font-size:13px}
    .ab-b p{margin:0;font-size:13px;color:#475064}
    .ab-gov{background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 10px 10px 0;padding:12px 15px;margin-top:6px}
    @media(max-width:560px){.ab-grid{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <div class="kick">Architecture Breakdown</div>
    <h1 class="ab-h">${esc(d.name)}</h1>
    <p class="lead">${esc(d.what)}</p>
    <div class="ab-flow">${d.flow.map((f: string, i: number) => `${i ? '<span class="a">→</span>' : ''}<span>${esc(f)}</span>`).join('')}</div>
    <div class="ab-grid">${d.blocks.map((b: any) => `<div class="ab-b"><div class="t"><span class="ic">${esc(b.icon)}</span>${esc(b.name)}</div><p>${esc(b.desc)}</p></div>`).join('')}</div>
    <div class="ab-gov"><strong>Governance.</strong> ${esc(d.governance)}</div>
    <p style="margin-top:12px"><strong>Reuse:</strong> ${esc(d.reuse)}</p>
    <div class="foot">Source: ${esc(d.source)}<span class="conf"><span class="dot" style="background:#2563eb"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A system map: the system name + one-liner; a horizontal data-flow strip (.ab-flow, e.g. Query → Retrieve → Rank → Ground → Cite); a 2-col grid of component blocks each with an icon (agents, models, data flow, MCP, vector DB, memory, observability) (.ab-grid); a "Governance" callout (.ab-gov); a "Reuse" line.',
  sample: {
    name: 'Perplexity', source: 'Engineering write-ups',
    what: 'An answer engine that fuses live web retrieval with an LLM and always cites its sources.',
    flow: ['Query', 'Retrieve', 'Rank', 'Ground', 'Cite'],
    blocks: [
      { icon: '◆', name: 'Retrieval', desc: 'Live web search; ranking dominates answer quality.' },
      { icon: '▣', name: 'Models', desc: 'LLM handles the last-mile grounded generation.' },
      { icon: '⛁', name: 'Vector DB', desc: 'Embeddings + rerankers select passages.' },
      { icon: '✎', name: 'Citations', desc: 'Every claim links to a source for defensibility.' },
    ],
    governance: 'Grounding with citations is exactly what regulated enterprises need to defend an answer.',
    reuse: 'The retrieve → rank → ground → cite pattern maps directly onto an enterprise knowledge assistant.', confidence: 'Medium',
  },
};

/* ─────────────────────────── 7. Build Breakdown ────────────────────────── */
const build: IntelFormat = {
  style: base('#16a34a') + `
    .bd-shot{border:1px solid #dfeee3;border-radius:12px;overflow:hidden;margin:8px 0 14px;background:#f6fbf7}
    .bd-shot .bar{display:flex;gap:6px;padding:9px 12px;border-bottom:1px solid #e4f0e8;background:#eef8f1}
    .bd-shot .bar i{width:10px;height:10px;border-radius:50%;background:#c4ddca}
    .bd-shot .body{padding:22px;text-align:center;color:#3b6b47}
    .bd-shot .body b{display:block;font-size:26px}
    .bd-arch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;font-weight:700;color:#15803d;background:#f0fdf4;border-radius:12px;padding:11px;margin:12px 0}
    .bd-arch span.a{color:#9cc6a8}
    .bd-les{list-style:none;margin:12px 0;padding:0}
    .bd-les li{padding:5px 0 5px 24px;position:relative} .bd-les li:before{content:'✓';position:absolute;left:0;color:#16a34a;font-weight:800}
    .bd-repo{display:inline-flex;align-items:center;gap:8px;background:#0f172a;color:#fff;border-radius:10px;padding:9px 15px;font-weight:700;font-size:13px}`,
  render: (d) => `<div class="ip">
    <div class="kick">Build Breakdown</div>
    <div class="bd-shot"><div class="bar"><i></i><i></i><i></i></div><div class="body"><b>${esc(d.shotBig)}</b>${esc(d.shotSub)}</div></div>
    <p class="lead">${esc(d.what)}</p>
    <div class="bd-arch">${d.arch.map((a: string, i: number) => `${i ? '<span class="a">+</span>' : ''}<span>${esc(a)}</span>`).join('')}</div>
    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#16a34a;margin:12px 0 2px">Lessons learned</h3>
    <ul class="bd-les">${li(d.lessons)}</ul>
    <p><strong>Prompt techniques:</strong> ${d.techniques.map((t: string) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>
    <p>${d.url ? `<a class="bd-repo" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">⎇ View repository</a>` : ''}</p>
    <div class="foot">Source: ${esc(d.source)}<span class="conf"><span class="dot" style="background:#16a34a"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A build showcase: a "screenshot" frame with a window bar + a big highlight (.bd-shot); a "what was built" lead; a horizontal architecture strip (.bd-arch); a ✓ "Lessons learned" checklist (.bd-les); a Prompt-techniques chip row; a dark "View repository" button (.bd-repo).',
  sample: {
    title: 'A Solo Dev\'s MCP-Powered Research Agent', source: 'GitHub + dev blog', url: 'https://github.com',
    shotBig: 'Autonomous research → cited report', shotSub: 'fan-out search · verify · synthesize',
    what: 'One developer shipped an agent that fans out web searches, verifies claims, and writes a cited report — wired together with MCP servers and a small orchestration loop.',
    arch: ['Orchestrator', 'MCP tools', 'Web search', 'Verifier', 'Synthesis'],
    lessons: ['Verification is the hard part, not search', 'MCP made tools swappable', 'Small loop beat a big framework'],
    techniques: ['fan-out', 'adversarial verify', 'synthesis'], confidence: 'Medium',
  },
};

/* ─────────────────────────── 8. MCP Server Spotlight ───────────────────── */
const mcp: IntelFormat = {
  style: base('#7c3aed') + `
    .mc-h{display:flex;align-items:center;gap:11px;margin-bottom:6px}
    .mc-ic{width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}
    .mc-name{font-size:21px;font-weight:800} .mc-name span{display:block;font-size:12.5px;color:#6b7688;font-weight:600}
    .term{background:#1e1b2e;color:#e9e4f7;border-radius:11px;padding:13px 15px;font-family:'Roboto Mono',ui-monospace,Consolas,monospace;font-size:12.5px;margin:12px 0;overflow:auto}
    .term .p{color:#a78bfa} .term .c{color:#c4b5fd}
    .mc-arch{list-style:none;margin:10px 0;padding:0}
    .mc-arch li{padding:6px 0 6px 26px;position:relative;font-size:13.5px} .mc-arch li:before{content:'▸';position:absolute;left:6px;color:#7c3aed;font-weight:800}
    .mc-val{background:#f5f2ff;border-left:4px solid #7c3aed;border-radius:0 10px 10px 0;padding:12px 15px;margin:12px 0}`,
  render: (d) => `<div class="ip">
    <div class="kick">MCP Server Spotlight</div>
    <div class="mc-h"><div class="mc-ic">⬡</div><div class="mc-name">${esc(d.name)}<span>${esc(d.tagline)}</span></div></div>
    <p class="lead">${esc(d.what)}</p>
    <div class="term"><span class="p">$</span> <span class="c">${esc(d.install)}</span></div>
    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed;margin:10px 0 2px">Architecture</h3>
    <ul class="mc-arch">${li(d.arch)}</ul>
    <div class="mc-val"><strong>Business value.</strong> ${esc(d.value)}</div>
    <p><strong>Integrates with:</strong> ${d.integrations.map((t: string) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>
    <p><strong>Try it:</strong> ${esc(d.tryit)}</p>
    <div class="foot">Source: ${esc(d.source)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">repo</a>` : ''}<span class="conf"><span class="dot" style="background:#7c3aed"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A server card: an icon + name/tagline header (.mc-h); a "what it does" lead; an install command in a terminal block (.term); a "▸" architecture list (.mc-arch); a "Business value" callout (.mc-val); an Integrations chip row; a "Try it" line.',
  sample: {
    name: 'GitHub MCP Server', tagline: 'GitHub as agent-callable tools', source: 'MCP registry', url: 'https://github.com',
    what: 'Exposes GitHub — issues, PRs, code search, file contents — as tools an AI agent can call directly, so it acts on real project state instead of guessing.',
    install: 'claude mcp add github --transport stdio',
    arch: ['Stdio transport, typed tool schema', 'Scoped token → least-privilege access', 'Every tool call is auditable'],
    value: 'Automates routine repo triage, review summaries, and reporting.',
    integrations: ['Claude Code', 'agents', 'CI'], tryit: 'Install it into a Claude Code project and have it summarize the open PRs.', confidence: 'High',
  },
};

/* ─────────────────────────── 9. Claude Code Technique ──────────────────── */
const technique: IntelFormat = {
  style: base('#0ea5a4', '#0f172a') + `
    .tq-h{font-size:22px;font-weight:800;margin:2px 0 8px}
    .tq-steps{counter-reset:s;list-style:none;margin:12px 0;padding:0}
    .tq-steps li{position:relative;padding:4px 0 12px 40px;border-left:2px solid #d6efe8;margin-left:14px}
    .tq-steps li:before{counter-increment:s;content:counter(s);position:absolute;left:-15px;top:0;width:28px;height:28px;border-radius:50%;background:#0ea5a4;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
    .term{background:#0f172a;color:#d1fae5;border-radius:11px;padding:13px 15px;font-family:'Roboto Mono',ui-monospace,Consolas,monospace;font-size:12.5px;margin:12px 0;line-height:1.7;overflow:auto}
    .term .p{color:#5eead4}
    .tq-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
    .tq-two div{border:1px solid #e3ecea;border-radius:12px;padding:12px}
    .tq-two h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#0ea5a4;margin-bottom:5px}
    .tq-try{background:#ecfdf5;border-radius:12px;padding:12px 15px;margin-top:8px;color:#065f46}
    @media(max-width:560px){.tq-two{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <div class="kick">Claude Code Technique</div>
    <p class="lead">${esc(d.what)}</p>
    <ol class="tq-steps">${li(d.steps)}</ol>
    <div class="term">${d.cmds.map((c: string) => `<div><span class="p">$</span> ${esc(c)}</div>`).join('')}</div>
    <div class="tq-two">
      <div><h3>When to use</h3>${esc(d.when)}</div>
      <div><h3>Pitfalls</h3>${esc(d.pitfall)}</div></div>
    <div class="tq-try"><strong>Try it:</strong> ${esc(d.tryit)}</div>
    <div class="foot">Source: ${esc(d.source)}<span class="conf"><span class="dot" style="background:#0ea5a4"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A technique card (the title is shown above by the app — do NOT repeat it): a one-line "what it is" lead (.lead); a numbered step flow (.tq-steps); a terminal command block (.term); a two-column "When to use" / "Pitfalls" (.tq-two); a "Try it" box (.tq-try).',
  sample: {
    title: 'Split Exploration From Editing With Subagents', source: 'Claude Code best practices',
    what: 'Use read-only exploration subagents to map an unfamiliar subsystem, then edit with the main agent — keeping the editing context lean.',
    steps: ['Fan out read-only Explore subagents over the relevant areas', 'Collect their findings into one map', 'Edit with the main agent using the full picture', 'Verify before committing'],
    cmds: ['claude # main session', '> use 3 Explore subagents to map the auth flow', '> now refactor with that context'],
    when: 'Cross-cutting changes in a large or unfamiliar repo, where context would otherwise bloat.',
    pitfall: 'Don\'t let exploration agents edit — read-only keeps the blast radius small.',
    tryit: 'On your next big change, run an exploration subagent first and edit only after reading its map.', confidence: 'High',
  },
};

/* ─────────────────────────── 10. Market Intelligence ───────────────────── */
const market: IntelFormat = {
  style: base('#059669') + `
    .mi-h{font-size:22px;font-weight:800;margin:2px 0 8px}
    .mi-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
    .mi-t{border:1px solid #d6ede2;border-radius:13px;padding:13px 14px;background:#f0fdf8}
    .mi-t .lab{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#5b806f;font-weight:700}
    .mi-t .val{font-size:19px;font-weight:800;color:#047857;display:flex;align-items:center;gap:6px}
    .mi-t .up{color:#059669} .mi-t .dn{color:#e11d48}
    .mi-t small{color:#5b7d6f}
    .mi-rec{background:linear-gradient(135deg,#065f46,#047857);color:#eafff6;border-radius:14px;padding:16px 18px;margin:14px 0}
    .mi-rec b{color:#fff;display:block;margin-bottom:5px;font-size:15px}
    @media(max-width:560px){.mi-tiles{grid-template-columns:1fr}}`,
  render: (d) => `<div class="ip">
    <div class="kick">Market Intelligence</div>
    <p class="lead">${esc(d.what)}</p>
    <div class="mi-tiles">${d.tiles.map((t: any) => `<div class="mi-t"><div class="lab">${esc(t.lab)}</div><div class="val"><span class="${t.dir === 'down' ? 'dn' : 'up'}">${t.dir === 'down' ? '▼' : '▲'}</span>${esc(t.val)}</div><small>${esc(t.note)}</small></div>`).join('')}</div>
    <div class="mi-rec"><b>Strategic recommendation</b>${esc(d.rec)}</div>
    <div class="chips">${d.tags.map((t: string) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="foot">Source: ${esc(d.source)}<span class="conf"><span class="dot" style="background:#059669"></span>Confidence: ${esc(d.confidence)}</span></div>
  </div>`,
  structure: 'A market-signal dashboard (the signal/title is shown above by the app — do NOT repeat it as a headline): a "what it is" lead (.lead); a 2x2 grid of metric tiles with ▲/▼ arrows (industry, funding, hiring, demand) (.mi-tiles); a highlighted "Strategic recommendation" panel (.mi-rec); tag chips.',
  sample: {
    signal: 'Enterprise AI Spend Shifts From Pilots to Platforms', source: 'Opportunity Pulse + industry reports',
    what: 'Buying is consolidating from scattered proofs-of-concept onto AI platforms, with budget concentrating on governance, evaluation, and integration.',
    tiles: [
      { lab: 'Platform demand', val: 'Rising', dir: 'up', note: 'consolidation over point tools' },
      { lab: 'Governance budget', val: '+ Strong', dir: 'up', note: 'audit + eval line items' },
      { lab: 'PoC spend', val: 'Cooling', dir: 'down', note: 'fewer one-off experiments' },
      { lab: 'AI-architect hiring', val: 'Up', dir: 'up', note: 'systems > model access' },
    ],
    rec: 'Map one initiative to a platform capability buyers are funding — governance, evals, or integration — and lead with the outcome, not the model.',
    tags: ['strategy', 'platforms', 'governance'], confidence: 'Medium',
  },
};

export const INTEL_FORMATS: Record<string, IntelFormat> = {
  ai_news_flash: news,
  ai_research_digest: research,
  ai_tool_of_the_day: tool,
  ai_video_stream: video,
  ai_quote_of_the_day: quote,
  ai_architecture_breakdown: architecture,
  build_breakdown: build,
  mcp_server_spotlight: mcp,
  claude_code_technique: technique,
  market_intelligence: market,
};

/** The full sample body_html for a type (style + rendered sample). */
export function sampleBodyFor(slug: string): string {
  const f = INTEL_FORMATS[slug];
  if (!f) return '';
  return `<style>${f.style}</style>${f.render(f.sample)}`;
}
