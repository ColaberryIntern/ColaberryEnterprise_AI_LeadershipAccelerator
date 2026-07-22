#!/usr/bin/env node
/**
 * Route-auth lint (TBI audit P0-1 guard).
 *
 * Fails if any admin route file lacks a recognized auth guard — the regression check for the P0-1
 * remediation (15 admin route files were unauthenticated). Recognized guards: requireAdmin (the
 * standard admin gate), requireCoryAuthorized (Cory's command interface), requireAnyAdmin (any
 * admin-portal identity incl. bridge-minted staff mgmt tokens — used by /api/admin/me which
 * self-scopes by role), requireSection (per-section mgmt-RBAC guard), and requireSalesOrAdmin
 * (sales + admin, used by lead routes). A new admin route file with no guard fails CI loudly
 * instead of silently shipping an open endpoint.
 *
 * Run: `node scripts/lint-route-auth.js`
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../backend/src/routes/admin');
const GUARDS = ['requireAdmin', 'requireCoryAuthorized', 'requireAnyAdmin', 'requireSection', 'requireSalesOrAdmin'];

let files;
try {
  files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
} catch (e) {
  console.error('[route-auth-lint] cannot read', DIR, '-', e.message);
  process.exit(1);
}

const unguarded = files.filter((f) => {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  return !GUARDS.some((g) => src.includes(g));
});

if (unguarded.length) {
  console.error('[route-auth-lint] FAIL — admin route files with no recognized auth guard:');
  unguarded.forEach((f) => console.error('  - backend/src/routes/admin/' + f));
  console.error('Every admin route file must apply requireAdmin (or requireCoryAuthorized).');
  process.exit(1);
}

console.log(`[route-auth-lint] OK — all ${files.length} admin route files are auth-guarded.`);
