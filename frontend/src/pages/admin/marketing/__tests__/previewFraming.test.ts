import {
  parseRatio, sourceRatio, cropLoss, chooseFrame, shapeWord, cropNote, frameBox, acceptedRatios,
} from '../composer/previewFraming';

/**
 * The failure this guards is a CONFIDENT crop figure that is wrong.
 *
 * An operator who is told "about 55% of the width is cut" will reframe the shot. If that number
 * came from a guess - a file whose dimensions were never read, a provider with no ratios on
 * record - the composer has sent them to redo work for no reason, and it reads exactly like a
 * measured number. So several of these tests assert that nothing is claimed.
 */

const file = (width: number | null, height: number | null) => ({ width, height });

describe('reading a ratio label', () => {
  it('parses both forms the registry uses', () => {
    expect(parseRatio('1:1')).toBe(1);
    expect(parseRatio('4:5')).toBeCloseTo(0.8);
    expect(parseRatio('9:16')).toBeCloseTo(0.5625);
    expect(parseRatio('1.91:1')).toBeCloseTo(1.91);
  });

  it('returns null, never NaN, for anything malformed', () => {
    // NaN would lose every comparison it took part in and silently pick the wrong frame.
    for (const bad of ['', '16', '16:9:1', 'wide:tall', '0:1', '16:0', '-16:9']) {
      expect(parseRatio(bad)).toBeNull();
    }
  });
});

describe('a file whose shape is not known', () => {
  it('has no source ratio', () => {
    expect(sourceRatio(file(null, 1080))).toBeNull();
    expect(sourceRatio(file(1920, null))).toBeNull();
    expect(sourceRatio(file(0, 1080))).toBeNull();
  });

  it('gets no frame, so the caller shows it plainly instead of cropping it', () => {
    expect(chooseFrame(file(null, null), ['1:1', '4:5'])).toBeNull();
  });
});

describe('a network with nothing on record', () => {
  it('gets no frame rather than a default one', () => {
    expect(chooseFrame(file(1920, 1080), [])).toBeNull();
  });

  it('ignores unparseable entries but still uses the good ones', () => {
    const frame = chooseFrame(file(1000, 1000), ['nonsense', '1:1']);
    expect(frame?.label).toBe('1:1');
  });

  it('returns no ratios for a provider the UI has not received yet', () => {
    expect(acceptedRatios('image/jpeg', undefined)).toEqual([]);
    expect(acceptedRatios('image/jpeg', {})).toEqual([]);
  });

  it('reads the list that matches the file type', () => {
    const p = { imageRatios: ['1:1'], videoRatios: ['9:16'] };
    expect(acceptedRatios('video/mp4', p)).toEqual(['9:16']);
    expect(acceptedRatios('image/png', p)).toEqual(['1:1']);
    // A PDF has no frame on any network here; claiming one would invent a crop.
    expect(acceptedRatios('application/pdf', p)).toEqual([]);
  });
});

describe('choosing the frame the network will actually use', () => {
  it('picks the nearest shape, not the first one listed', () => {
    // Facebook lists 1.91:1 first, but a square upload is published square.
    const frame = chooseFrame(file(1080, 1080), ['1.91:1', '1:1', '4:5']);
    expect(frame?.label).toBe('1:1');
    expect(frame?.loss).toBeCloseTo(0);
  });

  it('puts a vertical video in the vertical frame', () => {
    const frame = chooseFrame(file(1080, 1920), ['16:9', '1:1', '4:5', '9:16']);
    expect(frame?.label).toBe('9:16');
  });

  it('does not bias toward wide shapes', () => {
    // On a linear scale 16:9 (1.778) sits 0.778 from square while 9:16 (0.5625) sits 0.4375,
    // so a naive nearest would call a 2:1 landscape closer to square than it is. Measured on a
    // log scale, a 1920x1080 landscape lands on 16:9.
    const frame = chooseFrame(file(1920, 1080), ['9:16', '1:1', '16:9']);
    expect(frame?.label).toBe('16:9');
  });
});

describe('how much the crop costs', () => {
  it('is symmetric - losing width and losing height cost the same', () => {
    expect(cropLoss(16 / 9, 1)).toBeCloseTo(cropLoss(9 / 16, 1));
  });

  it('is zero when the file already fits', () => {
    expect(cropLoss(0.8, 0.8)).toBe(0);
  });

  it('matches the real TikTok case - a landscape upload to a vertical-only network', () => {
    // TikTok's registry entry lists one video shape, 9:16. A 1920x1080 upload loses two
    // thirds of its width there, which is the single most expensive framing mistake the
    // composer can let through.
    expect(cropLoss(16 / 9, 0.5625)).toBeCloseTo(0.68, 2);
  });
});

describe('what the operator is told', () => {
  it('names the frame, the amount and which edges to check', () => {
    // TikTok takes video at 9:16 only, so a landscape upload loses its sides.
    const frame = chooseFrame(file(1920, 1080), ['9:16'])!;
    const note = cropNote(file(1920, 1080), frame, 'TikTok');
    expect(note).toContain('TikTok');
    expect(note).toContain('crops this to 9:16');
    expect(note).toContain('68% of the width');
    expect(note).toContain('sides');
  });

  it('does not invent a crop where the network has a frame that fits', () => {
    // The assumption worth killing early: that a landscape upload is always badly cropped on
    // Instagram. Its registry entry includes 1.91:1, so the honest answer is a 7% height trim,
    // and telling the operator to reshoot for 4:5 would be wrong.
    const frame = chooseFrame(file(1920, 1080), ['4:5', '1:1', '1.91:1'])!;
    expect(frame.label).toBe('1.91:1');
    expect(frame.loss).toBeLessThan(0.1);
  });

  it('says nothing when nothing is cut', () => {
    const exact = chooseFrame(file(1080, 1080), ['1:1'])!;
    expect(cropNote(file(1080, 1080), exact, 'Instagram')).toBeNull();
  });

  it('points at the top and bottom when it is height being lost', () => {
    const frame = chooseFrame(file(1080, 1920), ['1:1'])!;
    const note = cropNote(file(1080, 1920), frame, 'X');
    expect(note).toContain('% of the height');
    expect(note).toContain('top or bottom');
  });

  it('describes a shape in plain words', () => {
    expect(shapeWord(0.5625)).toBe('vertical');
    expect(shapeWord(1)).toBe('square');
    expect(shapeWord(1.778)).toBe('landscape');
  });
});

describe('the box the frame is drawn in', () => {
  it('fills the width when the shape is wide enough to allow it', () => {
    expect(frameBox(16 / 9, 520, 420)).toEqual({ width: 520, height: 293 });
  });

  it('never exceeds the height cap, and narrows instead of distorting', () => {
    // 9:16 at 520 wide would be 924 tall and push the rest of the preview off screen. This is
    // the bug that CSS `aspect-ratio` plus a max-height silently produces as a stretched box.
    const box = frameBox(0.5625, 520, 420);
    expect(box.height).toBe(420);
    expect(box.width).toBe(236);
    expect(box.width / box.height).toBeCloseTo(0.5625, 2);
  });

  it('keeps a square square', () => {
    expect(frameBox(1, 520, 420)).toEqual({ width: 420, height: 420 });
  });
});
