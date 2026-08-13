/**
 * deriveLegacyScope — the interview is generated, but `users`, `data_sources`
 * and `done_definition` are still read by the local fallback plan and named in
 * FR-003's acceptance, so they must not silently go empty.
 */
import { deriveLegacyScope } from '../deriveLegacyScope';

const a = (id: string, question: string, answer: string) => ({ id, question, answer });

describe('deriveLegacyScope', () => {
  it('returns nothing when there is nothing to derive from', () => {
    expect(deriveLegacyScope(undefined)).toEqual({});
    expect(deriveLegacyScope([])).toEqual({});
  });

  it('ignores questions the student left blank', () => {
    expect(deriveLegacyScope([a('1', 'Who uses it?', '   ')])).toEqual({});
  });

  it('maps a generated interview onto all three legacy fields', () => {
    const scope = deriveLegacyScope([
      a('1', 'Who on the warehouse floor will be using this?', 'Forklift operators on the night shift'),
      a('2', 'Which systems hold the pallet data today?', 'The WMS and a Zebra scanner feed'),
      a('3', 'What must it never do without a human check?', 'Never re-route a pallet on its own'),
    ]);
    expect(scope.users).toBe('Forklift operators on the night shift');
    expect(scope.dataSources).toBe('The WMS and a Zebra scanner feed');
    expect(scope.done).toBe('Never re-route a pallet on its own');
  });

  it('never lets one question fill every field', () => {
    // This question matches the keywords for all three fields at once.
    const scope = deriveLegacyScope([
      a('1', 'Who uses the data system, and what must it never do?', 'Ops leads'),
      a('2', 'Anything else?', 'Runs nightly'),
    ]);
    const claimed = [scope.users, scope.dataSources, scope.done].filter((v) => v === 'Ops leads');
    expect(claimed).toHaveLength(1);
    expect(scope.dataSources || scope.done).toBe('Runs nightly');
  });

  it('falls back to the student\'s own words when no question matches a field', () => {
    const scope = deriveLegacyScope([
      a('1', 'What should happen first?', 'Scan the pallet'),
      a('2', 'And then?', 'Weigh it'),
      a('3', 'Anything else?', 'Print a label'),
    ]);
    // Nothing matched by keyword, so the three answers are borrowed in order
    // rather than sending three empty fields to the generator.
    expect(scope.users).toBe('Scan the pallet');
    expect(scope.dataSources).toBe('Weigh it');
    expect(scope.done).toBe('Print a label');
  });

  it('leaves a field undefined rather than inventing one when answers run out', () => {
    const scope = deriveLegacyScope([a('1', 'What should happen first?', 'Scan the pallet')]);
    expect(scope.users).toBe('Scan the pallet');
    expect(scope.dataSources).toBeUndefined();
    expect(scope.done).toBeUndefined();
  });
});
