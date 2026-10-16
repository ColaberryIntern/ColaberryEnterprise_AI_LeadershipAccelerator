// STORY-025: prom-client is free, open-source, zero-infrastructure-footprint
// -- this exposes standard process metrics (memory, event loop, GC) in
// Prometheus text format for a future real scraper to consume. No
// Prometheus server is deployed as part of this story -- see
// decision-record-STORY-025.md for why that stays a deferred, flagged
// infra decision rather than something built here.
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

module.exports = { register };
