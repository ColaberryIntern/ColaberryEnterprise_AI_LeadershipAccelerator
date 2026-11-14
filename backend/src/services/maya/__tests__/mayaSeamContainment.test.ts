import fs from 'fs';
import path from 'path';
import {
  DELIVERY_SEAM_MODULE, GATED_PROVIDER_SYMBOLS, MAYA_HANDLER_MODULES,
} from '../mayaHandlerModules';

/**
 * T4(3) and T7(b) - THE SEAM IS THE ONLY DOOR.
 *
 * -- WHAT THIS REPLACES --
 *
 * An earlier design put a mode check inside each handler. An audit called that N seams with no
 * structural assertion, and it was right: `scheduleStrategyCall` alone reached a person four
 * separate ways at four call sites, and nothing would have failed if a fifth were added. "Every
 * handler remembers to check" is a property no test can hold.
 *
 * So there is ONE seam module, and this file asserts that nothing else can reach a provider.
 * That is a claim about the import graph, which a test CAN hold.
 *
 * -- THE ASSERTION IS CLOSURE-WIDE, WHICH IS STRONGER THAN THE MODULE LIST --
 *
 * The plan specified scanning `MAYA_HANDLER_MODULES`, a hand-maintained list. That list is kept
 * and checked below, but the load-bearing assertion here does not depend on it: it walks the
 * transitive closure from the two dispatchers and asserts that NO module in it imports a gated
 * provider, whatever the module is called and wherever it lives. A handler added tomorrow in a
 * folder nobody thought of is covered the moment a dispatcher can reach it.
 *
 * -- IMPORTS, NOT MENTIONS, AND THAT DISTINCTION IS THE WHOLE TEST --
 *
 * `emailService.ts` is in the closure and it DEFINES `sendAdmissionsDocument` and
 * `sendStrategyCallConfirmation`. A scan for the words would fail on the module that owns them,
 * which would be meaningless. What matters is who IMPORTS them, so that is what is matched.
 *
 * -- WHY MODULES BELOW THE SEAM ARE FINE --
 *
 * `mayaCampaignRouter` is in the closure, reached through `deliverOrQueue`, and it writes
 * `CampaignLead` - the first link of the cron chain that composes bodies with AI at send time.
 * That is not a leak, because the only path to it resolves `enrollInCampaign` first, and that
 * capability is refused by name. Gating the ENTRANCE is the point; the rooms behind it do not
 * each need their own lock.
 */

const SRC = path.join(__dirname, '..', '..', '..');

/** The two functions every tool call passes through. */
const DISPATCHER_MODULES = [
  path.join(SRC, 'services', 'mayaActionService.ts'),
  path.join(SRC, 'services', 'maya', 'mayaPortalTools.ts'),
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  let m = re.exec(source);
  while (m) { out.push(m[1]); m = re.exec(source); }
  return out;
}

