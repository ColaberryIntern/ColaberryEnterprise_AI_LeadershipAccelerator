const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { getSystemHealth } = require('../services/systemHealthAgent');

const router = express.Router();

router.get('/', requireAdminKey, async (_req, res) => {
  try {
    const health = await getSystemHealth();
    return res.json(health);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'system_health_read_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
