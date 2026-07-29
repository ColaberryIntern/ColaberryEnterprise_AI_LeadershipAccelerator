const pool = require('../db');

const NOTIFICATION_SLA_MS = 15 * 60 * 1000;

function computeNotificationLatencyMs(submittedAt, notifiedAt) {
  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  const notified = notifiedAt instanceof Date ? notifiedAt : new Date(notifiedAt);
  const latencyMs = notified.getTime() - submitted.getTime();
  return {
    latencyMs,
    meetsSla: latencyMs >= 0 && latencyMs <= NOTIFICATION_SLA_MS,
  };
}

// Human authors summary_text for a pending_content (or previously rejected)
// summary and submits it for admin review. Holds the summary in pending_review
// and writes a stubbed admin notification in the same transaction -- see the
// schema.sql comment on admin_notifications for why this isn't a real send.
async function submitForReview(subjectId, summaryText, authoredBy) {
  if (typeof summaryText !== 'string' || summaryText.trim().length === 0) {
    throw Object.assign(new Error('summaryText must be a non-empty string'), { code: 'INVALID_SUMMARY_TEXT' });
  }
  if (typeof authoredBy !== 'string' || authoredBy.trim().length === 0) {
    throw Object.assign(new Error('authoredBy must be a non-empty string'), { code: 'INVALID_AUTHORED_BY' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, status FROM summaries WHERE subject_id = $1 FOR UPDATE`,
      [subjectId],
    );
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('No summary row for this subject — run SummaryGenerationAgent first'), { code: 'SUMMARY_NOT_FOUND' });
    }
    const { id: summaryId, status } = existing.rows[0];
    if (status !== 'pending_content' && status !== 'rejected') {
      throw Object.assign(
        new Error(`Cannot submit for review from status '${status}'`),
        { code: 'INVALID_STATE_TRANSITION', currentStatus: status },
      );
    }

    const updated = await client.query(
      `UPDATE summaries
         SET summary_text = $1, authored_by = $2, status = 'pending_review',
             reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL,
             updated_at = NOW()
       WHERE id = $3
       RETURNING id, subject_id, status, updated_at`,
      [summaryText, authoredBy, summaryId],
    );
    const submittedAt = updated.rows[0].updated_at;

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'SUMMARY_SUBMITTED_FOR_REVIEW', $1)`,
      [JSON.stringify({ summary_id: summaryId, subject_id: subjectId, authored_by: authoredBy })],
    );

    const notification = await client.query(
      `INSERT INTO admin_notifications (summary_id, channel, payload)
       VALUES ($1, 'log_stub', $2)
       RETURNING id, notified_at`,
      [summaryId, JSON.stringify({ subject_id: subjectId, authored_by: authoredBy, reason: 'pending_review' })],
    );

    await client.query('COMMIT');

    const latency = computeNotificationLatencyMs(submittedAt, notification.rows[0].notified_at);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'admin_notification_sent',
      channel: 'log_stub',
      summary_id: summaryId,
      subject_id: subjectId,
      latency_ms: latency.latencyMs,
      meets_sla: latency.meetsSla,
      outcome: 'success',
    }));

    return {
      summaryId,
      subjectId,
      status: 'pending_review',
      notificationId: notification.rows[0].id,
      notifiedAt: notification.rows[0].notified_at,
      latencyMs: latency.latencyMs,
      meetsSla: latency.meetsSla,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listPendingReview() {
  const result = await pool.query(
    `SELECT s.id, s.subject_id, s.summary_text, s.authored_by, s.coverage_pct, s.updated_at,
            o.name, o.office, o.jurisdiction
     FROM summaries s
     JOIN officeholders_candidates o ON o.id = s.subject_id
     WHERE s.status = 'pending_review'
     ORDER BY s.updated_at ASC`,
  );
  return result.rows;
}

// The approval gate: this is the only place in the codebase that sets
// status='published'. Rejection returns the summary to a distinct 'rejected'
// state (not back to pending_content) so the rejection reason is preserved
// until someone resubmits via submitForReview.
async function reviewSummary(subjectId, decision, adminId, notes) {
  if (decision !== 'approve' && decision !== 'reject') {
    throw Object.assign(new Error("decision must be 'approve' or 'reject'"), { code: 'INVALID_DECISION' });
  }
  if (typeof adminId !== 'string' || adminId.trim().length === 0) {
    throw Object.assign(new Error('adminId must be a non-empty string'), { code: 'INVALID_ADMIN_ID' });
  }
  if (decision === 'reject' && (typeof notes !== 'string' || notes.trim().length === 0)) {
    throw Object.assign(new Error('notes are required when rejecting a summary'), { code: 'REJECTION_REQUIRES_NOTES' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, status FROM summaries WHERE subject_id = $1 FOR UPDATE`,
      [subjectId],
    );
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('No summary row for this subject'), { code: 'SUMMARY_NOT_FOUND' });
    }
    const { id: summaryId, status } = existing.rows[0];
    if (status !== 'pending_review') {
      throw Object.assign(
        new Error(`Cannot review a summary in status '${status}' — must be pending_review`),
        { code: 'INVALID_STATE_TRANSITION', currentStatus: status },
      );
    }

    const newStatus = decision === 'approve' ? 'published' : 'rejected';
    const updated = await client.query(
      `UPDATE summaries
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, subject_id, status, reviewed_by, reviewed_at, review_notes`,
      [newStatus, adminId, notes || null, summaryId],
    );

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, $1, $2)`,
      [
        decision === 'approve' ? 'SUMMARY_APPROVED' : 'SUMMARY_REJECTED',
        JSON.stringify({ summary_id: summaryId, subject_id: subjectId, admin_id: adminId, notes: notes || null }),
      ],
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  submitForReview,
  listPendingReview,
  reviewSummary,
  computeNotificationLatencyMs,
  NOTIFICATION_SLA_MS,
};
