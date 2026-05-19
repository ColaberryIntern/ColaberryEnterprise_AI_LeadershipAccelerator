/**
 * One-off correction: Detroit AI for Muni-Code Search bid was initially staged
 * showing $30M value (from Opportunity Pulse's category-averaged estimate).
 * The actual RFP §1.3 specifies the contract amount is $50,000 for a 6-month
 * pilot. This script:
 *   1. Edits the kickoff message to fix the value
 *   2. Posts a separate correction message to the Message Board so the
 *      activity log captures what changed and why
 *
 * Once Opportunity Pulse's estimatedValue field is fixed for this opp, this
 * script can be deleted.
 *
 * Run: `BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/fixDetroitBidValueCorrection.js`
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const ACCOUNT_ID = '3945211';
const PROJECT_ID = '47346103';
const MESSAGE_BOARD_ID = '9908475791';
const KICKOFF_MESSAGE_ID = '9908586715';
const LIST_URL = 'https://3.basecamp.com/3945211/buckets/47346103/todolists/9908586327';
const FOLDER_URL = 'https://3.basecamp.com/3945211/buckets/47346103/vaults/9908585734';
const OP_URL = 'http://95.216.199.47/admin/bonfire/7011f5af-a0c6-45fb-8684-a6432c19cf54/submission-readiness';
const BONFIRE_URL = 'https://detroit.bonfirehub.com/opportunities/222743';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN;
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.startsWith('Bearer ')) t = t.slice(7);
  return t;
}

const HEADERS = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)',
  Accept: 'application/json',
  ...extra,
});

const REVISED_KICKOFF_CONTENT = `<div>
<p><strong>Bid kickoff:</strong> Detroit - AI for Muni-Code Search (RFP 544695)</p>

<ul>
  <li><strong>Value:</strong> $50,000 (validated against RFP §1.3 verbatim)</li>
  <li><strong>Term:</strong> Pilot: 6 months ($50K). Optional scale-up to full production contract per RFP §1.3 + Pricing Attachment C.</li>
  <li><strong>Deadline:</strong> 2026-06-12</li>
  <li><strong>Pre-bid meeting:</strong> 2026-06-04, 11:00 AM EDT (Microsoft Teams; details in RFP)</li>
  <li><strong>Questions due:</strong> 2026-06-05, 3:00 PM EDT</li>
  <li><strong>To-Do List (game plan + tasks):</strong> <a href="${LIST_URL}">Detroit - AI for Muni-Code Search (RFP 544695)</a></li>
  <li><strong>Docs &amp; Files folder (8 RFP files):</strong> <a href="${FOLDER_URL}">Detroit - AI for Muni-Code Search (RFP 544695)</a></li>
  <li><strong>Opportunity Pulse:</strong> <a href="${OP_URL}">submission readiness view</a></li>
  <li><strong>Bonfire source:</strong> <a href="${BONFIRE_URL}">opportunity 222743</a></li>
</ul>

<p><strong>Why we're bidding:</strong> This is verbatim a RAG / document-intelligence build over a regulated corpus. Colaberry skills (Document Intelligence, AI/ML, Conversational AI, Cloud Architecture, Predictive Analytics) map 1:1. Detroit framed it as a "Tech Innovation Challenge" pilot, signaling openness to new vendors over entrenched incumbents. The pilot is small ($50K, 6 months) but has an explicit scale-up path to a full production contract per Pricing Attachment C, which asks for both pilot and full-contract pricing structures.</p>

<p><strong>Strategic value beyond the pilot dollar amount:</strong> a Detroit reference unlocks similar municipal-code search bids across the 19,000 US municipalities, and the pilot-to-production scale-up clause means winning this $50K opens the door to a much larger follow-on. The bid effort is justified by the relationship and scale-up potential, not the pilot dollars alone.</p>

<p>Status updates posted here as phases complete. Detailed task progress lives on the List.</p>

<p><em>Note: an earlier version of this message showed $30M from Opportunity Pulse. That was wrong - OP estimates value by category and didn't parse the actual RFP. Corrected from the RFP source.</em></p>
</div>`;

const CORRECTION_MESSAGE_CONTENT = `<div>
<p><strong>Heads up: value correction on the Detroit Muni-Code Search bid.</strong></p>

<p>The initial kickoff showed <strong>$30,000,000</strong>. That was sourced from Opportunity Pulse's <code>estimatedValue</code> field, which uses category-average estimation rather than parsing the actual RFP.</p>

<p>The real contract value, per RFP §1.3 Award Clause verbatim: <strong>$50,000.00</strong> for a 6-month pilot. Optional scale-up to a full production contract per Pricing Attachment C, but no dollar value for the scale-up is stated in the RFP.</p>

<p>Updates applied:</p>
<ul>
  <li><a href="${LIST_URL}">To-Do List description</a> now shows $50K + scale-up note</li>
  <li>Kickoff message above edited to match</li>
</ul>

<p><strong>Does this change the bid call?</strong> No. The strategic-fit thesis still holds (Document Intelligence + Conversational AI is our wheelhouse, Detroit is openly inviting new vendors via the "Innovation Challenge" framing, the pilot-to-production scale-up clause is the real prize). But it does change how we frame internal effort: bid prep cost has to be justified by the relationship + scale-up potential, not the pilot dollars alone. Recommend proceeding.</p>

<p><strong>Systemic note for Ali (DRI for Opportunity Pulse):</strong> spot-checked, the OP <code>estimatedValue</code> appears to be wrong by 100-1000x on at least this opp. Worth a separate sprint to (a) re-source values from RFP text when available, (b) flag "estimated by category" vs "validated from RFP" in the UI so we know when to trust it. I've added a <code>value_override</code> field to <code>processGovBid.js</code> as a workaround in the meantime.</p>
</div>`;

(async () => {
  const token = getToken();
  console.log('[fix] Editing kickoff message body...');
  const editR = await fetch(`${API}/buckets/${PROJECT_ID}/messages/${KICKOFF_MESSAGE_ID}.json`, {
    method: 'PUT',
    headers: HEADERS(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      subject: 'Bid kickoff: Detroit - AI for Muni-Code Search (RFP 544695)',
      content: REVISED_KICKOFF_CONTENT,
    }),
  });
  if (!editR.ok) throw new Error(`PUT kickoff -> ${editR.status} ${await editR.text()}`);
  const edited = await editR.json();
  console.log(`[fix] Edited kickoff (id=${edited.id}) -> ${edited.app_url}`);

  console.log('[fix] Posting correction message...');
  const postR = await fetch(`${API}/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`, {
    method: 'POST',
    headers: HEADERS(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      subject: 'Correction: Detroit Muni-Code bid value is $50K pilot (not $30M)',
      content: CORRECTION_MESSAGE_CONTENT,
      status: 'active',
    }),
  });
  if (!postR.ok) throw new Error(`POST correction -> ${postR.status} ${await postR.text()}`);
  const posted = await postR.json();
  console.log(`[fix] Posted correction (id=${posted.id}) -> ${posted.app_url}`);

  console.log('\n[fix] Done.');
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
