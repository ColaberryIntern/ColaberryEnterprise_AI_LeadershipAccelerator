const pool = require('../db');
const { notifySubscribers } = require('./userInputAgent');

function validatePosition(position) {
  if (!position || typeof position !== 'object') {
    throw Object.assign(new Error('position must be an object'), { code: 'INVALID_POSITION' });
  }
  if (typeof position.text !== 'string' || position.text.trim().length === 0) {
    throw Object.assign(new Error('position.text must be a non-empty string'), { code: 'INVALID_POSITION' });
  }
}

// Simulates a data-refresh event -- no real "official sources" ingestion
// pipeline exists in this codebase (only STORY-006's jurisdiction lookup
// pulls from a live external API; officeholder/candidate position data is
// entirely human/seed-entered). This is the trigger a real pipeline would
// eventually call, standing in for it, same pattern as STORY-010/013/014's
// fake-data-first approach.
//
// pending_content/rejected summaries need nothing further: they already
// read officeholders_candidates.issue_positions fresh at compose time (see
// demoPipeline.js/summaryComposer.js). A PUBLISHED summary is NEVER silently
// rewritten here -- doing so would let approved public content change
// without admin re-review, undermining STORY-011's approval gate. Instead
// it's flagged provenance_stale=true and the change is logged with the full
// old/new diff, per Trust (TBI)'s requirement.
async function refreshSourceData(subjectId, issue, newPosition) {
  validatePosition(newPosition);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subjectResult = await client.query(
      `SELECT issue_positions FROM officeholders_candidates WHERE id = $1 FOR UPDATE`,
      [subjectId],
    );
    if (subjectResult.rows.length === 0) {
      throw Object.assign(new Error('No officeholder/candidate found for this id'), { code: 'SUBJECT_NOT_FOUND' });
    }
    const issuePositions = subjectResult.rows[0].issue_positions || {};
    const oldPosition = issuePositions[issue] || null;

    const newIssuePositions = {
      ...issuePositions,
      [issue]: {
        text: newPosition.text,
        sourceUrl: newPosition.sourceUrl || null,
        recordType: newPosition.recordType || 'Unspecified record type',
        retrievedAt: newPosition.retrievedAt || null,
      },
    };

    await client.query(
      `UPDATE officeholders_candidates SET issue_positions = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(newIssuePositions), subjectId],
    );

    const summaryResult = await client.query(
      `SELECT id, status FROM summaries WHERE subject_id = $1 FOR UPDATE`,
      [subjectId],
    );
    const summary = summaryResult.rows[0] || null;
    let staleFlagged = false;

    if (summary && summary.status === 'published') {
      await client.query(
        `UPDATE summaries SET provenance_stale = true WHERE id = $1`,
        [summary.id],
      );
      staleFlagged = true;
    }

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'PROVENANCE_DATA_REFRESHED', $1)`,
      [JSON.stringify({
        subject_id: subjectId,
        summary_id: summary?.id || null,
        summary_status: summary?.status || null,
        issue,
        old_position: oldPosition,
        new_position: newIssuePositions[issue],
        stale_flagged: staleFlagged,
      })],
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'provenance_data_refreshed',
      subject_id: subjectId,
      issue,
      stale_flagged: staleFlagged,
      outcome: 'success',
    }));

    // STORY-016: fan out in-app notifications to subscribers, post-commit
    // (best-effort side effect -- a notification failure here must not roll
    // back the actual, already-committed data refresh).
    let notifiedCount = 0;
    if (staleFlagged) {
      try {
        const notifyResult = await notifySubscribers(subjectId, summary.id);
        notifiedCount = notifyResult.notifiedCount;
      } catch (notifyErr) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'detroit-voter-education',
          event: 'notify_subscribers_failed',
          subject_id: subjectId,
          error_class: notifyErr.constructor.name,
          error: notifyErr.message,
        }));
      }
    }

    return {
      subjectId,
      issue,
      oldPosition,
      newPosition: newIssuePositions[issue],
      summaryId: summary?.id || null,
      staleFlagged,
      notifiedCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Admin-facing read: published summaries whose source data has moved since
// approval and are waiting on a human to re-review. No UI consumes this yet
// -- same "backend groundwork, UI deferred" pattern as STORY-011.
async function listStaleProvenance() {
  const result = await pool.query(
    `SELECT s.id AS summary_id, s.subject_id, s.published_at, o.name, o.office, o.jurisdiction
     FROM summaries s JOIN officeholders_candidates o ON o.id = s.subject_id
     WHERE s.status = 'published' AND s.provenance_stale = true
     ORDER BY s.published_at ASC`,
  );
  return result.rows;
}

module.exports = { refreshSourceData, listStaleProvenance, validatePosition };
