import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * CH4.1 acceptance "EXIF absent after upload (test reads metadata)", end to end through the REAL media
 * pipeline: sharp builds a JPEG carrying EXIF, ingestFileBytes stores it in a temp MEDIA_ROOT, and the
 * stored bytes are read back and inspected. No mocks between the upload and the disk.
 */
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-media-'));
process.env.MEDIA_ROOT = ROOT;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { ingestFileBytes } from '../../media/mediaAssetService';
import { sniffImage } from '../eventPhotos';

const BRAND = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';

afterAll(() => { fs.rmSync(ROOT, { recursive: true, force: true }); });

describe('CH4.1 uploaded pictures lose their EXIF', () => {
  it('a JPEG with EXIF is stored without it, and still decodes as a JPEG of the same size', async () => {
    const withExif: Buffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 30, b: 40 } } })
      .jpeg().withExif({ IFD0: { Copyright: 'owner-name', Artist: 'gps-bearing camera' } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined(); // control: the input really carries EXIF
    expect(sniffImage(withExif)).toBe('image/jpeg');

    const stored = await ingestFileBytes(BRAND, withExif, 'image/jpeg');
    expect(stored.exifStripped).toBe(true);
    const onDisk = fs.readFileSync(path.join(ROOT, stored.storageKey.replace(/^media\//, '')));
    const meta = await sharp(onDisk).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 30]);
    expect(onDisk.toString('latin1')).not.toContain('owner-name');
  });

  it('the same bytes twice land on the same key (content-addressed, stored once)', async () => {
    const png: Buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
    const a = await ingestFileBytes(BRAND, png, 'image/png');
    const b = await ingestFileBytes(BRAND, png, 'image/png');
    expect(a.storageKey).toBe(b.storageKey);
  });
});
