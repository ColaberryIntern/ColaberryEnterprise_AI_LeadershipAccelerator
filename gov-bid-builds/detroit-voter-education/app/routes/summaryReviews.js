const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { submitForReview, listPendingReview, reviewSummary } = require('../services/coordinatorAgent');

const router = express.Router();

const ERROR_STATUS_BY_CODE = {
  SUMMARY_NOT_FOUND: 404,
  INVALID_SUMMARY_TEXT: 400,
  INVALID_AUTHORED_BY: 400,
  INVALID_DECISION: 400,
  INVALID_ADMIN_ID: 400,
  REJECTION_REQUIRES_NOTES: 400,
  INVALID_STATE_TRANSITION: 409,
};

function handleServiceError(res, err, event) {
  const status = ERROR_STATUS_BY_CODE[err.code];
  if (status) {
    return res.status(status).json({ error: err.message, code: err.code });
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'detroit-voter-education',
    event,
    error_class: err.constructor.name,
    error: err.message,
  }));
  return res.status(500).json({ error: 'Internal error' });
}

router.post('/:subjectId/submit', requireAdminKey, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  const { summaryText, authoredBy } = req.body;

  try {
    const result = await submitForReview(subjectId, summaryText, authoredBy);
    return res.status(202).json(result);
  } catch (err) {
    return handleServiceError(res, err, 'submit_for_review_failed');
  }
});

router.get('/pending', requireAdminKey, async (_req, res) => {
  try {
    const rows = await listPendingReview();
    return res.json(rows);
  } catch (err) {
    return handleServiceError(res, err, 'list_pending_review_failed');
  }
});

router.post('/:subjectId/decision', requireAdminKey, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  const { decision, adminId, notes } = req.body;

  try {
    const result = await reviewSummary(subjectId, decision, adminId, notes);
    return res.status(200).json(result);
  } catch (err) {
    return handleServiceError(res, err, 'review_decision_failed');
  }
});

module.exports = router;
