const express = require('express');
const { register } = require('../services/metrics');

const router = express.Router();

// Deliberately unauthenticated at the conventional root /metrics path --
// Prometheus scrape endpoints are typically protected at the network
// perimeter (firewall/VPN), not app-level auth, since a real scraper has
// no interactive login step. See decision-record-STORY-025.md.
router.get('/', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

module.exports = router;
