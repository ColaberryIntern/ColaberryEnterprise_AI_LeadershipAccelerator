#!/usr/bin/env node
// Print the active Basecamp access token to stdout (no trailing newline), then exit.
//
// Resolves via getBasecampToken() - pulls the live token from CCPP
// Basecamp_AuthInfo when MSSQL_* env is present, else falls back to
// BASECAMP_ACCESS_TOKEN env. Used by the VPS cron-env-wrapper.sh so it can
// inject a live token without hardcoding an expiring secret on disk.
//
// Run: node backend/src/scripts/lib/printBasecampToken.js
// Exit 0 + token on stdout, or exit 1 + error on stderr.

const { getBasecampToken } = require('./basecampToken');

getBasecampToken()
  .then((t) => { process.stdout.write(t); })
  .catch((e) => { process.stderr.write(String((e && e.message) || e) + '\n'); process.exit(1); });
