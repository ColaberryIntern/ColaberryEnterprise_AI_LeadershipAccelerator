const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const {
  runQuarterlyAudit, getAudit, listAudits, generateReport,
} = require('../services/accessibilityAuditAgent');

const router = express.Router();

const ERROR_STATUS_BY_CODE = {
  INVALID_TRIGGERED_BY: 400,
  INVALID_AUDIT: 400,
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

router.post('/run', requireAdminKey, async (req, res) => {
  const { triggeredBy } = req.body;
  try {
    const result = await runQuarterlyAudit(triggeredBy);
    return res.status(201).json(result);
  } catch (err) {
    return handleServiceError(res, err, 'accessibility_audit_run_failed');
  }
});

router.get('/', requireAdminKey, async (_req, res) => {
  try {
    const rows = await listAudits();
    return res.json(rows);
  } catch (err) {
    return handleServiceError(res, err, 'accessibility_audit_list_failed');
  }
});

router.get('/:id/report', requireAdminKey, async (req, res) => {
  const auditId = Number(req.params.id);
  if (!Number.isInteger(auditId)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  try {
    const audit = await getAudit(auditId);
    if (!audit) return res.status(404).json({ error: 'No accessibility audit found for this id' });
    const report = generateReport(audit);
    res.type('text/markdown');
    return res.send(report);
  } catch (err) {
    return handleServiceError(res, err, 'accessibility_audit_report_failed');
  }
});

module.exports = router;
