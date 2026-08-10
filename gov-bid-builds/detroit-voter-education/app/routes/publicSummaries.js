const express = require('express');
const { getPublishedSummary, listPublishedSummaries } = require('../services/coordinatorAgent');

const router = express.Router();

// No requireAdminKey on this router by design -- this is the resident-facing
// read path (STORY-012). It only ever queries status='published' rows via
// coordinatorAgent's getPublishedSummary/listPublishedSummaries, so a summary
// still in pending_review/rejected can never be reached through here.

router.get('/', async (_req, res) => {
  try {
    const rows = await listPublishedSummaries();
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

module.exports = router;
