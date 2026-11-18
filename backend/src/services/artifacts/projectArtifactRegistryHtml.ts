/**
 * projectArtifactRegistryHtml - PURE. The registry as a page a person opens and reads.
 *
 * No I/O and no clock beyond the timestamp handed in, so the same registry renders byte-identical
 * HTML and a test can assert the whole page rather than fragments of it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE REFUSES TO DO
 * ---------------------------------------------------------------------------
 * 1. IT NEVER SHOWS "0 OUTSTANDING" AS GOOD NEWS FOR A PROJECT THAT PROMISED NOTHING. 0 of 67
 *    published plans carry a contract today, so a naive page would show a green zero for almost
 *    every project in the system, which is the precise illusion this whole workstream exists to
 *    end. `requires_nothing` gets its own amber state and its own sentence.
 *
 * 2. IT NEVER RENDERS A FAILED READ AS AN EMPTY LIST. A warning is a red band at the top, above
 *    everything, because "we could not look" and "there is nothing there" must not look alike.
 *
 * 3. IT SAYS WHAT THE MISSING THING WAS SUPPOSED TO BE. The ticket's whole point: for every
 *    outstanding artifact the page carries the path it was promised at and the sentence it would
 *    have been judged by, so a reader does not have to go and find the contract.
 *
 * Colours come from `frontend/src/styles/tokens.css`, read on 2026-11-18 rather than copied from
 * the summary table in the baseline-ui skill, which has been wrong before: cherry #FB2832,
 * cherry-deep #C20E1E, leaf #77BB4A, leaf-text #468A2E, text #2d3748, muted #718096,
 * border #e2e8f0, alt background #f7fafc.
 */

import type {
  ExistingArtifact,
  ProjectArtifactRegistry,
  RequiredArtifact,
  RequiredArtifactState,
} from './projectArtifactRegistry';

const T = {
  cherry: '#FB2832',
  cherryDeep: '#C20E1E',
  cherryBg: '#FFF0F1',
  leaf: '#77BB4A',
  leafText: '#468A2E',
  leafBg: '#F1F9EA',
  text: '#2d3748',
  muted: '#718096',
  border: '#e2e8f0',
  bgAlt: '#f7fafc',
  amber: '#B7791F',
  amberBg: '#FFFAF0',
};

export function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** How each state reads, and in what colour. Exported so a test can hold the set complete. */
export const STATE_LABELS: Record<RequiredArtifactState, { label: string; tone: 'good' | 'bad' | 'warn' }> = {
  satisfied: { label: 'Handed over', tone: 'good' },
  present_content_unchecked: { label: 'In place, contents unread', tone: 'warn' },
  missing: { label: 'Still owed', tone: 'bad' },
  not_repo_evidence: { label: 'On the platform, not checkable here', tone: 'warn' },
};

const toneColour = (tone: 'good' | 'bad' | 'warn') => (
  tone === 'good' ? { fg: T.leafText, bg: T.leafBg }
    : tone === 'bad' ? { fg: T.cherryDeep, bg: T.cherryBg }
      : { fg: T.amber, bg: T.amberBg });

const pill = (text: string, tone: 'good' | 'bad' | 'warn') => {
  const c = toneColour(tone);
  return `<span style="display:inline-block;padding:2px 9px;border-radius:11px;font-size:12px;`
    + `font-weight:600;color:${c.fg};background:${c.bg};white-space:nowrap">${esc(text)}</span>`;
};

const stat = (value: number | string, label: string, tone: 'good' | 'bad' | 'warn' | 'plain') => {
  const fg = tone === 'good' ? T.leafText : tone === 'bad' ? T.cherryDeep
    : tone === 'warn' ? T.amber : T.text;
  return `<div style="flex:1;min-width:120px;padding:14px 16px;background:#fff;border:1px solid ${T.border};`
    + `border-radius:10px">`
    + `<div style="font-size:30px;font-weight:700;line-height:1.1;color:${fg}">${esc(value)}</div>`
    + `<div style="font-size:12px;color:${T.muted};margin-top:4px">${esc(label)}</div></div>`;
};

