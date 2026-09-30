import { blockerSentence, canCreate, missingToCreate } from '../composer/setupGate';

/**
 * The gate on "Create draft".
 *
 * The case that sent me here: a filled-in message, a blank internal title, and a grey button
 * that explained nothing. The button and the sentence must always agree - a grey button with no
 * sentence, or a sentence beside a live button, are both the original bug wearing a new face.
 */

const READY = { brand_id: 'b-1', title: 'Free AI class' };

describe('what is missing', () => {
  it('nothing, when a brand and a title are set', () => {
    expect(missingToCreate(READY)).toEqual([]);
    expect(blockerSentence(READY)).toBeNull();
    expect(canCreate(READY, false)).toBe(true);
  });

  it('a blank title is missing even though the message is written', () => {
    const v = { ...READY, title: '' };
    expect(missingToCreate(v)).toEqual(['add an internal title']);
    expect(blockerSentence(v)).toBe('To create the draft, add an internal title.');
  });

  it('whitespace is not a title', () => {
    expect(missingToCreate({ ...READY, title: '   ' })).toEqual(['add an internal title']);
  });

  it('no brand is missing too, and both read as one sentence', () => {
    const v = { brand_id: '', title: '' };
    expect(blockerSentence(v)).toBe('To create the draft, choose a brand and add an internal title.');
  });

  it('lists them in the order the fields appear, brand first', () => {
    expect(missingToCreate({ brand_id: '', title: '' })).toEqual(['choose a brand', 'add an internal title']);
  });
});

describe('the button and the sentence never disagree', () => {
  it('a sentence exists exactly when the button is dead for a fixable reason', () => {
    const cases = [
      { brand_id: '', title: '' },
      { brand_id: 'b-1', title: '' },
      { brand_id: '', title: 'x' },
      READY,
    ];
    for (const v of cases) {
      expect(blockerSentence(v) === null).toBe(canCreate(v, false));
    }
  });

  it('busy disables the button WITHOUT claiming something is missing', () => {
    // The spinner already says why. "Add a title" while saving would be a lie.
    expect(canCreate(READY, true)).toBe(false);
    expect(blockerSentence(READY)).toBeNull();
  });
});
