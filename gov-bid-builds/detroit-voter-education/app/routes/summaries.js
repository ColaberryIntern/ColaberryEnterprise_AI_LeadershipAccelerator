const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { generateSummary, getSummary } = require('../services/summaryGenerationAgent');

const router = express.Router();

router.post('/generate', requireAdminKey, async (req, res) => {
  const { subjectId, selectedIssues } = req.body;

  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  if (!Array.isArray(selectedIssues) || selectedIssues.length === 0) {
    return res.status(400).json({ error: 'selectedIssues must be a non-empty array' });
  }

  try {
    const result = await generateSummary(subjectId, selectedIssues);
    const httpStatus = result.status === 'pending_content' ? 202 : 200;
    return res.status(httpStatus).json(result);
  } catch (err) {
    if (err.code === 'SUBJECT_NOT_FOUND') {
      return res.status(404).json({ error: 'Officeholder/candidate not found' });
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'summary_generation_failed',
      subject_id: subjectId,
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
});

router.get('/:subjectId', requireAdminKey, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }

  try {
    const summary = await getSummary(subjectId);
    if (!summary) {
      return res.status(404).json({ error: 'No summary found for this subject' });
    }
    return res.json(summary);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'summary_read_failed',
      subject_id: subjectId,
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to read summary' });
  }
});

module.exports = router;