function requiredRow(r: RequiredArtifact): string {
  const s = STATE_LABELS[r.state];
  const where = r.repo_path
    ? `<code style="font-size:12px">${esc(r.repo_path)}</code>`
    : `<span style="color:${T.muted};font-size:12px">handed over on the platform</span>`;
  const provenance = r.commit_sha
    ? `<code style="font-size:12px">${esc(r.commit_sha.slice(0, 9))}</code>`
      + `<div style="font-size:11px;color:${T.muted}">${esc((r.seen_at || '').slice(0, 10))}</div>`
    : `<span style="color:${T.muted};font-size:12px">not seen</span>`;
  return `<tr style="border-top:1px solid ${T.border}">`
    /* nowrap because the browser breaks ART-001 at the hyphen into "ART-" and "001", which was
       only visible in a screenshot: every assertion about this cell still passed. */
    + `<td style="padding:10px 12px;vertical-align:top;white-space:nowrap">`
    + `<code style="font-weight:700">${esc(r.key)}</code>`
    + `<div style="font-size:11px;color:${T.muted}">${esc(r.story_id)}</div></td>`
    + `<td style="padding:10px 12px;vertical-align:top">${esc(r.name)}`
    + `<div style="font-size:11px;color:${T.muted}">${esc(r.type)}</div></td>`
    + `<td style="padding:10px 12px;vertical-align:top">${pill(s.label, s.tone)}</td>`
    + `<td style="padding:10px 12px;vertical-align:top">${where}</td>`
    + `<td style="padding:10px 12px;vertical-align:top">${provenance}</td>`
    + `<td style="padding:10px 12px;vertical-align:top;color:${T.muted};font-size:13px;max-width:360px">`
    + `${esc(r.evaluation_criteria)}</td>`
    + '</tr>';
}

/** How many items a group shows before it is collapsed behind a disclosure. */
export const GROUP_COLLAPSE_AT = 6;

/*
 * A project holds up to 79 artifacts, and rendering every one as a bullet turned this section
 * into a wall roughly 2,000 pixels tall that nobody would read. Found by screenshotting the page,
 * not by a test: every assertion passed on the wall. Groups above the threshold collapse, so the
 * section reads as a glance ("build_artifact (24), case_study (15)") and still holds everything.
 */
function existingGroup(type: string, items: ExistingArtifact[]): string {
  const rows = items.map((a) => `<li style="margin:3px 0">${esc(a.title)}`
    + `<span style="color:${T.muted};font-size:11px"> &middot; ${esc(a.created_at.slice(0, 10))}</span></li>`).join('');
  const list = `<ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${rows}</ul>`;
  const head = `${esc(type)} <span style="color:${T.muted};font-weight:400">(${items.length})</span>`;
  if (items.length <= GROUP_COLLAPSE_AT) {
    return `<div style="margin:0 0 14px"><div style="font-weight:600;font-size:13px">${head}</div>`
      + `${list}</div>`;
  }
  return `<details style="margin:0 0 10px"><summary style="font-weight:600;font-size:13px;`
    + `cursor:pointer">${head}</summary>${list}</details>`;
}

