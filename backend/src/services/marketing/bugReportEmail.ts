import { esc } from '../classKit/kitRenderUtils';

/**
 * The email a Marketing bug report becomes.
 *
 * WHO THIS IS WRITTEN FOR. Not a human triaging a queue - Claude Code, reading it in an inbox
 * and expected to start work without asking anything back. That is the whole design constraint,
 * and it is why the body leads with the route and the evidence rather than with pleasantries.
 * Ali, 2026-10-07: "Make sure the email that comes through has all the specifics so claude code
 * has everything it needs to know to make the changes."
 *
 * WHAT MAKES A REPORT ACTIONABLE, in the order it is needed:
 *   1. WHERE  - the route, so the file is findable without a hunt. A Marketing page is also
 *               brand-scoped, and the same screen behaves differently per brand, so the brand
 *               is part of "where" rather than a detail.
 *   2. WHAT   - what they did, what happened, what they expected. Three separate fields on
 *               purpose: "it's broken" is the report we cannot act on, and asking the three
 *               questions separately is what stops it.
 *   3. PROOF  - the screenshot, attached rather than linked so it survives in the inbox.
 *   4. CAUSE  - console errors and failed requests captured as they happened, which is usually
 *               the difference between a guess and a diagnosis.
 *
 * PLAIN TEXT IS THE PAYLOAD. The HTML part is a courtesy for a person who opens it; the text
 * part is what an agent reads, so it is complete on its own and carries no markup to strip.
 */

export interface BugReportInput {
  summary: string;
  whatHappened: string;
  whatExpected?: string;
  stepsToReproduce?: string;
  pageUrl: string;
  routePath: string;
  brandLabel?: string | null;
  reportedAtCentral: string;
  browser: string;
  viewport: string;
  reporterName: string;
  reporterEmail: string;
  errors?: Array<{ at: string; kind: string; message: string; stack?: string }>;
  failedRequests?: Array<{ at: string; method: string; url: string; status: number | string; ms: number }>;
  hasScreenshot: boolean;
}

/**
 * Which file to start in, inferred from the route.
 *
 * A guess, and labelled as one in the email. It is still worth making: the reporter never knows
 * the filename and the agent would otherwise spend its first step grepping for a page it could
 * have been handed.
 */
const ROUTE_TO_SOURCE: Array<[RegExp, string]> = [
  [/^\/admin\/marketing\/composer/, 'frontend/src/pages/admin/marketing/composer/AdminContentComposerPage.tsx'],
  [/^\/admin\/marketing\/landing-pages/, 'frontend/src/pages/admin/marketing/AdminLandingPagesPage.tsx'],
  [/^\/admin\/marketing\/content/, 'frontend/src/pages/admin/marketing/AdminContentQueuePage.tsx'],
  [/^\/admin\/marketing\/calendar/, 'frontend/src/pages/admin/marketing/AdminMarketingCalendarPage.tsx'],
  [/^\/admin\/marketing\/publishing/, 'frontend/src/pages/admin/marketing/AdminPublishingQueuePage.tsx'],
  [/^\/admin\/marketing\/performance/, 'frontend/src/pages/admin/marketing/AdminMarketingPerformancePage.tsx'],
  [/^\/admin\/marketing\/brands/, 'frontend/src/pages/admin/marketing/AdminBrandsPage.tsx'],
  [/^\/admin\/marketing\/?$/, 'frontend/src/pages/admin/marketing/AdminMarketingOverviewPage.tsx'],
];

export function likelySourceFile(routePath: string): string | null {
  const hit = ROUTE_TO_SOURCE.find(([re]) => re.test(routePath));
  return hit ? hit[1] : null;
}

export function buildSubject(input: BugReportInput): string {
  // The route is in the subject so a full inbox can be scanned without opening anything, and so
  // two reports about different screens never read as duplicates.
  return `[Marketing bug] ${input.summary.trim().slice(0, 90)} — ${input.routePath}`;
}

function section(title: string, body: string): string {
  return `${title}\n${'-'.repeat(title.length)}\n${body}\n`;
}

