#!/usr/bin/env node
/**
 * Process a government contract bid end-to-end into Basecamp.
 *
 * CLI wrapper around lib/govBidPipeline.js#processBid. Edit BID_CONFIG below
 * (per-bid) and run. The library handles all the Basecamp work; this file
 * just supplies the config and Basecamp IDs.
 *
 * Refactored 2026-05-31 (CC-20260531-9k4m): all pipeline logic moved into
 * lib/govBidPipeline.js to make it callable from the CB finalize flow. This
 * also fixes the prior 621-line ceiling violation in this file.
 *
 * Run: `BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/processGovBid.js`
 *      Add `--dry-run` to preview without creating Basecamp resources.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { processBid } = require('./lib/govBidPipeline');

// ────────────────────────────────────────────────────────────────────────────
// BID CONFIG — edit per bid
// ────────────────────────────────────────────────────────────────────────────
const BID_CONFIG = {
  opportunity_uuid: '2e287828-9040-4948-98fe-a0250a5d66a5',
  zip_path: 'c:/Users/ali_m/Downloads/26_0075 - pub - RFP - Agenda and Meeting Management System f.zip',
  display_title: 'Harris County - Agenda & Meeting Management System (RFP 26_0075)',
  bid_account: 'colaberry',
  phases: [
    { name: 'Phase 1 - Requirements + qualification gate', days: 'Days 1-7 (May 20-26)', output: 'Bid / no-bid decision. Requirements matrix extracted (Specifications + Functional Requirements + Technical Requirements + HCUS USRA + Security Controls). Pre-proposal conference attendance June 3.' },
    { name: 'Phase 2 - Solution + integration architecture', days: 'Days 8-18 (May 27-Jun 6)', output: 'Agenda + Meeting Management solution architecture. Integration with HCUS reference architecture. CAC/RAG over meeting content. Speaker management, vote management, A/V streaming. Public-access portal.' },
    { name: 'Phase 3 - Proposal writing + forms', days: 'Days 19-30 (Jun 7-18)', output: 'All 18 documents completed: Functional Requirements responses (MH/NH per Section 2), Technical Requirements responses (Section 3), HCUS Reference Architecture Questionnaire (xlsx), Security Vendor Controls List, all compliance forms (MWBE, HUB, Insurance, Vendor Disclosure, Tax Residence, Wage Policy).' },
    { name: 'Phase 4 - Review + submission', days: 'Days 31-33 (Jun 19-22)', output: 'Internal review, sign-off, submit via Harris County Bonfire portal by 2026-06-22 deadline.' },
  ],
  fit_thesis: 'Harris County (Texas, 3rd largest US county, 5M residents) seeks a modern Agenda + Meeting Management System for Commissioners Court. Scope: agenda management, meeting management, speaker appearance management, vote management, public-access portal, A/V streaming. Replaces a legacy system. Direct Colaberry wheelhouse: RAG over meeting/agenda content with citation, conversational interfaces for public access, document-generation for meeting materials. Aligns with Strategic Product P1 (Municipal Document Intelligence Platform) and P3 (Constituent-Services Triage Agent) being built in parallel. Sourced via Colaberry account invitation -> Colaberry-only proposal per gov-bid-account-routing rule (no Design House). Long timeline (33 days), 4x renewal options (up to 5-year deal). Important constraint: ALL work must be performed within the United States (offshore strictly prohibited).',
  value_override: null,
  term_override: 'Initial term: from contract award until go-live + acceptance. Up to four (4) one-year renewals possible (max 5-year total relationship). Value TBD per Ali pricing.',
  tasks: [
    { content: 'Read Harris County RFP 26_0075 in full + extract requirements matrix',
      note: 'Read all 18 documents in the zip. Main spec is Specifications.pdf. Build a requirements matrix tagged by source doc, owner, acceptance evidence.' },
    { content: 'Bid / no-bid decision (Phase 1 gate)',
      note: 'Confirm: (a) US-only delivery (offshore strictly prohibited per RFP), (b) ability to integrate with HCUS Universal Services Reference Architecture, (c) meet Harris County minimum IT security controls (per Vendor Controls List). Document GO/NO-GO.' },
    { content: 'Attend pre-proposal conference 2026-06-03 10:00 AM CT (Microsoft Teams)',
      note: 'Pre-proposal conference is optional but recommended for context. Teams link: https://teams.microsoft.com/meet/21478908496601?p=rZnQXBSV0YLWpuHUUl. Meeting ID: 214 789 084 966 01. Passcode: Ki6zj6XA.' },
    { content: 'Submit written questions via Bonfire (deadline per event schedule)',
      note: 'Questions submitted ONLY via Bonfire Q&A tab. Likely topics: (a) integration with existing Commissioners Court tools, (b) historical agenda data migration scope, (c) A/V streaming infrastructure, (d) public-access portal SLA, (e) FERPA-equivalent requirements for closed-session content.' },
    { content: 'Respond to Functional Requirements (Section 2) - MH/NH per row',
      note: 'Section 2.1 Core Functions: Agenda Mgmt, Meeting Mgmt, Speaker Mgmt, Vote Mgmt, Public Access, A/V Streaming. For each requirement: Out of the Box / Configuration Required / Customization Required / Cannot Be Met.' },
    { content: 'Respond to Technical Requirements (Section 3) + HCUS Universal Services Reference Architecture Questionnaire (xlsx)',
      note: 'Section 3 covers technical capabilities; the Q-09FY xlsx is the HCUS Reference Architecture Questionnaire. Fill the xlsx per HCUS\'s preferred format.' },
    { content: 'Complete IT Vendor Controls and Cybersecurity Acknowledgement Form',
      note: 'Per HC Minimum IT Security Vendor Controls List. Map each control to Colaberry\'s implementation; acknowledge or note exceptions.' },
    { content: 'Capability statement + past-performance narrative',
      note: 'One-pager: Colaberry credentials, AI platform deployments, public sector experience. 4+ references with closest fit to municipal agenda/meeting management OR document intelligence over governmental records.' },
    { content: 'Pricing proposal',
      note: 'Build pricing for: initial implementation + multi-year subscription. Multi-year framing (initial + 4x renewal options) drives the LTV story.' },
    { content: 'Implementation + Training + Maintenance/Support narrative',
      note: 'Implementation plan, training (Commissioners + Court staff + Clerk staff + IT admins), maintenance/support SLAs.' },
    { content: 'Complete compliance forms (MWBE/HUB + Insurance + Vendor Disclosure + Tax Residence + Wage)',
      note: 'Many compliance forms in the zip. Vinay completes all. Notarize as needed.' },
    { content: 'Executive summary',
      note: '2 pages: why us, project understanding, key differentiators (RAG-grounded meeting Q&A, citation-or-decline, multi-year scale story).' },
    { content: 'Internal review + sign-off (Phase 4)',
      note: 'Ali reviews full pack. Confirm all 18 documents addressed + all forms signed + insurance certs current. Sign-off in writing before submission.' },
    { content: 'Submit via Harris County Bonfire portal by 2026-06-22',
      note: 'Submission portal: https://harriscountytx.bonfirehub.com/opportunities/228389. Upload all required documents. Capture submission confirmation. Anticipated contract start: ~Oct 1, 2026.' },
  ],
};

const BASECAMP_IDS = {
  accountId: '3945211',
  projectId: '47346103',
  vaultId: '9908475797',
  todosetId: '9908475794',
  messageBoardId: '9908475791',
};

const DRY_RUN = process.argv.includes('--dry-run');

function getBasecampToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN;
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN env var required');
  if (t.startsWith('Bearer ')) t = t.slice(7);
  return t.trim();
}

(async () => {
  console.log(`[bid] ${BID_CONFIG.display_title}`);
  if (DRY_RUN) console.log('[bid] DRY RUN');
  const result = await processBid({
    bidConfig: BID_CONFIG,
    basecampIds: BASECAMP_IDS,
    basecampToken: getBasecampToken(),
    opts: {
      dryRun: DRY_RUN,
      opportunityPulseBase: 'http://95.216.199.47',
      opportunityPulseCreds: { email: 'admin@opportunitypulse.com', password: '3yhEcVki3Vp4emDuuXWk' },
    },
  });
  console.log('\n=== DONE ===');
  console.log(`Folder URL:   ${result.folder.app_url}`);
  console.log(`List URL:     ${result.list.app_url}`);
  console.log(`Message URL:  ${result.kickoff?.app_url}`);
  console.log(`Files uploaded: ${result.uploaded.length}`);
  console.log(`Tasks created:  ${result.tasks.length} (skipped any duplicates)`);
  if (result.summaryPath) console.log(`Summary written: ${result.summaryPath}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
