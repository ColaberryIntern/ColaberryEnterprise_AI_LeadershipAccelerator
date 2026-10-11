/**
 * P4-T5a — the three surface states, the keyboard surface, and a label contrast rule that is
 * CHECKED rather than advised.
 *
 * ## The allow-list is DERIVED from the token file, not trusted
 *
 * Amendment 2: the value space must be derived from the thing under test. `AA_LABEL_PAIRS` is a
 * value the backend ships, because reading a frontend stylesheet at runtime would be the wrong
 * coupling. So the derivation lives HERE: this suite parses `frontend/src/styles/tokens.css`,
 * computes WCAG 2.1 contrast itself, and asserts the shipped list against what it measures. If
 * someone changes a token value, this fails by name rather than the list quietly becoming a lie.
 *
 * The derivation carries its own positive control, for the reason the whole run keeps relearning:
 * a measurement apparatus that cannot be shown to work is not evidence. Black-on-white must come
 * out at 21.00 and white-on-white at 1.00.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AA_LABEL_PAIRS,
  STATE_CODES,
  WORKSPACE_STATES,
  validateWorkspaceStates,
  type StatusLabelTokens,
  type WorkspaceStateDeclaration,
} from '../workspaceStateChecks';
import type { TaskSurfaceBinding, WorkspaceRef } from '../workspaceBindingTypes';

// ───────────────────────────────── the derivation

const TOKENS = join(__dirname, '../../../../../../frontend/src/styles/tokens.css');

function tokenValues(): Record<string, string> {
  const css = readFileSync(TOKENS, 'utf8');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('THE DERIVATION: the shipped allow-list matches the real token file', () => {
  it('POSITIVE CONTROL: the contrast function returns 21 for black-on-white and 1 for white-on-white', () => {
    // Without this, every ratio below could be produced by an arithmetic error that happens to
    // agree with the shipped list.
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });

  it('parses a realistic number of tokens, so a broken regex cannot pass as a clean result', () => {
    expect(Object.keys(tokenValues()).length).toBeGreaterThan(20);
  });

  it.each(AA_LABEL_PAIRS.map((p) => [`${p.textToken} on ${p.bgToken}`, p] as const))(
    'every shipped pair really measures at or above AA 4.5:1 — %s', (_n, pair) => {
      const v = tokenValues();
      expect(v[pair.textToken]).toBeDefined();
      expect(v[pair.bgToken]).toBeDefined();
      expect(ratio(v[pair.textToken], v[pair.bgToken])).toBeGreaterThanOrEqual(4.5);
    });

  it.each([
    ['--status-partial-text', '--status-partial-bg'],
    ['--status-verified-text', '--status-verified-bg'],
    ['--color-primary', '--color-bg'],
    ['--color-muted', '--color-bg'],
  ] as const)('POSITIVE CONTROL: %s on %s measures BELOW AA and is absent from the list', (textToken, bgToken) => {
    // The control that makes the list mean something. Two of these are in the repo's own
    // four-state status family, which is exactly why a reviewer would reach for them.
    const v = tokenValues();
    expect(ratio(v[textToken], v[bgToken])).toBeLessThan(4.5);
    expect(AA_LABEL_PAIRS.some((p) => p.textToken === textToken && p.bgToken === bgToken)).toBe(false);
  });
});

// ───────────────────────────────── fixtures

const ROLE = 'role-counsel';

const ref = (over: Partial<WorkspaceRef> = {}): WorkspaceRef => ({
  workspaceId: 'ws-review',
  workspaceTitle: 'Contract review',
  action: 'record the decision',
  primaryJob: 'decide whether a contract needs a solicitor',
  intendedRoles: [ROLE],
  records: ['contract'],
  decisions: ['approve', 'reject'],
  whyNotExisting: 'no existing workspace shows the contract next to the threshold rule',
  requirementIds: [],
  taskIds: ['t-review'],
  audience: 'internal',
  permissionViews: [{ roleId: ROLE, visibleActions: [] }],
  deepLink: '/contracts/:id/review',
  preservesNavigationState: true,
  ...over,
});

const ws = (taskId: string, over: Partial<WorkspaceRef> = {}): TaskSurfaceBinding =>
  ({ taskId, kind: 'workspace', ref: ref({ taskIds: [taskId], ...over }) });

const OK_PAIR: StatusLabelTokens = AA_LABEL_PAIRS[0];

const decl = (over: Partial<WorkspaceStateDeclaration> = {}): WorkspaceStateDeclaration => ({
  workspaceId: 'ws-review',
  states: WORKSPACE_STATES.map((state) => ({
    state,
    label: `Contract review — ${state}`,
    tokens: OK_PAIR,
  })),
  keyboardReachableActions: ['record the decision'],
  ...over,
});

const BINDINGS: TaskSurfaceBinding[] = [ws('t-review')];
const codes = (issues: ReadonlyArray<{ code: string }>) => issues.map((i) => i.code);

describe('the passing counterpart, first, so every refusal below means something', () => {
  it('three states, labelled, AA tokens, and the keyboard list matching exactly', () => {
    expect(validateWorkspaceStates(BINDINGS, [decl()])).toEqual([]);
  });
});

describe('PER-STATE CONTROL: each of the three is individually required', () => {
  it.each(WORKSPACE_STATES.map((s) => [s] as const))('omitting %s refuses, naming that state', (state) => {
    const d = decl({ states: decl().states.filter((s) => s.state !== state) });
    const issues = validateWorkspaceStates(BINDINGS, [d]);
    expect(codes(issues)).toEqual(['STATE_MISSING']);
    expect(issues[0].message).toContain(`'${state}'`);
  });
});

describe('a state must be readable, not merely coloured', () => {
  it.each(WORKSPACE_STATES.map((s) => [s] as const))('a blank label on %s is refused', (state) => {
    const d = decl({ states: decl().states.map((s) => (s.state === state ? { ...s, label: '   ' } : s)) });
    expect(codes(validateWorkspaceStates(BINDINGS, [d]))).toEqual(['STATE_LABEL_BLANK']);
  });

  it('a label pair below AA is refused, and the pair used is a REAL one from this repo', () => {
    // `--status-partial-*` is one of the four pairs in the repo's own status family, measured at
    // 3.61:1. A reviewer would reach for it precisely because it already exists.
    const bad: StatusLabelTokens = { textToken: '--status-partial-text', bgToken: '--status-partial-bg' };
    const d = decl({ states: decl().states.map((s) => (s.state === 'error' ? { ...s, tokens: bad } : s)) });
    const issues = validateWorkspaceStates(BINDINGS, [d]);
    expect(codes(issues)).toEqual(['STATE_LABEL_CONTRAST_UNSAFE']);
    expect(issues[0].message).toContain('--status-partial-text');
  });

  it('OPERAND: absent tokens are refused rather than dereferenced', () => {
    const d = decl({ states: decl().states.map((s) => ({ ...s, tokens: undefined as never })) });
    expect(() => validateWorkspaceStates(BINDINGS, [d])).not.toThrow();
    expect(codes(validateWorkspaceStates(BINDINGS, [d]))).toEqual([
      'STATE_LABEL_CONTRAST_UNSAFE', 'STATE_LABEL_CONTRAST_UNSAFE', 'STATE_LABEL_CONTRAST_UNSAFE',
    ]);
  });

  it('a caller may supply its own re-measured allow-list', () => {
    // The parameter exists so a token change does not require editing the shipped default to
    // re-check a contract, and so this test can prove the check reads the argument.
    const mine: StatusLabelTokens[] = [{ textToken: '--x-text', bgToken: '--x-bg' }];
    const d = decl({ states: decl().states.map((s) => ({ ...s, tokens: mine[0] })) });
    expect(validateWorkspaceStates(BINDINGS, [d], mine)).toEqual([]);
    expect(codes(validateWorkspaceStates(BINDINGS, [d]))).toContain('STATE_LABEL_CONTRAST_UNSAFE');
  });
});

describe('the keyboard surface is checked BOTH ways', () => {
  it('an action with no keyboard path is refused, naming the action', () => {
    const d = decl({ keyboardReachableActions: [] });
    const issues = validateWorkspaceStates(BINDINGS, [d]);
    expect(codes(issues)).toEqual(['ACTION_NOT_KEYBOARD_REACHABLE']);
    expect(issues[0].message).toContain("'record the decision'");
  });

  it('a padded list is refused too, so the check cannot be satisfied by adding names', () => {
    const d = decl({ keyboardReachableActions: ['record the decision', 'launch the missiles'] });
    const issues = validateWorkspaceStates(BINDINGS, [d]);
    expect(codes(issues)).toEqual(['KEYBOARD_ACTION_UNDECLARED']);
    expect(issues[0].message).toContain("'launch the missiles'");
  });

  it('two tasks on one workspace need both their actions reachable', () => {
    const bindings = [ws('t-intake', { action: 'log the contract' }), ws('t-review')];
    const partial = decl({ keyboardReachableActions: ['record the decision'] });
    expect(codes(validateWorkspaceStates(bindings, [partial]))).toEqual(['ACTION_NOT_KEYBOARD_REACHABLE']);
    const full = decl({ keyboardReachableActions: ['record the decision', 'log the contract'] });
    expect(validateWorkspaceStates(bindings, [full])).toEqual([]);
  });
});

describe('the declaration set must correspond to the bound workspaces', () => {
  it('a bound workspace with no declaration is refused', () => {
    expect(codes(validateWorkspaceStates(BINDINGS, []))).toEqual(['STATE_WORKSPACE_UNDECLARED']);
  });

  it('a declaration for a workspace no binding references is refused', () => {
    const issues = validateWorkspaceStates(BINDINGS, [decl(), decl({ workspaceId: 'ws-ghost' })]);
    expect(codes(issues)).toEqual(['STATE_WORKSPACE_UNKNOWN']);
  });

  it('two declarations for one workspace are refused, because the later would silently win', () => {
    expect(codes(validateWorkspaceStates(BINDINGS, [decl(), decl()]))).toEqual(['STATE_DECLARATION_DUPLICATE']);
  });

  it('the same state declared twice is refused', () => {
    const d = decl({ states: [...decl().states, { state: 'error', label: 'again', tokens: OK_PAIR }] });
    expect(codes(validateWorkspaceStates(BINDINGS, [d]))).toEqual(['STATE_DUPLICATE']);
  });

  it('a state name outside the three is refused rather than ignored', () => {
    const d = decl({ states: [...decl().states, { state: 'offline' as never, label: 'x', tokens: OK_PAIR }] });
    expect(codes(validateWorkspaceStates(BINDINGS, [d]))).toEqual(['STATE_DECLARATION_MALFORMED']);
  });
});

describe('malformed arguments fail CLOSED, never as "nothing to check"', () => {
  it.each([
    ['bindings null', null, [decl()]],
    ['declarations null', BINDINGS, null],
    ['bindings a string', 'ws-review', [decl()]],
    ['declarations an object', BINDINGS, { workspaceId: 'ws-review' }],
  ] as const)('%s refuses', (_n, b, d) => {
    const issues = validateWorkspaceStates(b as never, d as never);
    expect(codes(issues)).toEqual(['STATE_DECLARATION_MALFORMED']);
  });

  it('a declaration whose workspaceId is not a string is refused without throwing', () => {
    const issues = validateWorkspaceStates(BINDINGS, [{ workspaceId: 7 } as never]);
    expect(codes(issues)).toContain('STATE_DECLARATION_MALFORMED');
  });

  it('PASSING COUNTERPART: two real arrays are validated rather than refused', () => {
    expect(validateWorkspaceStates(BINDINGS, [decl()])).toEqual([]);
  });
});

describe('every declared code is reachable', () => {
  // Amendment 2, per code rather than aggregate: the table IS the coverage claim and the last
  // assertion checks it against STATE_CODES, naming anything it misses.
  const CASES: ReadonlyArray<readonly [string, () => ReadonlyArray<{ code: string }>]> = [
    ['STATE_DECLARATION_MALFORMED', () => validateWorkspaceStates(null as never, [])],
    ['STATE_WORKSPACE_UNDECLARED', () => validateWorkspaceStates(BINDINGS, [])],
    ['STATE_WORKSPACE_UNKNOWN', () => validateWorkspaceStates(BINDINGS, [decl(), decl({ workspaceId: 'ws-ghost' })])],
    ['STATE_DECLARATION_DUPLICATE', () => validateWorkspaceStates(BINDINGS, [decl(), decl()])],
    ['STATE_MISSING', () => validateWorkspaceStates(BINDINGS, [decl({ states: [] })])],
    ['STATE_DUPLICATE', () => validateWorkspaceStates(BINDINGS, [decl({
      states: [...decl().states, { state: 'empty', label: 'again', tokens: OK_PAIR }],
    })])],
    ['STATE_LABEL_BLANK', () => validateWorkspaceStates(BINDINGS, [decl({
      states: decl().states.map((s) => ({ ...s, label: '' })),
    })])],
    ['STATE_LABEL_CONTRAST_UNSAFE', () => validateWorkspaceStates(BINDINGS, [decl({
      states: decl().states.map((s) => ({ ...s, tokens: { textToken: '--color-muted', bgToken: '--color-bg' } })),
    })])],
    ['ACTION_NOT_KEYBOARD_REACHABLE', () => validateWorkspaceStates(BINDINGS, [decl({ keyboardReachableActions: [] })])],
    ['KEYBOARD_ACTION_UNDECLARED', () => validateWorkspaceStates(BINDINGS, [decl({
      keyboardReachableActions: ['record the decision', 'extra'],
    })])],
  ];

  it.each(CASES.map(([c, f]) => [c, f] as const))('%s fires', (code, build) => {
    expect(codes(build())).toContain(code);
  });

  it('the table covers STATE_CODES, and names anything it misses', () => {
    const covered = new Set(CASES.map(([c]) => c));
    expect(STATE_CODES.filter((c) => !covered.has(c))).toEqual([]);
  });
});
