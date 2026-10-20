/**
 * C6.10 - the campaign activation readiness gate. THE single source for both PDFs.
 *
 * ## The gate is code, so this document reads the code
 *
 * `GATE_CHECKS` lives in `backend/src/services/campaignActivationGate.ts`. This module
 * parses that file rather than restating the checks, because a checklist document that
 * drifts from the gate it describes is worse than no document: it tells a reader the
 * system enforces something it does not.
 *
 * ## What the measurement found, and why it changed the design
 *
 * Production, 2026-10-20, read-only:
 *
 *   - **6 campaigns are `status='active'` with `approval_status='draft'`** - live, having
 *     never been approved. One is a cold outbound campaign.
 *   - **46 campaigns, 0 governance configs**, so `validateCampaignForPublish` currently
 *     fails for every campaign in the system.
 *   - **0 campaigns have a sender identity.** 6 of 46 have a tracking link.
 *
 * There were two doors into "active" and only one was locked. `goLive()` runs
 * `validateCampaignForPublish` and always has. `activateCampaign()` checked `status` and
 * nothing else - and it is what the admin route, the recovery service and the go-live
 * scripts all call.
 *
 * The honest consequence is stated rather than buried: wiring this gate stops activation
 * until campaigns are regularized, including recovery of the 22 paused campaigns still on
 * `approval_status='draft'`. That is what a gate does, and it is a real operational change.
 */
const fs = require('fs');
const path = require('path');
const { findBritishSpelling, americanForm } = require('../britishSpellings');

const GATE_SRC = path.join(
  __dirname, '..', '..', '..', 'backend', 'src', 'services', 'campaignActivationGate.ts',
);
const CAMPAIGN_SRC = path.join(
  __dirname, '..', '..', '..', 'backend', 'src', 'services', 'campaignService.ts',
);

const AS_OF = '2026-10-20';

/* ── measured in production, read-only ────────────────────────────────────── */

const MEASURED = {
  campaigns: 46,
  governanceConfigs: 0,
  withSenderIdentity: 0,
  withTracking: 6,
  activeButUnapproved: 6,
  pausedAndDraft: 22,
  unapprovedExample: 'AI Leadership Cold Outbound Q1 (cold_outbound)',
};

/* ── the two doors ────────────────────────────────────────────────────────── */

const DOORS = [
  {
    fn: 'campaignApprovalService.goLive()',
    was: 'GUARDED. Calls validateCampaignForPublish, which requires approval_status to be '
      + '"approved", plus a governance config, channel, destination, objective and budget '
      + 'headroom.',
    now: 'Unchanged.',
  },
  {
    fn: 'campaignService.activateCampaign()',
    was: 'UNGUARDED. Checked that status was draft or paused and nothing else. Never read '
      + 'approval_status. Called by the admin route, campaignRecoveryService, '
      + 'finalActivation and goLiveOrchestration.',
    now: 'Calls assertActivationAllowed(id) BEFORE campaign.update, so a blocked campaign '
      + 'is never written.',
  },
];

/* ── assertions ───────────────────────────────────────────────────────────── */

