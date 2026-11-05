const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const {
  requestExport, reviewExportRequest, getExportRequest, listExportRequests,
} = require('../services/dataExportAgent');

const router = express.Router();

const ERROR_STATUS_BY_CODE = {
  INVALID_FORMAT: 400,
  INVALID_REQUESTED_BY: 400,
  INVALID_DECISION: 400,
  INVALID_ADMIN_ID: 400,
  REJECTION_REQUIRES_NOTES: 400,
  EXPORT_REQUEST_NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  SCHEMA_VALIDATION_FAILED: 422,
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

router.post('/', requireAdminKey, async (req, res) => {
  const { format, requestedBy } = req.body;
  try {
    const result = await requestExport(format, requestedBy);
    return res.status(201).json(result);
  } catch (err) {
    return handleServiceError(res, err, 'request_export_failed');
  }
});

router.get('/', requireAdminKey, async (_req, res) => {
  try {
    const rows = await listExportRequests();
    return res.json(rows);
  } catch (err) {
    return handleServiceError(res, err, 'list_exports_failed');
  }
});

router.get('/:id', requireAdminKey, async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  try {
    const row = await getExportRequest(requestId);
    if (!row) return res.status(404).json({ error: 'No export request found for this id' });
    return res.json(row);
  } catch (err) {
    return handleServiceError(res, err, 'get_export_failed');
  }
});

router.post('/:id/review', requireAdminKey, async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  const { decision, adminId, notes } = req.body;
  try {
    const result = await reviewExportRequest(requestId, decision, adminId, notes);
    return res.status(200).json(result);
  } catch (err) {
    return handleServiceError(res, err, 'review_export_failed');
  }
});

module.exports = router;