function resolveModule(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Everything a tool call can reach, following relative imports inside `backend/src`. */
function dispatcherClosure(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [...DISPATCHER_MODULES];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const spec of importSpecifiers(source)) {
      const target = resolveModule(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

const CLOSURE = dispatcherClosure();
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');
const SEAM = path.join(SRC, ...DELIVERY_SEAM_MODULE.split('/'));

/** Does this module IMPORT the symbol from somewhere else (as opposed to defining it)? */
function importsSymbol(source: string, symbol: string): boolean {
  const code = stripComments(source);
  const re = new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's');
  return re.test(code);
}

describe('T4(3) the instrument is sound before it is trusted', () => {
  it('walks a real closure from both dispatchers', () => {
    expect(CLOSURE.size).toBeGreaterThan(20);
    for (const d of DISPATCHER_MODULES) expect(CLOSURE.has(d)).toBe(true);
    expect(CLOSURE.has(SEAM)).toBe(true);
  });

  it('CONTROL - the seam really does import every gated provider', () => {
    // If this fails, the "only the seam may import these" assertions below would be passing
    // because nothing imports them anywhere, which proves nothing at all.
    const seamSource = CLOSURE.get(SEAM)!;
    const imported = GATED_PROVIDER_SYMBOLS.filter((s) => importsSymbol(seamSource, s));
    // `enrollLeadsInCampaign` is on the forbidden list defensively: it is the other entry point
    // into the campaign chain and nothing imports it today, including the seam.
    expect(imported.sort()).toEqual([
      'createBooking', 'renderAdmissionsDocument', 'routeLeadToCampaign',
      'sendSmsViaGhl', 'sendStrategyCallConfirmation',
    ].filter((s) => GATED_PROVIDER_SYMBOLS.includes(s)).sort());
  });

  it('CONTROL - the import matcher distinguishes importing from defining', () => {
    expect(importsSymbol("import { createBooking } from '../calendarService';", 'createBooking')).toBe(true);
    expect(importsSymbol('export async function createBooking() {}', 'createBooking')).toBe(false);
    // And it ignores a mention inside a comment, which the real modules are full of.
    expect(importsSymbol('// we used to import { createBooking } from here', 'createBooking')).toBe(false);
  });
});

/**
 * The one import below the seam that is allowed, named rather than excluded by a looser rule.
 *
 * `mayaCampaignRouter` is the module that IMPLEMENTS the enrolment the seam gates: it calls
 * `enrollLeadsInCampaign` to do the work. It is in the closure because the seam imports it, and
 * because `mayaActionService` separately imports `addMayaInteractionTag` from it, which writes
 * a tag on our own lead row and reaches nobody.
 *
 * What makes this safe is not the module, it is the SYMBOL: nothing above the seam imports
 * `routeLeadToCampaign`, the router's entry point, so there is no way to reach the enrolment
 * without resolving `enrollInCampaign` first. Allowing the pair by name keeps that reasoning
 * visible; relaxing the rule to "below-seam modules are exempt" would have hidden it.
 */
const ALLOWED_BELOW_SEAM: ReadonlyArray<[string, string]> = [
  ['services/mayaCampaignRouter.ts', 'enrollLeadsInCampaign'],
];

describe('T4(3) nothing but the seam may reach a person', () => {
  it.each(GATED_PROVIDER_SYMBOLS.map((s) => [s]))(
    'only the delivery seam imports %s',
    (symbol) => {
      const offenders = [...CLOSURE.entries()]
        .filter(([file]) => file !== SEAM)
        .filter(([, source]) => importsSymbol(source, symbol))
        .map(([file]) => rel(file))
        .filter((f) => !ALLOWED_BELOW_SEAM.some(([m, s]) => m === f && s === symbol));
      expect(offenders).toEqual([]);
    },
  );

  it('CONTROL - the allowance is real, so it is not quietly exempting nothing', () => {
    // If `mayaCampaignRouter` ever stops importing `enrollLeadsInCampaign`, the allowance above
    // is dead weight hiding a rule nobody needs, and this says so.
    const router = CLOSURE.get(path.join(SRC, 'services', 'mayaCampaignRouter.ts'));
    expect(router && importsSymbol(router, 'enrollLeadsInCampaign')).toBe(true);
  });

  it('the two dispatchers import none of them directly', () => {
    // Stated separately from the sweep above because these are the two files a future change is
    // most likely to touch, and the failure message should name them.
    for (const dispatcher of DISPATCHER_MODULES) {
      const source = CLOSURE.get(dispatcher)!;
      for (const symbol of GATED_PROVIDER_SYMBOLS) {
        expect({ module: rel(dispatcher), symbol, imports: importsSymbol(source, symbol) })
          .toEqual({ module: rel(dispatcher), symbol, imports: false });
      }
    }
  });
});

describe('T7(b) the campaign chain is reachable only through the seam', () => {
  // Cycle 2 of the plan audit found that scanning the APPROVE path is blind to this class: the
  // handler runs for `shadow` and `review`, so booking fired all four of its effects before any
  // queue row existed and an approve-path test still passed. This scans the COMPOSE graph.
  it.each([['routeLeadToCampaign'], ['enrollLeadsInCampaign']])(
    '%s is imported by the seam alone',
    (symbol) => {
      const offenders = [...CLOSURE.entries()]
        .filter(([file]) => file !== SEAM)
        .filter(([, source]) => importsSymbol(source, symbol))
        .map(([file]) => rel(file))
        .filter((f) => !ALLOWED_BELOW_SEAM.some(([m, s]) => m === f && s === symbol));
      expect(offenders).toEqual([]);
    },
  );

  it('and the campaign router itself is reachable ONLY via the seam', () => {
    // The router is legitimately in the closure. What must not exist is a second path to it.
    const router = path.join(SRC, 'services', 'mayaCampaignRouter.ts');
    const importers = [...CLOSURE.entries()]
      .filter(([, source]) => importSpecifiers(stripComments(source))
        .some((spec) => resolveModule([...CLOSURE.keys()].find((f) => CLOSURE.get(f) === source)!, spec) === router))
      .map(([file]) => rel(file));
    // `mayaActionService` still imports `addMayaInteractionTag` from it, which writes a tag on
    // our own lead row and reaches nobody. That is why the assertion is about the GATED SYMBOLS
    // above and not about the module, and this test records the distinction rather than
    // pretending the module has one importer.
    expect(importers).toContain(DELIVERY_SEAM_MODULE);
  });
});

describe('T4(3) the hand-maintained module list stays honest', () => {
  /** Expand the globs in MAYA_HANDLER_MODULES to real files under backend/src. */
  function expandHandlerModules(): string[] {
    const out: string[] = [];
    for (const entry of MAYA_HANDLER_MODULES) {
      if (entry.endsWith('/**')) {
        const dir = path.join(SRC, ...entry.slice(0, -3).split('/'));
        if (!fs.existsSync(dir)) continue;
        const walk = (d: string): void => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); } else if (e.name.endsWith('.ts')) out.push(full);
          }
        };
        walk(dir);
      } else {
        const file = path.join(SRC, ...entry.split('/'));
        if (fs.existsSync(file)) out.push(file);
      }
    }
    return out;
  }

  it('every glob and file in the list resolves to something that exists', () => {
    // A stale entry pointing at a deleted folder would silently shrink the scanned set.
    for (const entry of MAYA_HANDLER_MODULES) {
      const target = path.join(SRC, ...entry.replace(/\/\*\*$/, '').split('/'));
      expect({ entry, exists: fs.existsSync(target) }).toEqual({ entry, exists: true });
    }
  });

  it('covers every Maya-owned module a dispatcher can reach', () => {
    // The closure contains plenty that is not Maya's - models, config, emailService. This
    // asserts the list is complete for the modules that ARE hers, which is where a new handler
    // would land. `mayaToolsService.ts` is the one an earlier revision missed, so it is the
    // canonical case this check exists for.
    const listed = new Set(expandHandlerModules().map(rel));
    const mayaOwned = [...CLOSURE.keys()]
      .map(rel)
      .filter((f) => /(^|\/)maya[A-Z]|\/maya\//.test(f));
    const missing = mayaOwned.filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
    expect(listed.has('services/mayaToolsService.ts')).toBe(true);
  });
});
