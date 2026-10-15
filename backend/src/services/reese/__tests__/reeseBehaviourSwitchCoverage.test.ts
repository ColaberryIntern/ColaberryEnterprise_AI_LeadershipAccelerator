import * as fs from 'fs';
import * as path from 'path';
import { REESE_BEHAVIOUR_KEYS } from '../../../schemas/reeseBehaviourSwitchSchema';
import {
  BEHAVIOUR_KEY_BY_NAME,
  BEHAVIOUR_TOOLS,
  CRON_REGISTRY_NAMES,
  BEHAVIOUR_KEY_BY_CRON_AGENT_NAME,
} from '../reeseBehaviourMetadata';
import { SIBLING_REGISTRY_NAME } from '../reeseBehaviourSwitchService';
import { REESE_BEHAVIOURS } from '../../../scripts/lib/reeseBehaviourInventory';

/**
 * Every Reese behaviour that can message a student must have a MANAGER KILL SWITCH.
 *
 * This test exists because one did not. `ReeseTicketFollowUpSweep` shipped 2026-10-02 as a live,
 * `enabled: true`, daily cron calling `initiateDm()` against real students, and it was absent from
 * `REESE_BEHAVIOUR_KEYS`, from `SIBLING_REGISTRY_NAME` and from the behaviour inventory. Its
 * individual sends were authorization-gated throughout -- it was never unguarded -- but no manager
 * could turn it off from the Employee facts card that exists for exactly that purpose, and
 * `ROLE_CHARTER_v2.md:35`'s "no behaviour outside the 7" was true of the charter and false of
 * production for seven days.
 *
 * It was found by a capability sweep that enumerated the live crons instead of reading the
 * inventory. This test is the mechanical version of that sweep, so the next one cannot rely on
 * somebody looking.
 */

const SEED = fs.readFileSync(
  path.join(__dirname, '..', '..', 'agentRegistrySeed.ts'), 'utf8',
);
const REESE_DIR = path.join(__dirname, '..');

/** Every Reese-module entry in the registry seed, with its enabled flag and source file. */
function seededReeseCrons(): Array<{ agent_name: string; enabled: boolean; source_file: string }> {
  const out: Array<{ agent_name: string; enabled: boolean; source_file: string }> = [];
  // Entries are object literals; slice between agent_name occurrences and read the fields we need.
  const re = /agent_name:\s*'(Reese[A-Za-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SEED)) !== null) {
    const chunk = SEED.slice(m.index, m.index + 2000);
    const src = /source_file:\s*'([^']+)'/.exec(chunk)?.[1] ?? '';
    const trigger = /trigger_type:\s*'([^']+)'/.exec(chunk)?.[1] ?? '';
    const enabled = !/enabled:\s*false/.test(chunk.split(/\n\s*\},/)[0] ?? '');
    if (trigger === 'cron') out.push({ agent_name: m[1], enabled, source_file: src });
  }
  return out;
}

/** Does this service file actually reach a student-messaging call? */
function canMessageAStudent(sourceFile: string): boolean {
  const base = path.basename(sourceFile);
  const p = path.join(REESE_DIR, base);
  if (!fs.existsSync(p)) return false;
  const src = fs.readFileSync(p, 'utf8');
  // Strip block and line comments FIRST. Without this the detector matches PROSE, and this test
  // caught its own false positive: reeseBehaviourMetadata.ts has a comment that legitimately
  // mentions initiateDm() while the file calls nothing. A detector that fires on documentation
  // would mark every file that merely discusses sending as a sender.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return /\binitiateDm\b|\bsendDmMessage\b/.test(code);
}

describe('the sweep itself works, so a clean result means something', () => {
  const crons = seededReeseCrons();

  it('finds Reese cron entries in the registry seed', () => {
    // A zero here would make every assertion below vacuously true.
    expect(crons.length).toBeGreaterThan(3);
  });

  it('finds the specific cron that was missing a switch', () => {
    expect(crons.map((c) => c.agent_name)).toContain('ReeseTicketFollowUpSweep');
  });

  it('the student-messaging detector distinguishes a sender from a non-sender', () => {
    // Positive and negative control on the detector itself.
    expect(canMessageAStudent('backend/src/services/reese/reeseTicketFollowUpService.ts')).toBe(true);
    expect(canMessageAStudent('backend/src/services/reese/reeseBehaviourMetadata.ts')).toBe(false);
  });
});

