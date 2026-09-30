/**
 * Refactored.ai build.
 *
 * Delegates to @refactored/app-build. The only edges this app has are to packages/*,
 * which is what scripts/validate-app-boundaries.js enforces.
 */
const path = require('path');
const { buildApp } = require('../../packages/app-build');
const config = require('./brand.config');

buildApp({ appDir: __dirname, config });
