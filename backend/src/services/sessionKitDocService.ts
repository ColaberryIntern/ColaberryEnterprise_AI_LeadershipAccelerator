// ============================================================================
// sessionKitDocService — renders the full interactive Class Kit teaching deck
// (the Open-House-style HTML that runs a class) for one live session.
//
// Reuses buildSessionKit for the session facts + student check-in QR + cohort +
// meeting link, then buildKitSpec (run of show + slides from the week blueprint)
// and renderKitHtml (self-contained deck). Returns a complete HTML document the
// admin opens in a new tab and shares on screen while teaching.
//
// Live pulse is off here (the deck runs standalone). Wiring the live-state feed
// is a follow-up; renderKitHtml already accepts a { live } config for it.
// ============================================================================
import { env } from '../config/env';
import { buildSessionKit } from './sessionKitService';
import { buildKitSpec } from './classKit/kitSpec';
import { renderKitHtml } from './classKit/kitHtml';
import { renderClassOutline } from './classKit/outlineHtml';
import { mintKitToken } from './classKit/kitToken';

/**
 * Render the plain-language CLASS OUTLINE for a session — a one-page teaching plan
 * (segments, time windows, the teaching points under each) to review and prepare
 * from. Same content as the deck, read as a lesson plan. Null if session missing.
 */
export async function renderSessionOutline(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
  });
  return renderClassOutline(spec);
}

export type KitDocMode = 'live' | 'rehearse' | 'standalone';

/**
 * Render the Class Kit deck HTML for a session. Returns null if the session does
 * not exist (caller maps that to a 404). Deterministic.
 *   • 'live'       — full live pulse/sync (default; used by ▶ Present).
 *   • 'rehearse'   — live OFF so practising doesn't broadcast to students.
 *   • 'standalone' — live OFF, for the downloadable offline file.
 */
export async function renderSessionKitDoc(sessionId: string, mode: KitDocMode = 'live'): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;

  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
  });

  if (mode !== 'live') {
    // Rehearse / offline: no broadcast, no live-state polling.
    return renderKitHtml(spec, { live: { enabled: false } });
  }

  // Enable the live pulse: the deck (opened via document.write into an about:blank
  // window) polls the session-scoped live-state endpoint with a short-lived kit
  // token. The endpoint must be ABSOLUTE — a relative URL won't resolve from an
  // about:blank document — and it stays same-origin as the admin page (which
  // inherited that origin), so the fetch needs no CORS and no cookies.
  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  return renderKitHtml(spec, {
    live: {
      enabled: true,
      endpoint: `${base}/api/portal/sessions/${sessionId}/live-state`,
      broadcastEndpoint: `${base}/api/portal/sessions/${sessionId}/broadcast`,
      token: mintKitToken(sessionId),
      pollMs: 4000,
    },
  });
}

/**
 * A lightweight instructor readiness report: class facts, counts (teaching slides,
 * prompts, checkpoints, interactions, diagrams), and the source/evidence ledger.
 * Read before class to prep + to review what's sourced. Null if session missing.
 */
export async function renderSessionReadinessReport(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;
  const spec = buildKitSpec({
    session: kit.session, cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url, qrSvg: kit.qr_svg, meetLink: kit.meeting_link,
  });

  const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
  const slides = spec.slides;
  const count = (fn: (s: typeof slides[number]) => boolean) => slides.filter(fn).length;
  const teach = count((s) => s.kind === 'teach');
  const prompts = count((s) => !!s.prompt);
  const checkpoints = count((s) => s.kind === 'checkpoint');
  const interactions = count((s) => s.kind === 'interaction');
  const diagrams = count((s) => !!s.diagram);
  const evidence = slides.flatMap((s) => s.evidence || []);
  const hasMeet = !!kit.meeting_link;

  const gate = (ok: boolean, label: string) => `<li class="${ok ? 'ok' : 'warn'}">${ok ? '✅' : '⚠️'} ${esc(label)}</li>`;
  const evidenceRows = evidence.length
    ? evidence.map((e) => `<li><b>${esc(e.publisher)}</b>${e.sourceTitle ? ' · ' + esc(e.sourceTitle) : ''}${e.publicationDate ? ' (' + esc(e.publicationDate) + ')' : ''}${e.note ? ' — <i>' + esc(e.note) + '</i>' : ''}<br><span class="claim">“${esc(e.claim)}”</span></li>`).join('')
    : '<li>No sourced factual claims flagged for this class.</li>';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Readiness · ${esc(spec.meta.dayLabel)} · ${esc(spec.meta.title)}</title>
<style>
  body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1a202c;max-width:760px;margin:0 auto;padding:30px 22px 70px;line-height:1.5}
  h1{font-size:26px;margin:4px 0} .kick{color:#E5121D;font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:12px}
  .meta{color:#64748b;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:14px 0}
  .stat{background:#faf7f5;border:1px solid #e8e2de;border-radius:10px;padding:12px;text-align:center}
  .stat b{display:block;font-size:26px} .stat span{font-size:12px;color:#64748b}
  h2{font-size:17px;margin:22px 0 8px;color:#1a365d} ul{margin:6px 0;padding-left:20px} li{margin:5px 0}
  li.warn{color:#a26208} .claim{color:#475569;font-size:13.5px}
  .foot{margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px solid #e8e2de;padding-top:12px}
</style></head><body>
<div class="kick">Readiness · ${esc(spec.meta.cohortName)} · ${esc(spec.meta.dayLabel)}</div>
<h1>${esc(spec.meta.title)}</h1>
<div class="meta">${esc(spec.meta.dateLabel)} · ${esc(spec.meta.timeRange)} · ${spec.meta.durationMin} min</div>
<div class="grid">
  <div class="stat"><b>${slides.length}</b><span>slides</span></div>
  <div class="stat"><b>${teach}</b><span>teaching</span></div>
  <div class="stat"><b>${prompts}</b><span>prompts</span></div>
  <div class="stat"><b>${checkpoints}</b><span>checkpoints</span></div>
  <div class="stat"><b>${interactions}</b><span>polls/trivia</span></div>
  <div class="stat"><b>${diagrams}</b><span>diagrams</span></div>
</div>
<h2>Readiness gates</h2>
<ul>
  ${gate(slides.length >= 12, `Content depth — ${slides.length} slides (${teach} teaching)`)}
  ${gate(spec.totalMinutes > 0, `Timing — ${spec.totalMinutes} min run of show`)}
  ${gate(hasMeet, hasMeet ? 'Meeting link generated' : 'No meeting link yet — generate one from the session row')}
  ${gate(spec.meta.dayKind === 'orientation' || prompts > 0, spec.meta.dayKind === 'build' ? `Build prompts present (${prompts})` : 'Prompts present where expected')}
  ${gate(true, 'QR check-in embedded on the cover + full-screen (Q)')}
</ul>
<h2>Source / evidence ledger</h2>
<ul>${evidenceRows}</ul>
<h2>Before you present</h2>
<ul>
  <li>Open <b>▶ Present</b> and press <b>Start class</b> to arm the pace tracker.</li>
  <li>The check-in QR is on slide 1; students scan once and their phones follow the deck.</li>
  <li><b>N</b> = presenter notes/script · <b>V</b> = Focus (clean recording) · <b>C</b> = Compact (side-by-side with Claude Code) · <b>Q</b> = full-screen QR.</li>
  <li>If live sync drops, the class content still works — keep teaching; the pace tracker is client-side.</li>
</ul>
<div class="foot">Readiness report · generated from the Class Kit · AI Systems Architect Accelerator</div>
</body></html>`;
}
