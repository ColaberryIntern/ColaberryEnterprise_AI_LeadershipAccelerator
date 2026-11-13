/**
 * Batch behaviour: per-file results, the Drive pre-check, temp-file cleanup, and that one failure never sinks the batch.
 */
const importOutsideFile = jest.fn();
jest.mock('../caseStudyOutsideIntake', () => ({ importOutsideFile: (...a: unknown[]) => importOutsideFile(...a) }));
jest.mock('../caseStudyOutsideRecord', () => ({ findExistingImport: jest.fn() }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { importDriveFile, importDriveFolder, importUploadedFiles } from '../caseStudyOutsideIntakeBatch';
import { DriveImportError } from '../caseStudyOutsideDrive';

const ctx = { tenantId: 't1', actor: 'a@b.c', correlationId: 'c1' };
const created = (name: string) => ({ fileName: name, status: 'created', alreadyImported: false, caseStudyId: `cs-${name}`, title: name, analysisError: null, suggestionsInserted: 0, error: null, errorClass: null });
const meta = (id: string, modifiedTime: string | null = '2024-05-20T00:00:00Z') => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', modifiedTime, sizeBytes: 10 });

let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('importUploadedFiles', () => {
  it('imports each temp file as external_document and deletes every temp file, even after a failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csx-'));
    const a = path.join(dir, 'a.pdf'); const b = path.join(dir, 'b.pdf');
    fs.writeFileSync(a, 'aaa'); fs.writeFileSync(b, 'bbb');
    importOutsideFile.mockResolvedValueOnce(created('a.pdf')).mockResolvedValueOnce(created('b.pdf'));
    const out = await importUploadedFiles([
      { path: a, originalName: 'a.pdf', mimeType: 'application/pdf', size: 3 },
      { path: path.join(dir, 'missing.pdf'), originalName: 'missing.pdf', mimeType: 'application/pdf', size: 3 },
      { path: b, originalName: 'b.pdf', mimeType: 'application/pdf', size: 3 },
    ], ctx);
    expect(out.results.map((r) => r.status)).toEqual(['created', 'failed', 'created']);
    expect(out.results[1]).toMatchObject({ status: 'failed', errorClass: 'UploadReadError' });
    expect(importOutsideFile.mock.calls[0][0]).toMatchObject({ fileName: 'a.pdf', sourceKind: 'external_document' });
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
  });
});

describe('importDriveFile', () => {
  it('returns alreadyImported for an unchanged Drive file WITHOUT downloading it', async () => {
    const download = jest.fn();
    const out = await importDriveFile('file1234567', ctx, {
      getMeta: jest.fn().mockResolvedValue(meta('file1234567')), download,
      findExisting: jest.fn().mockResolvedValue({ caseStudyId: 'cs-old', contentHash: 'h' }),
    });
    expect(out.results[0]).toMatchObject({ status: 'already_imported', caseStudyId: 'cs-old' });
    expect(download).not.toHaveBeenCalled();
    expect(importOutsideFile).not.toHaveBeenCalled();
  });

  it('downloads a changed file and imports it as external_drive carrying its id and modifiedTime', async () => {
    importOutsideFile.mockResolvedValue(created('x'));
    await importDriveFile('file1234567', ctx, {
      getMeta: jest.fn().mockResolvedValue(meta('file1234567')), download: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      findExisting: jest.fn().mockResolvedValue(null),
    });
    expect(importOutsideFile.mock.calls[0][0]).toMatchObject({ sourceKind: 'external_drive', driveFileId: 'file1234567', driveModifiedTime: '2024-05-20T00:00:00Z' });
  });

  it('turns a Drive failure into one failed result with the typed class', async () => {
    const out = await importDriveFile('file1234567', ctx, { getMeta: jest.fn().mockRejectedValue(new DriveImportError('DriveForbidden', 'The service account cannot read that Drive item.')) });
    expect(out.results).toEqual([expect.objectContaining({ status: 'failed', errorClass: 'DriveForbidden', fileName: 'file1234567' })]);
  });
});

describe('importDriveFolder', () => {
  it('imports one record per file and keeps going after one download fails', async () => {
    importOutsideFile.mockResolvedValue(created('ok'));
    const download = jest.fn().mockRejectedValueOnce(new DriveImportError('DriveTooLarge', 'The Drive file is larger than 50 MB.')).mockResolvedValue(Buffer.from('pdf'));
    const out = await importDriveFolder('folder123456', ctx, {
      listFolder: jest.fn().mockResolvedValue({ files: [meta('f1aaaaaaaaa'), meta('f2aaaaaaaaa')], truncated: false }),
      download, findExisting: jest.fn().mockResolvedValue(null),
    });
    expect(out.results.map((r) => r.status)).toEqual(['failed', 'created']);
    expect(out.note).toBeNull();
  });

  it('says so when the folder is empty, and when it was truncated', async () => {
    expect((await importDriveFolder('folder123456', ctx, { listFolder: jest.fn().mockResolvedValue({ files: [], truncated: false }) })).note).toMatch(/No PDF/);
    const t = await importDriveFolder('folder123456', ctx, {
      listFolder: jest.fn().mockResolvedValue({ files: [meta('f1aaaaaaaaa', null)], truncated: true }),
      download: jest.fn().mockResolvedValue(Buffer.from('x')), findExisting: jest.fn(),
    });
    expect(t.note).toMatch(/newest 1/);
  });
});
