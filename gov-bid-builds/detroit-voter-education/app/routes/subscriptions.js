const express = require('express');
const { subscribe, unsubscribe, listSubscriptions, getUpdates } = require('../services/userInputAgent');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No requireAdminKey by design -- this is the resident-facing subscription
// path (STORY-016), same as publicSummaries.js. sessionId is the existing
// ephemeral per-tab id (App.jsx), not a real authenticated identity.

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && UUID_RE.test(sessionId);
}

router.post('/', async (req, res) => {
  const { sessionId, subjectId } = req.body;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid UUID' });
  }
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }

  try {
    const result = await subscribe(sessionId, subjectId);
    return res.status(201).json(result);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'subscribe_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
});

router.delete('/:subjectId', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  const { sessionId } = req.query;
  if (!Number.isInteger(subjectId)) {
    return res.status(400).json({ error: 'subjectId must be an integer' });
  }
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid UUID' });
  }

  try {
    const result = await unsubscribe(sessionId, subjectId);
    return res.status(200).json(result);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'unsubscribe_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid UUID' });
  }

  try {
    const subjectIds = await listSubscriptions(sessionId);
    return res.json({ sessionId, subjectIds });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'list_subscriptions_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

router.get('/:sessionId/updates', async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid UUID' });
  }

  try {
    const updates = await getUpdates(sessionId);
    return res.json(updates);
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'get_updates_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to load updates' });
  }
});

module.exports = router;
