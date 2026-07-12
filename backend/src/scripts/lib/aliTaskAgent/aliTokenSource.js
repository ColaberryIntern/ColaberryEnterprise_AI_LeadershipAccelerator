/**
 * Identity guard for the Ali Task Agent.
 *
 * ATA posts AS Ali (person 17454835). That is the whole point, but it is also
 * the dangerous part: if the resolved Basecamp token belonged to someone else
 * (e.g. the CB System token, or a degraded/rekeyed token), ATA would post under
 * the wrong name. This is the EXACT failure that took CB down on 2026-06-22
 * (token degraded to Ali; CB had no identity check, so it self-replied 1,245
 * times). CB now resolves `/my/profile.json` every tick and HALTS if it is not
 * CB System. ATA does the inverse: it resolves the identity and HALTS if it is
 * NOT Ali.
 *
 * Phase 1 resolves the token from process.env.BASECAMP_ACCESS_TOKEN (set by the
 * cron wrapper / orchestrator from CCPP.Basecamp_AuthInfo, which is typically
 * Ali's token). A dedicated mint of Ali's operator token via the advisor app
 * (tokens.get_user_token("ali@colaberry.com")) is a Phase-2 plug-in point; the
 * identity assertion below is what makes either source safe.
 */
const ops = require('../launchPmoOps');

const ALI_BC_USER_ID = Number(process.env.ALI_BC_USER_ID || 17454835);

class AtaIdentityHalt extends Error {
  constructor(message, actualId) {
    super(message);
    this.name = 'AtaIdentityHalt';
    this.actualId = actualId;
  }
}

/**
 * Resolve the identity the current Basecamp token posts as.
 * @param {{ bcGet?: (p:string)=>Promise<any> }} [deps]
 * @returns {Promise<{ id: number|null, name?: string }>}
 */
async function resolveIdentity(deps = {}) {
  const bcGet = deps.bcGet || ops.bcGet;
  const me = await bcGet('/my/profile.json');
  if (!me || typeof me.id === 'undefined' || me.id === null) {
    return { id: null };
  }
  return { id: Number(me.id), name: me.name };
}

/**
 * Assert the live posting identity IS Ali. Throws AtaIdentityHalt otherwise so
 * the caller can halt the run with no writes. Returns the identity on success.
 * @param {{ bcGet?: (p:string)=>Promise<any>, expectedId?: number }} [deps]
 */
async function assertAliIdentity(deps = {}) {
  const expected = Number(deps.expectedId || ALI_BC_USER_ID);
  const who = await resolveIdentity(deps);
  if (who.id !== expected) {
    throw new AtaIdentityHalt(
      `Identity check failed: posting as ${who.id === null ? 'unknown' : who.id} (${who.name || '?'}), expected Ali ${expected}. Halting run with no writes to avoid posting under the wrong name.`,
      who.id,
    );
  }
  return who;
}

module.exports = { ALI_BC_USER_ID, AtaIdentityHalt, resolveIdentity, assertAliIdentity };
