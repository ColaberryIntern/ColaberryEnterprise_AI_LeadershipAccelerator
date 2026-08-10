const express = require('express');
const { requireAdminKey } = require('../middleware/requireAdminKey');
const { ingestFederalRegisterDocuments } = require('../services/governmentApiIngestionAgent');
const pool = require('../db');

const router = express.Router();

router.post('/ingest', requireAdminKey, async (req, res) => {
  const { searchTerm } = req.body;
  if (typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
    return res.status(400).json({ error: 'searchTerm must be a non-empty string' });
  }

  try {
    const result = await ingestFederalRegisterDocuments(searchTerm);
    const httpStatus = result.status === 'success' ? 200 : 502;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'ingest_endpoint_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to run ingestion' });
  }
});

router.get('/ingestions', requireAdminKey, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, source, endpoint, status, attempt_count, result_count, error_message, ingested_at
       FROM government_data_ingestions ORDER BY ingested_at DESC LIMIT 50`,
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'list_ingestions_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load ingestion history' });
  }
});

module.exports = router;