/** The whole page. `generatedAt` is passed in so this stays pure. */
export function renderProjectArtifactRegistry(
  r: ProjectArtifactRegistry,
  generatedAt: string,
): string {
  const verdictTone = r.verdict === 'all_satisfied' ? 'good'
    : r.verdict === 'outstanding' ? 'bad' : 'warn';
  const vc = toneColour(verdictTone);

  const warnings = r.warnings.length
    ? `<div style="margin:0 0 18px;padding:14px 16px;border-radius:10px;background:${T.cherryBg};`
      + `border:1px solid ${T.cherry};color:${T.cherryDeep}">`
      + `<strong>Something could not be read, so this page is incomplete.</strong>`
      + `<ul style="margin:8px 0 0;padding-left:20px">`
      + r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')
      + '</ul></div>'
    : '';

  const malformed = r.malformed.length
    ? `<h2 style="font-size:16px;margin:26px 0 8px;color:${T.cherryDeep}">Contracts that do not parse `
      + `(${r.malformed.length})</h2>`
      + `<p style="margin:0 0 8px;color:${T.muted};font-size:13px">These stories declare an artifact `
      + 'contract the schema refuses, so nothing is required of them and nothing is checked. They '
      + 'are listed because an unreadable promise is not the same as no promise.</p>'
      + `<ul style="font-size:13px">`
      + r.malformed.map((m) => `<li><code>${esc(m.story_id)}</code>: ${esc(m.refusals.join(', '))}</li>`).join('')
      + '</ul>'
    : '';

  const requiredTable = r.required.length
    ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${T.border};`
      + `border-radius:10px;overflow:hidden">`
      + `<thead><tr style="background:${T.bgAlt};text-align:left;font-size:12px;color:${T.muted}">`
      + '<th style="padding:9px 12px">Key</th><th style="padding:9px 12px">What</th>'
      + '<th style="padding:9px 12px">State</th><th style="padding:9px 12px">Promised at</th>'
      + '<th style="padding:9px 12px">Seen at commit</th>'
      + '<th style="padding:9px 12px">Judged by</th></tr></thead>'
      + `<tbody>${r.required.map(requiredRow).join('')}</tbody></table>`
    : `<div style="padding:16px;border:1px dashed ${T.border};border-radius:10px;color:${T.muted};`
      + `font-size:14px">This project's plan requires no artifacts. That is an absence of `
      + 'promises, not a clean record: nothing here can be missing because nothing was asked for.'
      + '</div>';

  const byType = new Map<string, ExistingArtifact[]>();
  for (const a of r.existing) {
    const k = a.catalog_type || 'unclassified';
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(a);
  }
  const existingBlock = r.existing.length
    ? [...byType.entries()].sort((a, b) => b[1].length - a[1].length)
      .map(([t, items]) => existingGroup(t, items)).join('')
    : `<div style="color:${T.muted};font-size:14px">Nothing recorded for this project.</div>`;

  const unclassified = r.unclassified.length
    ? `<h2 style="font-size:16px;margin:26px 0 8px">Unclassified (${r.unclassified.length})</h2>`
      + `<p style="margin:0 0 8px;color:${T.muted};font-size:13px">These exist and their kind maps to `
      + 'no catalog type. Shown rather than filed under a type nobody chose.</p>'
      + `<ul style="font-size:13px">`
      + r.unclassified.map((a) => `<li>${esc(a.title)} <code>${esc(a.kind)}</code></li>`).join('')
      + '</ul>'
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artifact registry</title>
<style>
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: ${T.text};
         line-height: 1.6; margin: 0; background: ${T.bgAlt}; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 28px 16px 60px; }
  h1 { color: ${T.cherry}; font-weight: 700; line-height: 1.2; font-size: 26px; margin: 0 0 4px; }
  h2 { font-weight: 700; line-height: 1.2; }
  code { background: ${T.bgAlt}; padding: 1px 5px; border-radius: 4px; }
  table code { background: transparent; padding: 0; }
</style></head>
<body><div class="wrap">
  <h1>Artifact registry</h1>
  <div style="color:${T.muted};font-size:13px;margin-bottom:18px">
    Project <code>${esc(r.project_id)}</code>
    &middot; plan version ${r.plan_version === null ? 'none' : esc(r.plan_version)}
    &middot; generated ${esc(generatedAt)}
  </div>

  ${warnings}

  <div style="padding:16px 18px;border-radius:10px;background:${vc.bg};border:1px solid ${vc.fg};
              color:${vc.fg};font-size:15px;font-weight:600;margin:0 0 18px">
    ${esc(r.headline)}
  </div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 26px">
    ${stat(r.counts.required, 'required by the plan', 'plain')}
    ${stat(r.counts.satisfied, 'handed over', r.counts.satisfied ? 'good' : 'plain')}
    ${stat(r.counts.outstanding, 'still owed', r.counts.outstanding ? 'bad' : 'plain')}
    ${stat(r.counts.existing + r.counts.unclassified, 'artifacts this project holds', 'plain')}
    ${stat(`${r.counts.stories_with_contract} of ${r.counts.stories_total}`, 'stories that declare a contract',
    r.counts.stories_with_contract ? 'plain' : 'warn')}
  </div>

  <h2 style="font-size:16px;margin:0 0 8px">What the plan requires</h2>
  ${requiredTable}
  ${malformed}

  <h2 style="font-size:16px;margin:26px 0 8px">What this project already holds</h2>
  <p style="margin:0 0 10px;color:${T.muted};font-size:13px">Recorded on the platform, whether or
     not any contract asked for it.</p>
  ${existingBlock}
  ${unclassified}
</div></body></html>`;
}
