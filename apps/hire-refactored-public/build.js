/**
 * hire.refactored.ai build.
 *
 * Delegates to @refactored/app-build, like every brand app. Its only edges are to
 * packages/*, which scripts/validate-app-boundaries.js enforces. There is no per-record
 * step: the shells read the live API, so publishing a case study never needs a build.
 */
const { buildApp } = require('../../packages/app-build');
const config = require('./brand.config');

buildApp({ appDir: __dirname, config });