export function buildPlainTextBody(input: BugReportInput): string {
  const source = likelySourceFile(input.routePath);
  const parts: string[] = [];

  parts.push(section('WHERE', [
    `Route:      ${input.routePath}`,
    `Full URL:   ${input.pageUrl}`,
    `Brand:      ${input.brandLabel || '(none selected)'}`,
    source ? `Likely file: ${source}   <- inferred from the route, verify before trusting it` : '',
  ].filter(Boolean).join('\n')));

  parts.push(section('WHAT HAPPENED', input.whatHappened.trim()));

  if (input.whatExpected?.trim()) {
    parts.push(section('WHAT THEY EXPECTED', input.whatExpected.trim()));
  }
  if (input.stepsToReproduce?.trim()) {
    parts.push(section('STEPS THEY TOOK', input.stepsToReproduce.trim()));
  }

  const errs = input.errors ?? [];
  parts.push(section(`CONSOLE ERRORS (${errs.length})`, errs.length
    ? errs.map((e) => `[${e.kind}] ${e.message}${e.stack ? `\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}` : ''}`).join('\n\n')
    : 'None captured. The problem may be visual or server-side rather than a thrown error.'));

  const reqs = input.failedRequests ?? [];
  parts.push(section(`FAILED REQUESTS (${reqs.length})`, reqs.length
    ? reqs.map((r) => `${r.method} ${r.url} -> ${r.status}  (${r.ms}ms)`).join('\n')
    : 'None captured. Every request this page made came back OK.'));

  parts.push(section('ENVIRONMENT', [
    `Reported by: ${input.reporterName} <${input.reporterEmail}>`,
    `When:        ${input.reportedAtCentral} (Central)`,
    `Viewport:    ${input.viewport}`,
    `Browser:     ${input.browser}`,
    `Screenshot:  ${input.hasScreenshot ? 'attached to this email' : 'NOT provided'}`,
  ].join('\n')));

  parts.push(section('NOTE FOR WHOEVER PICKS THIS UP', [
    'Request bodies are deliberately not captured, so nothing here contains a token or a',
    'password. The console and request lists hold the last few of each from BEFORE the report',
    'was opened, which is usually where the cause is.',
  ].join('\n')));

  return parts.join('\n');
}

export function buildHtmlBody(input: BugReportInput): string {
  // A courtesy rendering for a person. Everything here is also in the text part, which is what
  // an agent reads - so this can never be the only place a detail appears.
  const errs = input.errors ?? [];
  const reqs = input.failedRequests ?? [];
  const source = likelySourceFile(input.routePath);
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;

  return `<div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;max-width:46rem">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c20e1e;font-weight:700">Marketing bug report</p>
<h2 style="margin:0 0 14px;font-size:20px">${esc(input.summary)}</h2>
<table style="border-collapse:collapse;margin-bottom:18px">
${row('Route', input.routePath)}
${row('Brand', input.brandLabel || '(none selected)')}
${source ? row('Likely file', source) : ''}
${row('Reported by', `${input.reporterName} <${input.reporterEmail}>`)}
${row('When', `${input.reportedAtCentral} Central`)}
${row('Viewport', input.viewport)}
</table>
<h3 style="font-size:15px;margin:0 0 6px">What happened</h3>
<p style="margin:0 0 16px;white-space:pre-wrap">${esc(input.whatHappened)}</p>
${input.whatExpected?.trim() ? `<h3 style="font-size:15px;margin:0 0 6px">What they expected</h3><p style="margin:0 0 16px;white-space:pre-wrap">${esc(input.whatExpected)}</p>` : ''}
${input.stepsToReproduce?.trim() ? `<h3 style="font-size:15px;margin:0 0 6px">Steps they took</h3><p style="margin:0 0 16px;white-space:pre-wrap">${esc(input.stepsToReproduce)}</p>` : ''}
<h3 style="font-size:15px;margin:0 0 6px">Console errors (${errs.length})</h3>
${errs.length ? `<pre style="background:#f6f5f3;border:1px solid #e6e2df;border-radius:8px;padding:10px;overflow-x:auto;font-size:12.5px">${esc(errs.map((e) => `[${e.kind}] ${e.message}`).join('\n'))}</pre>` : '<p style="margin:0 0 16px;color:#6b6b6b">None captured.</p>'}
<h3 style="font-size:15px;margin:0 0 6px">Failed requests (${reqs.length})</h3>
${reqs.length ? `<pre style="background:#f6f5f3;border:1px solid #e6e2df;border-radius:8px;padding:10px;overflow-x:auto;font-size:12.5px">${esc(reqs.map((r) => `${r.method} ${r.url} -> ${r.status} (${r.ms}ms)`).join('\n'))}</pre>` : '<p style="margin:0 0 16px;color:#6b6b6b">None captured.</p>'}
<p style="margin:18px 0 0;color:#6b6b6b;font-size:12.5px">${input.hasScreenshot ? 'A screenshot is attached.' : 'No screenshot was provided.'} Request bodies are never captured, so nothing here contains a token or a password.</p>
</div>`;
}
