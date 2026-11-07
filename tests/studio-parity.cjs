#!/usr/bin/env node
/*
 * PAGE_SPEC's named parity gate. The real assertions live in the CRA/jest suite
 *   frontend/src/pages/portal/projects/proposalStudio/__tests__/studioParity.test.tsx
 * (that is what CI's frontend-tests job collects: react-scripts test in frontend/, src/** only).
 * This wrapper runs exactly that suite so `node tests/studio-parity.cjs` is a one-command gate
 * runnable identically locally and in CI. Exit 0 = parity holds, 1 = a required data-testid is
 * missing or an "Approve" button exists.
 */
const { execSync } = require('child_process');
const path = require('path');
try {
  execSync('npx react-scripts test --watchAll=false studioParity', {
    cwd: path.join(__dirname, '..', 'frontend'),
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });
} catch (e) {
  process.exit(1);
}
