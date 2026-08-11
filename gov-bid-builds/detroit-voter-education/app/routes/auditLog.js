const express = require('express');
const { requireRole } = require('../middleware/rbac');
const { getAuditLogEntry } = require('../services/auditLogAgent');

const router = express.Router();

// STORY-024: audit-log access requires the data_steward role specifically
// -- the general ADMIN_API_KEY used by every other admin route in this app
// is not sufficient here, a deliberate strengthening. Access attempts
// (granted and denied) are logged by requireRole() itself via signed
// logAction(), correctly labeled AUDIT_LOG_ACCESS_GRANTED/DENIED.
router.get('/:id', requireRole('audit_log:read'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }
  try {
    const entry = await getAuditLogEntry(id);
    if (!entry) return res.status(404).json({ error: 'No audit log entry found for this id' });
    return res.json(entry);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'audit_log_read_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
