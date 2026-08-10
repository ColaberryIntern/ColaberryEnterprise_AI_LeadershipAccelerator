const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { evaluateSummary, getGovernanceScore } = require('../services/trustGovernanceAgent');

const router = express.Router();

const ERROR_STATUS_BY_CODE = {
  SUMMARY_NOT_FOUND: 404,
  NO_CONTENT_TO_EVALUATE: 409,
};

router.get('/score', requireAdminKey, async (_req, res) => {
  try {
    const score = await getGovernanceScore();
    return res.json(score);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'governance_score_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load governance score' });
  }
});

router.post('/:subjectId/evaluate', requireAdminKey, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }

  try {
    const result = await evaluateSummary(subjectId);
    return res.status(201).json(result);
  } catch (err) {
    const status = ERROR_STATUS_BY_CODE[err.code];
    if (status) {
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'evaluate_summary_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to evaluate summary' });
  }
});

module.exports = router;
