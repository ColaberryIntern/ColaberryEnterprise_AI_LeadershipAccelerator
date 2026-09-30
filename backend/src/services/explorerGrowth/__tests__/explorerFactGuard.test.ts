import {
  findUngroundedFacts,
  explorerFactIssues,
  EMPTY_FACT_SET,
  type ExplorerFactSet,
} from '../explorerFactGuard';

/**
 * Plan §11.4 point 3: reject GENERATED copy stating a date or price that is not
 * in the resolved context.
 *
 * The property is not "no dates" — it is "no dates we did not resolve". A
 * grounded date is the whole point of resolving one, so the tests come in
 * pairs: the same sentence passes when the fact was resolved and fails when it
 * was invented.
 */

const FACTS: ExplorerFactSet = {
  dates: ['November 3', 'Nov 3', '2026-11-03'],
  prices: ['$149'],
  seats: ['4 seats'],
};

describe('grounded facts pass', () => {
  it('allows a date that was resolved', () => {
    expect(findUngroundedFacts('Your cohort starts November 3.', FACTS)).toEqual([]);
  });

  it('allows any surface form the resolver supplied', () => {
    expect(findUngroundedFacts('Starts Nov 3, i.e. 2026-11-03.', FACTS)).toEqual([]);
  });

  it('tolerates an ordinal suffix the resolver did not spell out', () => {
    // "November 3rd" is the same fact as "November 3"; a guard that rejects it
    // would train people to disable the guard.
    expect(findUngroundedFacts('Starts November 3rd.', FACTS)).toEqual([]);
  });

  it('allows a resolved price', () => {
    expect(findUngroundedFacts('It is $149 per month.', FACTS)).toEqual([]);
  });

  it('allows a resolved seat count', () => {
    expect(findUngroundedFacts('There are 4 seats left.', FACTS)).toEqual([]);
  });

  it('passes copy that states no facts at all', () => {
    expect(findUngroundedFacts('A quick question about your goals.', FACTS)).toEqual([]);
  });
});

describe('invented facts are rejected', () => {
  it('rejects a date that was never resolved', () => {
    const found = findUngroundedFacts('Your cohort starts November 10.', FACTS);
    expect(found).toEqual([{ kind: 'date', text: 'November 10' }]);
  });

  it('rejects a price that was never resolved', () => {
    // The most confident hallucination a fluent generator produces.
    expect(findUngroundedFacts('Only $99 per month!', FACTS)[0]).toMatchObject({ kind: 'price' });
  });

  it('rejects a seat count that was never resolved', () => {
    expect(findUngroundedFacts('Just 2 spots remaining.', FACTS)[0]).toMatchObject({
      kind: 'seat count',
    });
  });

  it('reports each distinct invention once, not once per occurrence', () => {
    const found = findUngroundedFacts('April 14. Again April 14. And April 14.', FACTS);
    expect(found).toHaveLength(1);
  });

  it('reports several inventions together', () => {
    const found = findUngroundedFacts('Starts April 14 and costs $99.', FACTS);
    expect(found.map((f) => f.kind).sort()).toEqual(['date', 'price']);
  });

  it('names the offending text in the issue string', () => {
    // "contains an ungrounded date" would send a debugger back to diff copy by hand.
    expect(explorerFactIssues('Starts April 14.', FACTS)[0]).toContain('April 14');
  });
});

describe('it fails CLOSED when nothing was resolved', () => {
  it('rejects every date when the fact set is empty', () => {
    expect(findUngroundedFacts('Starts November 3.', EMPTY_FACT_SET)).toHaveLength(1);
  });

  it('rejects every date when no fact set is supplied at all', () => {
    // "We resolved nothing" must never read as "anything goes". The opposite
    // posture is what made resolveContentPageAccess mark 153 Explorers
    // CONVERTED by failing open.
    expect(findUngroundedFacts('Starts November 3.')).toHaveLength(1);
  });

  it('still passes copy that states no facts', () => {
    expect(findUngroundedFacts('Hope the build went well.', EMPTY_FACT_SET)).toEqual([]);
  });
});

describe('scanning is order-independent', () => {
  it('gives the same answer when called repeatedly', () => {
    // The /g regexes carry lastIndex; sharing them across calls makes the guard
    // pass or fail depending on call order.
    const once = findUngroundedFacts('Starts April 14.', FACTS);
    const twice = findUngroundedFacts('Starts April 14.', FACTS);
    const thrice = findUngroundedFacts('Starts April 14.', FACTS);
    expect(once).toEqual(twice);
    expect(twice).toEqual(thrice);
  });
});

describe('date formats it must not miss', () => {
  it.each(['4/14', '4/14/2026', '2026-04-14', 'April 14', '14 April', 'Apr 14'])(
    'catches %s',
    (written) => {
      expect(findUngroundedFacts(`Starts ${written}.`, FACTS)).toHaveLength(1);
    },
  );
});
