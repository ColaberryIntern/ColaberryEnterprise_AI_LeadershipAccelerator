-- Voice AI Studio (VS1.4) rollback. REVIEWED, NEVER RUN WITHOUT ALI'S APPROVAL.
-- Drops only the 13 voice_* tables the Voice Studio created. It does not touch voice_dial_log,
-- communication_logs or any legacy table. Run only after confirming the tables hold no rows you
-- need (SELECT count(*) on each), and only while VOICE_STUDIO_ENABLED is off.
-- Call-scoped tables go first; they reference voice_calls.
BEGIN;
DROP TABLE IF EXISTS voice_token_uses;
DROP TABLE IF EXISTS voice_usage;
DROP TABLE IF EXISTS voice_artifacts;
DROP TABLE IF EXISTS voice_tool_runs;
DROP TABLE IF EXISTS voice_turns;
DROP TABLE IF EXISTS voice_call_events;
DROP TABLE IF EXISTS voice_dial_reservations;
DROP TABLE IF EXISTS voice_calls;
DROP TABLE IF EXISTS voice_test_cases;
DROP TABLE IF EXISTS voice_evaluation_runs;
DROP TABLE IF EXISTS voice_routes;
DROP TABLE IF EXISTS voice_numbers;
DROP TABLE IF EXISTS voice_agent_versions;
DROP TABLE IF EXISTS voice_agent_profiles;
COMMIT;
