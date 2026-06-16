'use strict';
// Uses Node.js 22+ built-in sqlite — no native compilation required.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH
  || path.join(__dirname, '..', 'data', 'app.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    role       TEXT NOT NULL CHECK(role IN ('student_staff','community_coordinator','residence_director','admin')),
    building   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incident_reports (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    form_type         TEXT NOT NULL CHECK(form_type IN ('noise_complaint','lockout','on_call_log','roommate_agreement','evaluation')),
    status            TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','escalated','resolved')),
    reporter_id       INTEGER NOT NULL REFERENCES users(id),
    building          TEXT,
    room_number       TEXT,
    description       TEXT NOT NULL,
    occurred_at       TEXT,
    form_data         TEXT DEFAULT '{}',
    photo_filename    TEXT,
    escalated_to_id   INTEGER REFERENCES users(id),
    escalation_reason TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    message    TEXT NOT NULL,
    report_id  INTEGER REFERENCES incident_reports(id),
    read_flag  INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_type       TEXT NOT NULL CHECK(shift_type IN ('front_desk','on_call','ra_duty')),
    assigned_user_id INTEGER NOT NULL REFERENCES users(id),
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    notes            TEXT,
    status           TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
    created_by_id    INTEGER REFERENCES users(id),
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shift_swaps (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id          INTEGER NOT NULL REFERENCES shifts(id),
    requester_id      INTEGER NOT NULL REFERENCES users(id),
    swap_with_user_id INTEGER REFERENCES users(id),
    reason            TEXT,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
    resolved_by_id    INTEGER REFERENCES users(id),
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluatee_id              INTEGER NOT NULL REFERENCES users(id),
    evaluator_id              INTEGER NOT NULL REFERENCES users(id),
    eval_type                 TEXT NOT NULL CHECK(eval_type IN ('self','supervisor')),
    period                    TEXT NOT NULL,
    communication_rating      INTEGER CHECK(communication_rating BETWEEN 1 AND 5),
    resident_engagement_rating INTEGER CHECK(resident_engagement_rating BETWEEN 1 AND 5),
    program_planning_rating   INTEGER CHECK(program_planning_rating BETWEEN 1 AND 5),
    crisis_response_rating    INTEGER CHECK(crisis_response_rating BETWEEN 1 AND 5),
    documentation_rating      INTEGER CHECK(documentation_rating BETWEEN 1 AND 5),
    strengths                 TEXT,
    growth_areas              TEXT,
    goals_next_semester       TEXT,
    supervisor_notes          TEXT,
    status                    TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
    created_at                TEXT DEFAULT (datetime('now')),
    updated_at                TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS curriculum_outcomes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT NOT NULL CHECK(category IN ('community_building','academic_success','wellness','diversity_inclusion','leadership'))
  );

  CREATE TABLE IF NOT EXISTS program_proposals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL,
    target_audience   TEXT NOT NULL,
    proposed_date     TEXT,
    budget_estimate   REAL,
    expected_outcomes TEXT NOT NULL,
    outcome_id        INTEGER REFERENCES curriculum_outcomes(id),
    submitter_id      INTEGER NOT NULL REFERENCES users(id),
    status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','approved','rejected')),
    reviewed_by_id    INTEGER REFERENCES users(id),
    review_notes      TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
