// STORY-020: hermetic component-level accessibility regression check using
// axe-core. Renders each component's initial markup via
// react-dom/server's renderToStaticMarkup, scans it with axe-core running
// inside a real jsdom window (axe requires window/document context, not
// just Node globals), and asserts zero *violations*.
//
// Deliberate scope limit, verified empirically before writing this file:
// axe-core's color-contrast rule needs a real layout engine (font metrics,
// computed box size) that jsdom does not implement -- it returns
// 'incomplete', never a hard pass/fail, under jsdom. Contrast was verified
// separately by computing actual WCAG ratios from App.css's color values
// (see decision-record-STORY-020.md) -- this test focuses on what jsdom CAN
// evaluate: missing/invalid ARIA, missing form labels, missing accessible
// names, duplicate IDs, landmark structure.
//
// Components are compiled with esbuild (already a project devDependency,
// declared explicitly here rather than relied on transitively through
// vite) since this is a plain Node script, not a Vite-processed page --
// esbuild handles the JSX + ESM-import syntax the component files use.
//
// Not part of the backend `npm test` chain -- run manually:
//   node app/client/src/__tests__/accessibility.test.js
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');

const axeSource = fs.readFileSync(require.resolve('axe-core/axe.js'), 'utf8');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const COMPONENTS_DIR = path.join(__dirname, '..', 'components');
// Compiled output must live inside app/client's own tree, not the OS temp
// dir, so require('react') resolves via the normal node_modules lookup
// chain from here upward. Written and deleted per-call -- never a repo
// artifact.
const TMP_DIR = path.join(__dirname, '.tmp-a11y');

function compileComponent(filename) {
  const entryPoint = path.join(COMPONENTS_DIR, filename);
  const result = esbuild.buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/*'],
    write: false,
    // UserInputForm.jsx references import.meta.env inside getWsUrl(), which
    // only runs in a useEffect never triggered by renderToStaticMarkup --
    // esbuild's cjs-format warning about it is real but inconsequential
    // here, so it's silenced rather than left as unexplained noise.
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpFile = path.join(TMP_DIR, `${filename.replace('.jsx', '')}-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(tmpFile, code);
  try {
    const mod = require(tmpFile);
    return mod.default || mod;
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

// Wraps a rendered fragment in a realistic page shell (lang, title, <main>)
// matching App.jsx's real structure, so page-level rules (document-title,
// html-has-lang, landmark-one-main, region) don't false-positive on a
// component tested outside that shell.
async function scanFragment(name, innerHtml) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html lang="en"><head><title>Detroit Voter Education</title></head><body><main>${innerHtml}</main></body></html>`,
    { runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.eval(axeSource);

  // axe-core's run() returns a Promise when no callback is passed.
  const result = await dom.window.axe.run(dom.window.document, {
    rules: { 'color-contrast': { enabled: false } }, // see file header -- not evaluable under jsdom, verified separately
  });

  if (result.violations.length > 0) {
    const details = result.violations
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
      .join('\n');
    throw new Error(`${name}: ${result.violations.length} axe violation(s):\n${details}`);
  }
}

async function main() {
  await test('FeedbackForm: renders with no axe violations', async () => {
    const FeedbackForm = compileComponent('FeedbackForm.jsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackForm, { sessionId: 'test-session' }));
    await scanFragment('FeedbackForm', html);
  });

  await test('UserInputForm: renders with no axe violations', async () => {
    const UserInputForm = compileComponent('UserInputForm.jsx');
    const html = renderToStaticMarkup(React.createElement(UserInputForm));
    await scanFragment('UserInputForm', html);
  });

  await test('ProvenanceTrail: renders with no axe violations', async () => {
    const ProvenanceTrail = compileComponent('ProvenanceTrail.jsx');
    const html = renderToStaticMarkup(React.createElement(ProvenanceTrail, { subjectId: 1, sessionId: 'test-session' }));
    await scanFragment('ProvenanceTrail', html);
  });

  await test('SubscribeToggle: renders with no axe violations', async () => {
    const SubscribeToggle = compileComponent('SubscribeToggle.jsx');
    const html = renderToStaticMarkup(
      React.createElement(SubscribeToggle, { subscribed: false, onToggle: () => {}, busy: false }),
    );
    await scanFragment('SubscribeToggle', html);
  });

  await test('SummaryList: renders with no axe violations', async () => {
    const SummaryList = compileComponent('SummaryList.jsx');
    const html = renderToStaticMarkup(React.createElement(SummaryList, { sessionId: 'test-session' }));
    await scanFragment('SummaryList', html);
  });

  await test('UpdatesBanner: renders with no axe violations (empty-state fragment)', async () => {
    // Renders null on initial static markup -- it only self-fetches via
    // useEffect, which never runs under renderToStaticMarkup. Included for
    // completeness; the non-empty state isn't exercised here (same
    // browser-testing limit noted in STORY-014's PROGRESS.md entry).
    const UpdatesBanner = compileComponent('UpdatesBanner.jsx');
    const html = renderToStaticMarkup(
      React.createElement(UpdatesBanner, { sessionId: 'test-session', refreshKey: 0 }),
    );
    await scanFragment('UpdatesBanner', html);
  });

  await test('AdminFeedbackDashboard: renders with no axe violations', async () => {
    const AdminFeedbackDashboard = compileComponent('AdminFeedbackDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(AdminFeedbackDashboard));
    await scanFragment('AdminFeedbackDashboard', html);
  });

  await test('SystemHealthDashboard: renders with no axe violations', async () => {
    const SystemHealthDashboard = compileComponent('SystemHealthDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(SystemHealthDashboard));
    await scanFragment('SystemHealthDashboard', html);
  });

  await test('PendingApprovalsDashboard: renders with no axe violations', async () => {
    const PendingApprovalsDashboard = compileComponent('PendingApprovalsDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(PendingApprovalsDashboard));
    await scanFragment('PendingApprovalsDashboard', html);
  });

  await test('RecentActionsDashboard: renders with no axe violations', async () => {
    const RecentActionsDashboard = compileComponent('RecentActionsDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(RecentActionsDashboard));
    await scanFragment('RecentActionsDashboard', html);
  });

  await test('AnomaliesDashboard: renders with no axe violations', async () => {
    const AnomaliesDashboard = compileComponent('AnomaliesDashboard.jsx');
    const html = renderToStaticMarkup(React.createElement(AnomaliesDashboard));
    await scanFragment('AnomaliesDashboard', html);
  });

  if (fs.existsSync(TMP_DIR)) fs.rmdirSync(TMP_DIR);

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error('ACCESSIBILITY TEST FAILED:', err.message);
  process.exitCode = 1;
});
