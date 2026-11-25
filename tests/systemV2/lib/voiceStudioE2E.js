/**
 * Shared set-up for voiceStudio.e2e.js and voiceStudio.a11y.js (VS3.7): the local-only guard, signed
 * tokens, synthetic rows, and their removal. LOCAL STACK ONLY; see voiceStudio-stack.md.
 *
 * Synthetic rows carry a random run id. Phone numbers used are reserved 555-01xx numbers.
 */
const crypto = require('crypto');
const { assertLocalOnly, checkLocalUrl } = require('./localOnly');

function setup(event, { needOff = false } = {}) {
  const refuse = (reason) => { console.error(JSON.stringify({ event: `${event}_refused`, outcome: 'failure', error_class: 'ValidationError', reason })); process.exit(2); };
  const urls = { base: process.env.BASE_URL || 'http://localhost:3170', api: process.env.API_URL || 'http://127.0.0.1:3171' };
  if (needOff) Object.assign(urls, { offBase: process.env.OFF_BASE_URL || 'http://localhost:3172', offApi: process.env.OFF_API_URL || 'http://127.0.0.1:3173' });
  const origins = assertLocalOnly(urls);
  const dbUrl = process.env.DATABASE_URL || '';
  let dbHost = '';
  try { const u = new URL(dbUrl); dbHost = `http://${u.hostname}:${u.port || 5432}`; } catch { dbHost = ''; }
  if (!checkLocalUrl(dbHost).ok || /prod/i.test(dbUrl)) refuse('DATABASE_URL must be a local, non-production database');
  if (!process.env.JWT_SECRET) refuse("JWT_SECRET (the local backend's) is required");
  return { ...origins, dbUrl, refuse };
}

function token(extra = {}) {
  const jwt = require('jsonwebtoken');
  const sub = extra.sub || crypto.randomUUID();
  return { sub, jwt: jwt.sign({ email: 'e2e-admin@example.invalid', role: 'admin', ...extra, sub }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}

/** One agent with a draft version, one number, and three calls (completed with a denied tool, failed test, dispatch unknown). */
async function seed(db, run) {
  const one = async (sql, args) => (await db.query(sql, args)).rows[0].id;
  const tenant = crypto.randomUUID();
  const profile = await one(`INSERT INTO voice_agent_profiles (tenant_id, brand_slug, agent_key, name) VALUES ($1,'colaberry',$2,$3) RETURNING id`, [tenant, `e2e-${run}`, `[e2e] Agent ${run}`]);
  const version = await one(`INSERT INTO voice_agent_versions (tenant_id, profile_id, version, content_hash, prompt, first_message, disclosure, engine, author, safety_policy)
    VALUES ($1,$2,1,$3,'You answer admissions questions.','Hello.','This is the Colaberry AI assistant. I am an AI, not a person.','conversation_relay','e2e-seed','{"bookingRequiresHumanApproval":true,"maxToolCallsPerCall":6}') RETURNING id`,
  [tenant, profile, crypto.createHash('sha256').update(run).digest('hex')]);
  await db.query(`INSERT INTO voice_numbers (tenant_id, provider, provider_number_id, number_ref, e164_restricted, capabilities, status, brand_slug) VALUES ($1,'twilio',$2,$3,'+12145550100','{"voice":true}','active','colaberry')`, [tenant, `PN-e2e-${run}`, `e2e-line-${run}`]);
  const call = (n, engine, state, test, err) => one(`INSERT INTO voice_calls (tenant_id, profile_version_id, engine, idempotency_key, recipient_ref, purpose, state, test_mode, error_class, provider_call_id, human_answered, duration_seconds, created_at)
    VALUES ($1,$2,$3,$4,'e2e',$5,$6,$7,$8,$9,$10,$11, now() - interval '1 hour' * $12) RETURNING id`,
  [tenant, version, engine, `e2e-${run}-${n}`, `[e2e] ${run} ${n}`, state, test, err, `CA${run}${n}`, state === 'completed', state === 'completed' ? 42 : null, n]);
  const done = await call(1, 'conversation_relay', 'completed', false, null);
  const failed = await call(2, 'openai_realtime', 'failed', true, 'TimeoutError');
  const unknown = await call(3, 'conversation_relay', 'dispatch_unknown', false, 'DispatchUnknown');
  for (const [i, s] of ['ringing', 'answered', 'completed'].entries()) await db.query(`INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ($1,$2,$3,'carrier',$3,now() - interval '50 minutes' + interval '1 second' * $4)`, [tenant, done, s, i]);
  await db.query(`INSERT INTO voice_tool_runs (tenant_id, call_id, tool_name, idempotency_key, auth_decision, status) VALUES ($1,$2,'next_open_strategy_slots','k1','allowed','completed'),($1,$2,'book_meeting','k2','denied','failed')`, [tenant, done]);
  await db.query(`INSERT INTO voice_turns (tenant_id, call_id, turn_index, speaker, started_at, first_audio_latency_ms) VALUES ($1,$2,0,'agent',now(),640)`, [tenant, done]);
  await db.query(`INSERT INTO voice_usage (tenant_id, call_id, provider, unit, quantity, unit_price_usd, measured) VALUES ($1,$2,'twilio','minute',1,0.014,true),($1,$2,'openai','minute',1,NULL,false)`, [tenant, done]);
  await db.query(`INSERT INTO voice_evaluation_runs (tenant_id, engine, scenario_set, environment, verdict, evidence_ref) VALUES ($1,'conversation_relay',$2,'test','pass','ev-e2e'),($1,'conversation_relay',$3,'test','pass',NULL)`, [tenant, `e2e-${run}-a`, `e2e-${run}-b`]);
  return { tenant, profile, version, calls: { done, failed, unknown } };
}

/** Removes everything the run made, then counts what is left. */
async function cleanup(db, run, s, actors = []) {
  const problems = [];
  const step = async (sql, args) => { try { await db.query(sql, args); } catch (e) { problems.push(e.message); } };
  const like = `e2e-${run}%`;
  await step('DELETE FROM voice_routes WHERE path_key LIKE $1', [like]);
  await step(`DELETE FROM voice_evaluation_runs WHERE scenario_set LIKE $1 OR scores->>'created_by' = ANY($2)`, [like, actors]);
  if (s) {
    await step('DELETE FROM voice_calls WHERE tenant_id = $1', [s.tenant]); // call-scoped tables cascade
    await step('DELETE FROM voice_numbers WHERE tenant_id = $1', [s.tenant]);
    await step('DELETE FROM voice_agent_versions WHERE profile_id = $1', [s.profile]);
    await step('DELETE FROM voice_agent_profiles WHERE id = $1', [s.profile]);
  }
  const t = s ? s.tenant : null;
  const left = [];
  for (const table of ['voice_calls', 'voice_call_events', 'voice_tool_runs', 'voice_turns', 'voice_usage', 'voice_numbers', 'voice_agent_versions', 'voice_agent_profiles', 'voice_evaluation_runs']) {
    const n = (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [t])).rows[0].n; // table names are the literals above
    if (n) left.push(`${table} ${n}`);
  }
  const routes = (await db.query('SELECT count(*)::int AS n FROM voice_routes WHERE path_key LIKE $1', [like])).rows[0].n;
  if (routes) left.push(`voice_routes ${routes}`);
  return [...left, ...problems];
}

module.exports = { setup, token, seed, cleanup };