/** Read the checks out of the service, so this document cannot describe a gate that is not there. */
function loadChecks() {
  const src = fs.readFileSync(GATE_SRC, 'utf8');
  const body = src.slice(src.indexOf('export const GATE_CHECKS'));
  const checks = [];
  for (const part of body.split(/\r?\n {2}\{\r?\n/).slice(1)) {
    const pick = (f) => {
      const m = new RegExp(`${f}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(part);
      return m ? m[1].replace(/\\'/g, "'") : null;
    };
    const id = pick('id');
    if (!id) continue;
    checks.push({
      id,
      label: pick('label'),
      owner: pick('owner'),
      method: (part.match(/method:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/) || [, ''])[1]
        .replace(/'\s*\+\s*'/g, '').replace(/^'|'$/g, '').replace(/\\'/g, "'").trim(),
      automated: /automated:\s*true/.test(part),
    });
  }
  if (checks.length < 8) {
    throw new Error(`C6.10: parsed only ${checks.length} checks from the gate; the parse is broken`);
  }
  return checks;
}

const CHECKS = loadChecks();

/** The ticket requires every check to carry an owner and a method. */
function assertEveryCheckHasOwnerAndMethod() {
  for (const c of CHECKS) {
    if (!['system', 'Ali'].includes(c.owner)) {
      throw new Error(`C6.10: check "${c.id}" has owner "${c.owner}"`);
    }
    if (!c.method || c.method.length < 20) {
      throw new Error(`C6.10: check "${c.id}" has no real method`);
    }
  }
  return CHECKS.length;
}

/** The gate must actually be wired into the unguarded door, not merely exist. */
function assertGateIsWiredIntoActivation() {
  const src = fs.readFileSync(CAMPAIGN_SRC, 'utf8');
  const fnAt = src.indexOf('export async function activateCampaign');
  if (fnAt < 0) throw new Error('C6.10: activateCampaign not found');
  const callAt = src.indexOf('assertActivationAllowed', fnAt);
  const updateAt = src.indexOf('campaign.update', fnAt);
  if (callAt < 0) {
    throw new Error('C6.10: activateCampaign does not call the gate. The gate would be '
      + 'advice, which is the thing this ticket says it must not be.');
  }
  if (updateAt > 0 && callAt > updateAt) {
    throw new Error('C6.10: the gate is called AFTER campaign.update. A gate that throws '
      + 'once the write has happened is not a gate.');
  }
  return true;
}

/** A gate with an escape hatch is a recommendation. */
function assertNoBypass() {
  const src = fs.readFileSync(GATE_SRC, 'utf8');
  const sig = /export async function assertActivationAllowed\(([^)]*)\)/.exec(src);
  if (!sig) throw new Error('C6.10: assertActivationAllowed not found');
  if (/force|bypass|skip|override/i.test(sig[1])) {
    throw new Error(`C6.10: assertActivationAllowed takes "${sig[1].trim()}". A bypass makes `
      + 'it advice.');
  }
  return sig[1].trim();
}

/** At least the two genuinely undecidable checks stay manual, and the rest automated. */
function assertAutomationSplitIsHonest() {
  const manual = CHECKS.filter((c) => !c.automated).map((c) => c.id).sort();
  const automated = CHECKS.filter((c) => c.automated).length;
  if (automated < 6) {
    throw new Error(`C6.10: only ${automated} checks are automated. The ticket asks that `
      + 'every check the existing services can enforce actually be enforced.');
  }
  if (!manual.includes('claims_approved')) {
    throw new Error('C6.10: claims_approved must stay MANUAL. The C0.6 registry governs '
      + 'page copy in the frontend; the backend cannot read a rendered message and judge '
      + 'it, and pretending otherwise would be the worst kind of green tick.');
  }
  return { automated, manual };
}

/** The measured production state must stay stated; it is the reason the gate exists. */
function assertMeasurementIsStated() {
  if (MEASURED.activeButUnapproved < 1) {
    throw new Error('C6.10: if no campaign is active-but-unapproved any more, re-measure '
      + 'and rewrite the finding rather than keeping a stale one.');
  }
  if (MEASURED.governanceConfigs !== 0) {
    throw new Error('C6.10: governance configs now exist. Re-measure: the claim that the '
      + 'publish validator fails for every campaign may no longer hold.');
  }
  return MEASURED;
}

/** Outbound-quality copy discipline, even on an internal document. */
function assertCopyIsClean() {
  const prose = [
    ...CHECKS.map((c) => `${c.label} ${c.method}`),
    ...DOORS.map((d) => `${d.was} ${d.now}`),
  ].join(' ');
  const british = findBritishSpelling(prose);
  if (british) {
    throw new Error(`C6.10: British spelling "${british}"; use "${americanForm(british)}"`);
  }
  if (/—/.test(prose)) throw new Error('C6.10: the copy contains an em dash');
  return true;
}

module.exports = {
  AS_OF,
  MEASURED,
  DOORS,
  CHECKS,
  loadChecks,
  assertEveryCheckHasOwnerAndMethod,
  assertGateIsWiredIntoActivation,
  assertNoBypass,
  assertAutomationSplitIsHonest,
  assertMeasurementIsStated,
  assertCopyIsClean,
};
