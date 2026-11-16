import { careerPrepEnabled, parseAllowList, resetCareerPrepFlagCache, FLAG_KEY } from '../careerPrepFlag';

const ALI = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const OTHER = '1950b213-5e4e-4cc1-b9cb-04fea1bbe4b0';
const reader = (value: unknown) => jest.fn(async (key: string) => (key === FLAG_KEY ? value : null));

beforeEach(() => {
  resetCareerPrepFlagCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('careerPrepEnabled', () => {
  it('is on for a listed enrollment and off for anyone else', async () => {
    const read = reader([ALI]);
    expect(await careerPrepEnabled(ALI, read, 1000)).toBe(true);
    expect(await careerPrepEnabled(OTHER, read, 1000)).toBe(false);
  });

  it('accepts the list stored as a JSON string', async () => {
    expect(await careerPrepEnabled(ALI, reader(JSON.stringify([ALI])), 1000)).toBe(true);
  });

  it('is off, silently, when the key was never set', async () => {
    expect(await careerPrepEnabled(ALI, reader(null), 1000)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('fails closed and logs a ValidationError on a malformed value', async () => {
    expect(await careerPrepEnabled(ALI, reader('{not json'), 1000)).toBe(false);
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"ValidationError"');
  });

  it('fails closed and logs UpstreamUnavailable when the read throws', async () => {
    const read = jest.fn(async () => { throw new Error('db down'); });
    expect(await careerPrepEnabled(ALI, read, 1000)).toBe(false);
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"UpstreamUnavailable"');
  });

  it('is off without an enrollment id', async () => {
    expect(await careerPrepEnabled(undefined, reader([ALI]), 1000)).toBe(false);
  });

  it('reads once per minute, then refreshes', async () => {
    const read = reader([ALI]);
    await careerPrepEnabled(ALI, read, 1000);
    await careerPrepEnabled(ALI, read, 50_000);
    expect(read).toHaveBeenCalledTimes(1);
    await careerPrepEnabled(ALI, read, 62_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('parseAllowList', () => {
  it.each([[[]], [['a', 'b']]])('accepts an array of ids %j', (v) => expect(parseAllowList(v)).not.toBeNull());
  it.each([[{}], [[1]], [['']], ['x'], [42]])('rejects %j', (v) => expect(parseAllowList(v)).toBeNull());
});
