/**
 * artifactRepoSync — the parts that can be tested without a database or GitHub.
 *
 * `readArtifactText` takes an injectable reader and `toArtifactRecords` is pure,
 * so the two decisions that actually matter — what gets committed as text, and
 * what a missing file does to the sync — are testable from literals.
 *
 * The failure behaviour is the point of most of these. This runs inside a
 * student's upload request, so every branch here has to end in a returned
 * outcome rather than a thrown error.
 */
import { StoredArtifact, readArtifactText, toArtifactRecords } from '../artifactRepoSync';

const stored = (over: Partial<StoredArtifact> = {}): StoredArtifact => ({
  card_id: 'card-1',
  title: 'Build — Governance',
  content: {
    filename: 'governance.md',
    stored_path: '/app/uploads/abc.md',
    size_bytes: 1024,
    uploaded_at: '2026-08-20T10:00:00.000Z',
    week: 10,
  },
  ...over,
});

describe('readArtifactText', () => {
  const reader = (out: string) => jest.fn().mockResolvedValue(out);

  it('reads a text artifact', async () => {
    const read = reader('# Governance\n');
    await expect(readArtifactText('governance.md', '/p/abc.md', 1024, read)).resolves.toBe('# Governance\n');
    expect(read).toHaveBeenCalledWith('/p/abc.md', 'utf8');
  });

  it('returns null for a binary artifact without touching disk', async () => {
    const read = reader('never');
    await expect(readArtifactText('brief.pdf', '/p/abc.pdf', 1024, read)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('returns null when the row has no stored path', async () => {
    await expect(readArtifactText('a.md', undefined, 10, reader('x'))).resolves.toBeNull();
  });

  it('refuses a text file too large to be a document', async () => {
    const read = reader('huge');
    await expect(readArtifactText('a.md', '/p/a.md', 2 * 1024 * 1024, read)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the 1MB boundary', async () => {
    await expect(readArtifactText('a.md', '/p/a.md', 1024 * 1024, reader('ok'))).resolves.toBe('ok');
  });

  it('degrades to a stub rather than failing when the file has vanished from disk', async () => {
    // An artifact whose blob was lost still belongs in the index — losing the
    // row as well would erase the record that the student ever did the work.
    const read = jest.fn().mockRejectedValue(new Error('ENOENT'));
    await expect(readArtifactText('a.md', '/p/gone.md', 10, read)).resolves.toBeNull();
  });

  it('tolerates a null size', async () => {
    await expect(readArtifactText('a.md', '/p/a.md', null, reader('ok'))).resolves.toBe('ok');
  });
});

describe('toArtifactRecords', () => {
  it('maps a stored row onto the render record', () => {
    const [record] = toArtifactRecords([stored()], new Map([['card-1', '# Body']]));
    expect(record).toEqual({
      week: 10,
      cardId: 'card-1',
      filename: 'governance.md',
      title: 'Build — Governance',
      text: '# Body',
      uploadedAt: '2026-08-20T10:00:00.000Z',
      sizeBytes: 1024,
      builtOnSample: false,
      projectLabel: null,
    });
  });

  describe('sample-project provenance', () => {
    it('carries a recorded sample flag and label through', () => {
      const [record] = toArtifactRecords(
        [stored({ content: { filename: 'a.md', week: 2, built_on_sample: true, project_label: 'the Retail Analytics Dashboard (sample)' } })],
        new Map([['card-1', 'x']]),
      );
      expect(record.builtOnSample).toBe(true);
      expect(record.projectLabel).toBe('the Retail Analytics Dashboard (sample)');
    });

    it('defaults a row predating the field to their OWN project, not to sample', () => {
      // All 53 artifacts uploaded before this existed have neither field.
      // Labelling real capstone work as practice is the worse error.
      const [record] = toArtifactRecords([stored()], new Map());
      expect(record.builtOnSample).toBe(false);
      expect(record.projectLabel).toBeNull();
    });

    it('treats a non-boolean sample flag as false rather than truthy', () => {
      const [record] = toArtifactRecords(
        [stored({ content: { filename: 'a.md', built_on_sample: 'yes' as unknown as boolean } })],
        new Map(),
      );
      expect(record.builtOnSample).toBe(false);
    });
  });

  it('skips a row with no content at all', () => {
    expect(toArtifactRecords([stored({ content: null })], new Map())).toEqual([]);
  });

  it('skips a row whose content has no filename — not an artifact', () => {
    expect(toArtifactRecords([stored({ content: { week: 4 } })], new Map())).toEqual([]);
  });

  it('carries a null text through as binary rather than dropping the row', () => {
    const [record] = toArtifactRecords([stored({ content: { filename: 'a.pdf', week: 4 } })], new Map());
    expect(record.text).toBeNull();
    expect(record.filename).toBe('a.pdf');
  });

  it('falls back to the filename when the card has no title', () => {
    const [record] = toArtifactRecords([stored({ title: '' })], new Map());
    expect(record.title).toBe('governance.md');
  });

  it('normalises a missing week to null rather than guessing', () => {
    const [record] = toArtifactRecords([stored({ content: { filename: 'a.md' } })], new Map());
    expect(record.week).toBeNull();
  });

  it('normalises a missing size to null', () => {
    const [record] = toArtifactRecords([stored({ content: { filename: 'a.md', week: 1 } })], new Map());
    expect(record.sizeBytes).toBeNull();
  });

  it('treats a card absent from the text map as binary, not as an error', () => {
    const [record] = toArtifactRecords([stored()], new Map());
    expect(record.text).toBeNull();
  });

  it('preserves input order for the renderer to sort', () => {
    const records = toArtifactRecords(
      [stored({ card_id: 'a' }), stored({ card_id: 'b' })],
      new Map([['a', 'A'], ['b', 'B']]),
    );
    expect(records.map((r) => r.cardId)).toEqual(['a', 'b']);
  });
});
