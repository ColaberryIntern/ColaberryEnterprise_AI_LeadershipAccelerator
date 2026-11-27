/**
 * Where a ladder lands. One engine, one setting (Ali, 2026-11-27: "Either way they should be the same
 * thing because they are minor details that can be parameters in the same engine").
 *   default            a new list in Ali Personal
 *   bucket             a new list in another project (a public or team project Ali created)
 *   intoList           new groups on an existing list in that project
 * Pure. Throws on anything that is not a plain Basecamp id, so a typo cannot write somewhere odd.
 */
'use strict';
const ALI_PERSONAL = 7463955;

function target(spec, { bucket, intoList } = {}) {
  const id = (v, what) => {
    if (v === undefined || v === null || v === '') return null;
    if (!/^\d{5,12}$/.test(String(v))) throw new Error(`${what} must be a Basecamp id, got ${JSON.stringify(v)}`);
    return Number(v);
  };
  const b = id(bucket, '--bucket') || id(spec.bucket, 'spec.bucket') || ALI_PERSONAL;
  const into = id(intoList, '--into-list') || id(spec.intoList, 'spec.intoList');
  return { bucket: b, intoList: into, place: b === ALI_PERSONAL ? 'Ali Personal' : spec.place || `project ${b}` };
}

module.exports = { target, ALI_PERSONAL };
