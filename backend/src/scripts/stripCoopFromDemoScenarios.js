// Strips co-op-specific language from frontend/src/config/demoScenarios.json
// so the same scenario library serves both the co-op landing page and the
// IOU landing page without surfacing wrong-vertical language inside demos.
//
// Read-write. Run from repo root: `node backend/src/scripts/stripCoopFromDemoScenarios.js`
// Idempotent (safe to re-run; second run finds nothing to change).

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../../../frontend/src/config/demoScenarios.json');

// Order matters: longer phrases first so they win over shorter substring matches.
const REPLACEMENTS = [
  // Phrases (longest first)
  { from: /Regional electric cooperative serving/g, to: 'Regional electric utility serving' },
  { from: /Regional electric cooperative with/g, to: 'Regional electric utility with' },
  { from: /Regional electric cooperative\./g, to: 'Regional electric utility.' },
  { from: /Regional electric cooperative,/g, to: 'Regional electric utility,' },
  { from: /Regional cooperative subject to/g, to: 'Regional utility subject to' },
  { from: /regional electric cooperative/g, to: 'regional electric utility' },
  { from: /electric cooperative/g, to: 'electric utility' },
  { from: /electric coop\b/g, to: 'electric utility' },
  { from: /What does your cooperative do\?/g, to: 'What does your utility do?' },
  { from: /your cooperative could predict/g, to: 'your utility could predict' },
  { from: /your cooperative\b/g, to: 'your utility' },
  { from: /the cooperative\b/g, to: 'the utility' },
  { from: /\bcooperative\b/g, to: 'utility' },
  { from: /\bco-op\b/gi, to: 'utility' },
  { from: /\bco-ops\b/gi, to: 'utilities' },
  { from: /peer cooperatives/g, to: 'peer utilities' },
  { from: /neighboring co-ops/gi, to: 'neighboring utilities' },

  // Industry / outcome labels (NOT the scenario id, which stays utility-memberservices for backward compat)
  { from: /"industry":"Member Services AI"/g, to: '"industry":"Customer Services AI"' },
  { from: /"label":"Member Satisfaction"/g, to: '"label":"Customer Satisfaction"' },
  { from: /AI recommends member services and intelligent routing/g, to: 'AI recommends customer services and intelligent routing' },

  // Member Services / Member Comms named systems and bots
  { from: /Member Services Engine/g, to: 'Customer Services Engine' },
  { from: /Member Service Engine/g, to: 'Customer Service Engine' },
  { from: /Member Comms Engine/g, to: 'Customer Comms Engine' },
  { from: /Member Service Bot/g, to: 'Customer Service Bot' },
  { from: /Member service operations/g, to: 'Customer service operations' },
  { from: /member service operations/g, to: 'customer service operations' },
  { from: /Member service\b/g, to: 'Customer service' },
  { from: /member service\b/g, to: 'customer service' },

  // Member-as-customer noun replacements (specific contexts to avoid "team members" / "board members")
  { from: /380,000 members/g, to: '380,000 customers' },
  { from: /75,000\+ members/g, to: '75,000+ customers' },
  { from: /42,000 members/g, to: '42,000 customers' },
  { from: /1,200 affected members/g, to: '1,200 affected customers' },
  { from: /every member getting/g, to: 'every customer getting' },
  { from: /the member /g, to: 'the customer ' },
  { from: /Members get /g, to: 'Customers get ' },
  { from: /members get /g, to: 'customers get ' },
  { from: /Member satisfaction /g, to: 'Customer satisfaction ' },
  { from: /member satisfaction /g, to: 'customer satisfaction ' },
  { from: /Members notified/g, to: 'Customers notified' },
  { from: /members notified/g, to: 'customers notified' },
  { from: /no member impact/g, to: 'no customer impact' },
  { from: /zero member impact/g, to: 'zero customer impact' },
  { from: /Members experience/g, to: 'Customers experience' },
  { from: /members experience/g, to: 'customers experience' },
  { from: /angry about long hold/g, to: 'frustrated about long hold' }, // "Members angry" -> better tone overall
  { from: /Members angry/g, to: 'Customers frustrated' },
  { from: /happier members/g, to: 'happier customers' },
  { from: /complex member/g, to: 'complex customer' },
  { from: /47 member conversations/g, to: '47 customer conversations' },
  { from: /member conversations/g, to: 'customer conversations' },
  { from: /Sent proactive updates to (\d[\d,]*) affected members/g, to: 'Sent proactive updates to $1 affected customers' },
  { from: /Auto-sent alerts to (\d[\d,]*) members/g, to: 'Auto-sent alerts to $1 customers' },
  { from: /alerts to (\d[\d,]*) members/g, to: 'alerts to $1 customers' },
  { from: /\b(\d[\d,]*) members\b/g, to: '$1 customers' },
];

const raw = fs.readFileSync(FILE, 'utf8');
let modified = raw;
const counts = {};

for (const { from, to } of REPLACEMENTS) {
  const matches = modified.match(from);
  if (matches) {
    counts[from.source] = matches.length;
    modified = modified.replace(from, to);
  }
}

const totalReplacements = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`[strip] Total replacements: ${totalReplacements}`);
console.log('[strip] By pattern:');
for (const [pattern, count] of Object.entries(counts)) {
  console.log(`  ${count.toString().padStart(3)}  ${pattern}`);
}

// Sanity: verify no "cooperative" / "co-op" / "Member Service Bot" left
const residual = (modified.match(/\b(cooperative|co-op|Member Service Bot|Member Services Engine)\b/gi) || []);
if (residual.length > 0) {
  console.log('\n[strip] WARNING: residual co-op references still present:');
  residual.slice(0, 10).forEach(r => console.log(`  ${r}`));
}

if (raw === modified) {
  console.log('\n[strip] No changes made (file already clean or patterns did not match).');
} else {
  fs.writeFileSync(FILE, modified, 'utf8');
  console.log(`\n[strip] Wrote ${FILE}`);
  console.log(`[strip] Size: ${raw.length} bytes -> ${modified.length} bytes`);
}