describe('every enabled Reese cron that can message a student has a manager kill switch', () => {
  const crons = seededReeseCrons();
  const senders = crons.filter((c) => c.enabled && canMessageAStudent(c.source_file));

  it('found at least one enabled student-messaging cron to check', () => {
    expect(senders.length).toBeGreaterThan(0);
  });

  it('each one maps to a behaviour key', () => {
    const unmapped = senders.filter((c) => !BEHAVIOUR_KEY_BY_CRON_AGENT_NAME[c.agent_name]);
    // Names them, so a failure says WHICH cron is ungoverned rather than just how many.
    expect(unmapped.map((c) => c.agent_name)).toEqual([]);
  });

  it('each key is WRITABLE, not merely displayed', () => {
    // A key that renders on the card and silently fails to write is worse than an absent one.
    const unwritable = senders
      .map((c) => BEHAVIOUR_KEY_BY_CRON_AGENT_NAME[c.agent_name])
      .filter((k) => k && !SIBLING_REGISTRY_NAME[k]);
    expect(unwritable).toEqual([]);
  });

  it('each key is accepted by the HTTP schema', () => {
    for (const c of senders) {
      const key = BEHAVIOUR_KEY_BY_CRON_AGENT_NAME[c.agent_name];
      expect(REESE_BEHAVIOUR_KEYS as ReadonlyArray<string>).toContain(key);
    }
  });

  it('ticket_follow_up specifically is covered end to end', () => {
    expect(BEHAVIOUR_KEY_BY_CRON_AGENT_NAME.ReeseTicketFollowUpSweep).toBe('ticket_follow_up');
    expect(SIBLING_REGISTRY_NAME.ticket_follow_up).toBe('ReeseTicketFollowUpSweep');
    expect(REESE_BEHAVIOUR_KEYS as ReadonlyArray<string>).toContain('ticket_follow_up');
    expect(CRON_REGISTRY_NAMES['Ticket follow-up']).toBe('ReeseTicketFollowUpSweep');
  });
});

describe('the four maps stay in sync, so a partial addition cannot pass', () => {
  it('every switch key has an inventory row', () => {
    const inventoryKeys = REESE_BEHAVIOURS.map((b) => BEHAVIOUR_KEY_BY_NAME[b.name]).filter(Boolean);
    for (const k of REESE_BEHAVIOUR_KEYS) expect(inventoryKeys).toContain(k);
  });

  it('every inventory row maps to a switch key', () => {
    for (const b of REESE_BEHAVIOURS) {
      expect(BEHAVIOUR_KEY_BY_NAME[b.name]).toBeTruthy();
    }
  });

  it('every switch key has a BEHAVIOUR_TOOLS entry, even if empty', () => {
    // `[]` is a real answer (the tool inventory has no entry yet). A MISSING key is not.
    for (const k of REESE_BEHAVIOUR_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(BEHAVIOUR_TOOLS, k)).toBe(true);
    }
  });

  it('there are now eight keys, and they are unique', () => {
    expect(REESE_BEHAVIOUR_KEYS).toHaveLength(8);
    expect(new Set(REESE_BEHAVIOUR_KEYS).size).toBe(8);
  });

  it('POSITIVE CONTROL: a fabricated ninth key is absent from every map', () => {
    // Proves the sync assertions above are reading the real maps.
    const ghost = 'ninth_behaviour_that_does_not_exist';
    expect(REESE_BEHAVIOUR_KEYS as ReadonlyArray<string>).not.toContain(ghost);
    expect(Object.prototype.hasOwnProperty.call(BEHAVIOUR_TOOLS, ghost)).toBe(false);
    expect((SIBLING_REGISTRY_NAME as Record<string, string>)[ghost]).toBeUndefined();
  });
});
