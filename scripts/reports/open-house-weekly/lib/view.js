/**
 * C124: the one view model the report, the email and ONE_MOVE_PROMPT.md are all built from. Three outputs, one
 * computation: the starred move in the email can never differ from the one in the attachment or the prompt.
 */
'use strict';
const S = require('./story');
const R = require('./recommend');
const { overviewRows } = require('./lead');
const M = require('./model');

/**
 * @param {object} snap     collect.sql snapshot (+ optional `email` from Mandrill)
 * @param {object} targets  targets.js
 * @param {Array}  entries  story/decisions.json entries (already validated)
 */
function buildView(snap, targets, entries) {
  const cur = snap.windows.cur, prev = snap.windows.prev || null;
  const weekOf = String(snap.generated_ct).slice(0, 10);
  const story = S.build(entries, cur, snap.email, targets, weekOf);
  const rec = R.recommend(cur, snap.email, targets, story.inFlight, weekOf);
  return {
    snap, cur, prev, weekOf, story, rec,
    top10: R.topTen(cur, snap.email, targets),
    overview: overviewRows(cur, snap.email, targets),
    funnel: M.funnel(cur, targets),
  };
}

module.exports = { buildView };
