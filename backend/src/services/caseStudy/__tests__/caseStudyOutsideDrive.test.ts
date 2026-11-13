/**
 * The Drive boundary for the manual outside import. The Drive client is a stub passed in; nothing reaches Google.
 */
jest.mock('../../driveService', () => ({ getDriveClient: jest.fn(() => { throw new Error('Google Drive not configured'); }) }));
import { Readable } from 'stream';
import {
  getDriveFileMeta, listDriveFolderFiles, downloadDriveFile, readCapped, toDriveError, DriveImportError,
  DRIVE_FOLDER_MAX_FILES, DRIVE_META_TIMEOUT_MS,
} from '../caseStudyOutsideDrive';

const PDF = 'application/pdf';
const stub = (files: { get?: jest.Mock; list?: jest.Mock }) => ({ files }) as never;
let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('getDriveFileMeta', () => {
  it('returns typed metadata and passes an explicit timeout with googleapis retry off', async () => {
    const get = jest.fn().mockResolvedValue({ data: { id: 'f1', name: 'AgTech.pdf', mimeType: PDF, modifiedTime: '2024-05-20T23:04:00Z', size: '465038' } });
    const meta = await getDriveFileMeta('f1', stub({ get }));
    expect(meta).toEqual({ id: 'f1', name: 'AgTech.pdf', mimeType: PDF, modifiedTime: '2024-05-20T23:04:00Z', sizeBytes: 465038 });
    expect(get.mock.calls[0][1]).toEqual({ timeout: DRIVE_META_TIMEOUT_MS, retry: false });
  });

  it('refuses a Google-native Slides deck and an oversized file', async () => {
    const slides = jest.fn().mockResolvedValue({ data: { id: 'f', name: 'Deck', mimeType: 'application/vnd.google-apps.presentation' } });
    await expect(getDriveFileMeta('f', stub({ get: slides }))).rejects.toMatchObject({ errorClass: 'DriveUnsupportedType' });
    const big = jest.fn().mockResolvedValue({ data: { id: 'f', name: 'Big.pdf', mimeType: PDF, size: String(60 * 1024 * 1024) } });
    await expect(getDriveFileMeta('f', stub({ get: big }))).rejects.toMatchObject({ errorClass: 'DriveTooLarge' });
  });

  it('maps 404/403/timeout/not-configured to typed errors and logs the error_class', async () => {
    const reject = (e: unknown) => stub({ get: jest.fn().mockRejectedValue(e) });
    await expect(getDriveFileMeta('f', reject({ code: 404, message: 'File not found' }))).rejects.toMatchObject({ errorClass: 'DriveNotFound' });
    await expect(getDriveFileMeta('f', reject({ response: { status: 403 }, message: 'forbidden' }))).rejects.toMatchObject({ errorClass: 'DriveForbidden' });
    await expect(getDriveFileMeta('f', reject(new Error('timeout of 30000ms exceeded')))).rejects.toMatchObject({ errorClass: 'DriveTimeout' });
    await expect(getDriveFileMeta('f')).rejects.toMatchObject({ errorClass: 'DriveNotConfigured' });
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'case_study_outside_drive_failed', error_class: 'DriveNotFound' });
  });
});

describe('listDriveFolderFiles', () => {
  it('asks only for supported types in that folder and caps at the limit, reporting truncation', async () => {
    const files = Array.from({ length: DRIVE_FOLDER_MAX_FILES + 1 }, (_, i) => ({ id: `f${i}`, name: `${i}.pdf`, mimeType: PDF }));
    const list = jest.fn().mockResolvedValue({ data: { files } });
    const out = await listDriveFolderFiles('folderABC123', stub({ list }));
    expect(out.files).toHaveLength(DRIVE_FOLDER_MAX_FILES);
    expect(out.truncated).toBe(true);
    expect(list.mock.calls[0][0].q).toMatch(/^'folderABC123' in parents and trashed = false and \(mimeType = 'application\/pdf' or /);
  });

  it("refuses an id that could break out of the query string, before calling Drive", async () => {
    const list = jest.fn();
    await expect(listDriveFolderFiles("abc' or name contains 'x", stub({ list }))).rejects.toMatchObject({ errorClass: 'DriveInvalidId' });
    expect(list).not.toHaveBeenCalled();
  });

  it('returns an empty list for an empty folder', async () => {
    const out = await listDriveFolderFiles('folderABC123', stub({ list: jest.fn().mockResolvedValue({ data: {} }) }));
    expect(out).toEqual({ files: [], truncated: false });
  });
});

describe('downloadDriveFile / readCapped', () => {
  it('downloads the bytes', async () => {
    const get = jest.fn().mockResolvedValue({ data: Readable.from([Buffer.from('abc'), Buffer.from('def')]) });
    expect((await downloadDriveFile('f1', stub({ get }))).toString()).toBe('abcdef');
    expect(get.mock.calls[0][1]).toMatchObject({ responseType: 'stream', retry: false });
  });

  it('cuts off a stream that passes the byte cap', async () => {
    await expect(readCapped(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), 10)).rejects.toBeInstanceOf(DriveImportError);
    await expect(readCapped(Readable.from([Buffer.alloc(5), Buffer.alloc(5)]), 10)).resolves.toHaveLength(10);
  });

  it('toDriveError passes an existing DriveImportError through untouched', () => {
    const e = new DriveImportError('DriveTooLarge', 'x');
    expect(toDriveError(e)).toBe(e);
    expect(toDriveError({ message: 'boom', code: 500 }).errorClass).toBe('DriveUpstreamError');
  });
});
