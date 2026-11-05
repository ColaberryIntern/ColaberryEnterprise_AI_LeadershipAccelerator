const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { refreshSourceData, listStaleProvenance } = require('../services/dataIngestionAgent');

const router = express.Router();

const ERROR_STATUS_BY_CODE = {
  SUBJECT_NOT_FOUND: 404,
  INVALID_POSITION: 400,
};

router.post('/:subjectId/refresh-position', requireAdminKey, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  const { issue, text, sourceUrl, recordType, retrievedAt } = req.body;
  if (typeof issue !== 'string' || issue.trim().length === 0) {
    return res.status(400).json({ error: 'issue must be a non-empty string' });
  }

  try {
    const result = await refreshSourceData(subjectId, issue, { text, sourceUrl, recordType, retrievedAt });
    return res.status(200).json(result);
  } catch (err) {
    const status = ERROR_STATUS_BY_CODE[err.code];
    if (status) {
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'refresh_position_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to refresh source data' });
  }
});

router.get('/stale-provenance', requireAdminKey, async (_req, res) => {
  try {
    const rows = await listStaleProvenance();
    return res.json(rows);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'list_stale_provenance_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load stale provenance list' });
  }
});

module.exports = router;
