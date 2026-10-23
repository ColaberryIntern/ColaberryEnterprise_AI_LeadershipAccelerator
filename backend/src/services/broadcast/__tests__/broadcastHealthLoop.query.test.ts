import fs from 'fs';
import path from 'path';
import { stripComments } from './broadcastHealthLoop.wiring.test';

/**
 * The loop's SQL must select every field the runner's contract declares.
 *
 * WHY A SOURCE-READING TEST AND NOT A TYPE. `loadObservableOccurrences` ends in
 * `return rows as ObservableOccurrence[]`, and a cast is a promise the compiler accepts
 * without checking. Drop a column from the SELECT and nothing fails to build: the field is
 * simply `undefined` at runtime.
 *
 * That is not theoretical. `version` was added to the contract for L7.4 precisely so the
 * auto-end can issue a version-guarded producer command. If the SELECT ever loses it,
 * `expectedVersion` becomes `undefined`, every auto-end is refused with a version conflict,
 * and the only symptom is that broadcasts quietly stop ending themselves — in production,
 * months later, with a green suite the whole time. This subsystem has already shipped three
 * units that nothing called; this is the same class of gap one layer down.
 *
 * The field list is PARSED FROM THE INTERFACE rather than retyped here, so adding a field to
 * the contract and forgetting the query fails this test rather than drifting past it.
 */

const RUNNER = path.resolve(__dirname, '../broadcastHealthRunner.ts');
const LOOP = path.resolve(__dirname, '../broadcastHealthLoop.ts');

const read = (p: string): string => stripComments(fs.readFileSync(p, 'utf8'));

/** The field names declared on ObservableOccurrence. */
function contractFields(): string[] {
  const src = read(RUNNER);
  const start = src.indexOf('export interface ObservableOccurrence');
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('}', start));
  return Array.from(body.matchAll(/^\s*(\w+)\??:/gm)).map((m) => m[1]);
}

/** The columns the loop's SELECT actually asks for. */
function selectedColumns(): string[] {
  const src = read(LOOP);
  const m = src.match(/SELECT\s+([\s\S]*?)\s+FROM broadcast_occurrences/);
  expect(m).not.toBeNull();
  return m![1].split(',').map((c) => c.trim());
}

describe('the observable query and the runner contract agree', () => {
  it('parses a real field list, so the comparison is not vacuous', () => {
    // The control: if the parser returned nothing, every assertion below would pass.
    const fields = contractFields();
    expect(fields.length).toBeGreaterThanOrEqual(4);
    expect(fields).toContain('id');
  });

  it('selects every field the contract declares', () => {
    const selected = selectedColumns();
    contractFields().forEach((field) => {
      expect(selected).toContain(field);
    });
  });

  it('selects version, which the auto-end needs to issue a guarded command', () => {
    // Named on its own because this is the one whose absence is silent: undefined would be
    // passed as expectedVersion and every auto-end would be refused as a conflict.
    expect(contractFields()).toContain('version');
    expect(selectedColumns()).toContain('version');
  });

  it('CONTROL: a column that is not selected is reported as missing', () => {
    expect(selectedColumns()).not.toContain('access_mode');
  });
});
