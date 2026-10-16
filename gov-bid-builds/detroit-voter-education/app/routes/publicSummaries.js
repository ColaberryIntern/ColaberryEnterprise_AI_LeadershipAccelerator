const express = require('express');
const { getPublishedSummary, listPublishedSummaries } = require('../services/coordinatorAgent');
const { getProvenanceTrail } = require('../services/provenanceAgent');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No requireAdminKey on this router by design -- this is the resident-facing
// read path (STORY-012). It only ever queries status='published' rows via
// coordinatorAgent's getPublishedSummary/listPublishedSummaries, so a summary
// still in pending_review/rejected can never be reached through here.

router.get('/', async (req, res) => {
  // STORY-007: ?city= is optional and resolved client-side from the
  // resident's ZIP (GET /api/jurisdictions/:zipCode) -- never trust-boundary
  // input used for anything but an equality filter, no injection surface.
  const city = typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim() : undefined;
  try {
    const rows = await listPublishedSummaries(city);
    return res.json(rows);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'public_summaries_list_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load summaries' });
  }
});

router.get('/:subjectId', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }

  try {
    const summary = await getPublishedSummary(subjectId);
    if (!summary) {
      return res.status(404).json({ error: 'No published summary found for this subject' });
    }
    return res.json(summary);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'public_summary_read_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load summary' });
  }
});

router.get('/:subjectId/provenance', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  const rawSessionId = req.query.sessionId;
  const sessionId = typeof rawSessionId === 'string' && UUID_RE.test(rawSessionId) ? rawSessionId : null;

  try {
    const result = await getProvenanceTrail(subjectId, sessionId);
    if (!result) {
      return res.status(404).json({ error: 'No published summary found for this subject' });
    }
    return res.json(result);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'public_provenance_read_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load provenance trail' });
  }
});

module.exports = router;
