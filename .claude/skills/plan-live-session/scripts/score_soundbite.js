#!/usr/bin/env node
/**
 * score_soundbite.js: deterministic 0-100 score for one sound bite. Same text, same score, always.
 *
 *   node score_soundbite.js "Stop asking which model is best; ask which one you can audit."
 *   node score_soundbite.js --file=bites.json      (a JSON array of strings or of {text} objects)
 *   node score_soundbite.js --json "..."           (machine-readable output)
 *
 * Rules (from the plan-live-session spec; references/rubric.md explains them):
 *   start 40
 *   +15 for 8-28 words · -22 under 6 words · -15 over 40 words
 *   +10 contains a number (digits, or a spelled number word)
 *   +12 contains a contrast word: but, instead, never, stop, not, mistake, fail (and their plurals/tenses)
 *   +8  addresses "you"
 *   +6  contains a stakes word: biggest, only, every, first, worst
 *   +6  first-person story verb: we/I built, shipped, cut
 *   -15 starts with: and, so, but, because, it, this, that, they
 *   -7  per filler: um, you know, kind of, basically
 *   clamp to 0-100
 *
 * Exit 0 always for scoring; use the `pass` field (>= 70) to decide whether to rewrite.
 */
'use strict';
const fs = require('fs');

const PASS = 70;
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'twenty', 'thirty', 'forty', 'fifty', 'hundred', 'thousand', 'million', 'billion', 'half', 'twice', 'double'];
const CONTRAST = /\b(but|instead|never|stop(s|ped|ping)?|not|mistakes?|fail(s|ed|ing|ure|ures)?)\b/i;
const STAKES = /\b(biggest|only|every|first|worst)\b/i;
const STORY = /\b(we|i)\s+(built|shipped|cut)\b/i;
const BAD_START = /^(and|so|but|because|it|this|that|they)\b/i;
const FILLERS = [/\bum+\b/gi, /\byou know\b/gi, /\bkind of\b/gi, /\bbasically\b/gi];

function words(text) {
  return text.trim().replace(/[‘’]/g, "'").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
}

function scoreSoundbite(raw) {
  const text = String(raw || '').trim().replace(/[‘’]/g, "'");
  const n = words(text).length;
  const parts = [{ rule: 'start', points: 40 }];
  const add = (rule, points) => parts.push({ rule, points });

  if (n >= 8 && n <= 28) add('8-28 words', 15);
  if (n < 6) add('under 6 words', -22);
  if (n > 40) add('over 40 words', -15);
  const numberWord = new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'i');
  if (/\d/.test(text) || numberWord.test(text)) add('number', 10);
  if (CONTRAST.test(text)) add('contrast word', 12);
  if (/\byou(r|rs|'re|'ll|'ve)?\b/i.test(text)) add('"you"', 8);
  if (STAKES.test(text)) add('stakes word', 6);
  if (STORY.test(text)) add('first-person story verb', 6);
  const opener = text.replace(/^[^a-z0-9]+/i, '');
  if (BAD_START.test(opener)) add(`starts with "${opener.match(BAD_START)[1].toLowerCase()}"`, -15);
  let fillers = 0;
  for (const re of FILLERS) fillers += (text.match(re) || []).length;
  if (fillers) add(`${fillers} filler(s)`, -7 * fillers);

  const total = parts.reduce((s, p) => s + p.points, 0);
  const score = Math.max(0, Math.min(100, total));
  return { text, words: n, score, pass: score >= PASS, parts };
}

module.exports = { scoreSoundbite, words, PASS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const file = (args.find((a) => a.startsWith('--file=')) || '').slice(7);
  let inputs = args.filter((a) => !a.startsWith('--'));
  if (file) inputs = JSON.parse(fs.readFileSync(file, 'utf8')).map((x) => (typeof x === 'string' ? x : x.text));
  if (!inputs.length) { console.error('usage: score_soundbite.js "<text>" | --file=bites.json [--json]'); process.exit(1); }
  const results = inputs.map(scoreSoundbite);
  if (asJson) { process.stdout.write(JSON.stringify(results, null, 2) + '\n'); process.exit(0); }
  for (const r of results) {
    console.log(`${String(r.score).padStart(3)} ${r.pass ? 'PASS' : 'FAIL'}  (${r.words}w)  ${r.text}`);
    console.log(`      ${r.parts.map((p) => `${p.rule} ${p.points >= 0 ? '+' : ''}${p.points}`).join(' · ')}`);
  }
}
