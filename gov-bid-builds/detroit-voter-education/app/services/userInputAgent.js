const pool = require('../db');

// In-app only. No email/SMS provider is wired up -- see decision-record-
// STORY-016.md for why that's a deliberately deferred, separate decision
// (real external dependency + real resident PII collection), not something
// the fake-demo-data recalibration extends to.

async function subscribe(sessionId, subjectId) {
  await pool.query(
    `INSERT INTO subscriptions (session_id, subject_id)
     VALUES ($1, $2)
     ON CONFLICT (session_id, subject_id) DO NOTHING`,
    [sessionId, subjectId],
  );
  return { sessionId, subjectId, subscribed: true };
}

async function unsubscribe(sessionId, subjectId) {
  await pool.query(
    `DELETE FROM subscriptions WHERE session_id = $1 AND subject_id = $2`,
    [sessionId, subjectId],
  );
  return { sessionId, subjectId, subscribed: false };
}

async function listSubscriptions(sessionId) {
  const result = await pool.query(
    `SELECT subject_id FROM subscriptions WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows.map((r) => r.subject_id);
}

// A resident's "your updates" view: subscribed subjects whose published
// summary has been flagged provenance_stale (STORY-015). Does not itself
// write audit rows -- reading your updates isn't "a notification was sent",
// see notifySubscribers() below for that event.
async function getUpdates(sessionId) {
  const result = await pool.query(
    `SELECT o.id AS subject_id, o.name, o.office, o.jurisdiction, s.published_at
     FROM subscriptions sub
     JOIN summaries s ON s.subject_id = sub.subject_id
     JOIN officeholders_candidates o ON o.id = sub.subject_id
     WHERE sub.session_id = $1 AND s.status = 'published' AND s.provenance_stale = true`,
    [sessionId],
  );
  return result.rows;
}

// Called by dataIngestionAgent.refreshSourceData() at the moment a published
// summary is flagged provenance_stale -- this is the actual "notification
// fired" event, not each time a resident happens to poll getUpdates().
// Writes one NOTIFICATION_SENT audit row per active subscriber, per Trust
// (TBI)'s requirement (user id / summary id / notification type / timestamp).
async function notifySubscribers(subjectId, summaryId) {
  const result = await pool.query(
    `SELECT session_id FROM subscriptions WHERE subject_id = $1`,
    [subjectId],
  );

  for (const row of result.rows) {
    await pool.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES ($1, 'NOTIFICATION_SENT', $2)`,
      [row.session_id, JSON.stringify({ subject_id: subjectId, summary_id: summaryId, notification_type: 'in_app' })],
    );
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'detroit-voter-education',
    event: 'notifications_sent',
    subject_id: subjectId,
    summary_id: summaryId,
    notification_type: 'in_app',
    subscriber_count: result.rows.length,
    outcome: 'success',
  }));

  return { subjectId, summaryId, notifiedCount: result.rows.length };
}

module.exports = { subscribe, unsubscribe, listSubscriptions, getUpdates, notifySubscribers };
