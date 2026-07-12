#!/usr/bin/env node
/**
 * captureBrandReview.js — screenshot the rebranded admin from a review container.
 *
 * Designed to run inside the Playwright Docker image on the VPS, joined to the
 * dev2 network so BASE resolves to the review container and /api proxies to the
 * dev2 backend. Token is minted separately (inside the dev2 backend, role
 * super_admin) and passed via ADMIN_TOKEN — no password needed.
 *
 *   docker run --rm --network accelerator-dev2_default \
 *     -e BASE=http://accel-brand-review -e ADMIN_TOKEN=$TOK -e OUT=/out \
 *     -v /tmp/brand-shots:/out -v /tmp/captureBrandReview.js:/capture.js \
 *     mcr.microsoft.com/playwright:v1.49.0-jammy node /capture.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://accel-brand-review';
const TOKEN = process.env.ADMIN_TOKEN || '';
const OUT = process.env.OUT || '/out';

const ROUTES = [
  ['01-login', '/admin/login'],
  ['02-dashboard', '/admin/dashboard'],
  ['03-automated-reports', '/admin/reports'],
  ['04-trust-center', '/admin/trust'],
  ['05-leads', '/admin/leads'],
  ['06-pipeline', '/admin/pipeline'],
  ['07-opportunities', '/admin/opportunities'],
  ['08-governance', '/admin/governance'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (TOKEN) {
    // Seed the admin token before any app code runs so ProtectedRoute passes.
    await ctx.addInitScript((t) => {
      try { window.localStorage.setItem('admin_token', t); } catch (e) {}
    }, TOKEN);
  }
  const page = await ctx.newPage();
  for (const [slug, route] of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: false });
      console.log(`[shot] ${slug} ${route} -> ${page.url()}`);
    } catch (e) {
      console.log(`[err] ${slug} ${route}: ${e.message}`);
      try { await page.screenshot({ path: `${OUT}/${slug}-ERR.png` }); } catch (_) {}
    }
  }
  await browser.close();
  console.log('[done] screenshots in', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
