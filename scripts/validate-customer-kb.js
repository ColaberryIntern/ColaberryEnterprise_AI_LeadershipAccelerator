#!/usr/bin/env node
/**
 * validate-customer-kb.js — zero-dependency validator for the published
 * customer knowledge base feed (frontend/public/knowledge/customer_kb.json).
 *
 * This mirrors the canonical contract that lives in the training-site repo
 * (src/lib/training/knowledge-schema.ts, schema "colaberry.customer-kb").
 * Both sides validate against the same rules so a bad payload never ships:
 *   - the training build fails closed to its committed snapshot;
 *   - this script gates the enterprise export before it is served.
 *
 * Usage:  node scripts/validate-customer-kb.js [path-to-json]
 *         (defaults to frontend/public/knowledge/customer_kb.json)
 * Exit 0 = valid, 1 = invalid (issues printed).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTERNAL_HOSTS = ["enterprise.colaberry.ai", "localhost", "127.0.0.1", "0.0.0.0"];

function isPublicRefUrl(v) {
  let u;
  try { u = new URL(v); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (INTERNAL_HOSTS.includes(h)) return false;
  if (h.endsWith(".internal") || h.endsWith(".local")) return false;
  return true;
}

function validate(doc) {
  const issues = [];
  const push = (m) => issues.push(m);

  if (!doc || typeof doc !== "object") { return ["root is not an object"]; }
  if (doc.schema !== "colaberry.customer-kb") push(`schema must be "colaberry.customer-kb" (got ${JSON.stringify(doc.schema)})`);
  if (typeof doc.version !== "string" || !doc.version) push("version must be a non-empty string");
  if (typeof doc.generated_at !== "string" || !doc.generated_at) push("generated_at must be a non-empty string");
  if (!Array.isArray(doc.categories) || doc.categories.length < 1) push("categories must be a non-empty array");
  if (!Array.isArray(doc.entries)) push("entries must be an array");
  if (issues.length) return issues;

  const catKeys = new Set();
  doc.categories.forEach((c, i) => {
    if (!c || typeof c !== "object") return push(`category[${i}] not an object`);
    if (typeof c.key !== "string" || !KEBAB.test(c.key)) push(`category[${i}].key must be kebab-case (got ${JSON.stringify(c.key)})`);
    if (typeof c.label !== "string" || !c.label) push(`category[${i}].label must be a non-empty string`);
    if (c.order != null && !Number.isInteger(c.order)) push(`category[${i}].order must be an integer`);
    if (catKeys.has(c.key)) push(`duplicate category key "${c.key}"`);
    catKeys.add(c.key);
  });

  const ids = new Set();
  const slugsByCat = {};
  doc.entries.forEach((e, i) => {
    const at = `entry[${i}]${e && e.id ? " (" + e.id + ")" : ""}`;
    if (!e || typeof e !== "object") return push(`${at} not an object`);
    if (typeof e.id !== "string" || !e.id) push(`${at}.id must be a non-empty string`);
    else { if (ids.has(e.id)) push(`duplicate id "${e.id}"`); ids.add(e.id); }
    if (typeof e.slug !== "string" || !KEBAB.test(e.slug)) push(`${at}.slug must be kebab-case (got ${JSON.stringify(e.slug)})`);
    if (typeof e.category !== "string" || !catKeys.has(e.category)) push(`${at}.category "${e.category}" is not a known category key`);
    else {
      slugsByCat[e.category] = slugsByCat[e.category] || new Set();
      if (slugsByCat[e.category].has(e.slug)) push(`duplicate slug "${e.slug}" within category "${e.category}"`);
      slugsByCat[e.category].add(e.slug);
    }
    if (typeof e.question !== "string" || !e.question) push(`${at}.question must be a non-empty string`);
    if (typeof e.answer !== "string" || !e.answer) push(`${at}.answer must be a non-empty string`);
    if (e.tags != null && !Array.isArray(e.tags)) push(`${at}.tags must be an array`);
    if (e.related != null && !Array.isArray(e.related)) push(`${at}.related must be an array`);
    if (e.featured != null && typeof e.featured !== "boolean") push(`${at}.featured must be a boolean`);
    if (e.order != null && !Number.isInteger(e.order)) push(`${at}.order must be an integer`);
    // leak guards (defense in depth)
    if (e.needs_verification != null && e.needs_verification !== false) push(`${at}.needs_verification must be false if present`);
    if (e.public != null && e.public !== true) push(`${at}.public must be true if present`);
    if (e.reference != null) {
      if (typeof e.reference !== "object" || typeof e.reference.label !== "string" || !e.reference.label)
        push(`${at}.reference must be { label, url }`);
      else if (!isPublicRefUrl(e.reference.url))
        push(`${at}.reference.url must be a public https URL, no internal hosts (got ${JSON.stringify(e.reference.url)})`);
    }
  });

  // referential integrity for related ids
  doc.entries.forEach((e) => {
    (e.related || []).forEach((rid) => {
      if (!ids.has(rid)) push(`entry ${e.id} related id "${rid}" does not resolve`);
    });
  });

  return issues;
}

const file = process.argv[2] || path.join(__dirname, "..", "frontend", "public", "knowledge", "customer_kb.json");
let doc;
try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (err) { console.error("FAIL: could not read/parse " + file + "\n  " + err.message); process.exit(1); }

const issues = validate(doc);
if (issues.length) {
  console.error("INVALID customer_kb.json (" + issues.length + " issue" + (issues.length === 1 ? "" : "s") + "):");
  issues.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
const feat = doc.entries.filter((e) => e.featured).length;
console.log("valid — " + doc.entries.length + " entries across " + doc.categories.length +
  " categories (" + feat + " featured), schema " + doc.schema + " v" + doc.version);
process.exit(0);
