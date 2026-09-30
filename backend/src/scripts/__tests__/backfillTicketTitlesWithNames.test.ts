import fs from 'fs';
jest.mock('../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../services/reese/resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));

import { Ticket } from '../../models';
import { resolveStudentDisplayName } from '../../services/reese/resolveStudentDisplayName';
import {
  backfillTicketTitlesWithNames,
  parseArgs,
  extractFirstUuid,
  replaceUuidWithName,
} from '../backfillTicketTitlesWithNames';

const mockFindAll = Ticket.findAll as unknown as jest.Mock;
const mockResolveName = resolveStudentDisplayName as unknown as jest.Mock;

const UUID = 'd6a4b017-6716-4673-96b5-ab3074b70191';

/** A minimal fake ticket row with a real, spy-able instance .update(). */
function fakeTicket(overrides: { id: string; title: string; description?: string | null }) {
  const t: any = {
    id: overrides.id,
    title: overrides.title,
    description: overrides.description ?? null,
    update: jest.fn().mockImplementation(async (patch: Record<string, any>) => {
      Object.assign(t, patch);
      return t;
    }),
  };
  return t;
}

let writeFileSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  writeFileSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockResolveName.mockResolvedValue('Jordan Rivera');
});

afterEach(() => {
  writeFileSpy.mockRestore();
  logSpy.mockRestore();
});

describe('parseArgs', () => {
  it('defaults to dry run (apply: false) — the safer default for live human-facing text', () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  it('reads --apply', () => {
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
  });
});

describe('extractFirstUuid', () => {
  it('finds a raw UUID inside surrounding text', () => {
    expect(extractFirstUuid(`Reese autonomous outreach — inactivity (${UUID})`)).toBe(UUID);
  });

  it('returns null for clean text with no UUID', () => {
    expect(extractFirstUuid('Student support — DM conversation (Jordan Rivera)')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(extractFirstUuid(null)).toBeNull();
    expect(extractFirstUuid(undefined)).toBeNull();
    expect(extractFirstUuid('')).toBeNull();
  });
});

describe('replaceUuidWithName', () => {
  it('replaces every occurrence of the UUID with the name', () => {
    const text = `Reese is reaching out to student enrollment ${UUID}. Ref: ${UUID}`;
    expect(replaceUuidWithName(text, UUID, 'Jordan Rivera')).toBe(
      'Reese is reaching out to student enrollment Jordan Rivera. Ref: Jordan Rivera',
    );
  });

  it('returns null for null input rather than throwing', () => {
    expect(replaceUuidWithName(null, UUID, 'Jordan Rivera')).toBeNull();
  });
});

describe('backfillTicketTitlesWithNames — dry run (default)', () => {
  it('makes zero writes: no ticket.update() call and no undo-log file written', async () => {
    const dirty = fakeTicket({ id: 't-1', title: `Reese autonomous outreach — inactivity (${UUID})`, description: `Reaching out to ${UUID}.` });
    mockFindAll.mockResolvedValue([dirty]);

    const result = await backfillTicketTitlesWithNames({ apply: false });

    expect(dirty.update).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 1, matched: 1, rewritten: 0, undoLogPath: null });
    expect(result.rows[0]).toMatchObject({ ticket_id: 't-1', resolved_name: 'Jordan Rivera' });
  });
});

describe('backfillTicketTitlesWithNames — --apply', () => {
  it('rewrites only the matching row and leaves a clean row untouched', async () => {
    const dirty = fakeTicket({ id: 't-1', title: `Reese autonomous outreach — inactivity (${UUID})`, description: `Reaching out to ${UUID}.` });
    const clean = fakeTicket({ id: 't-2', title: 'Student support — DM conversation (Alex Chen)', description: 'Already clean.' });
    mockFindAll.mockResolvedValue([dirty, clean]);

    const result = await backfillTicketTitlesWithNames({ apply: true });

    expect(dirty.update).toHaveBeenCalledWith({
      title: 'Reese autonomous outreach — inactivity (Jordan Rivera)',
      description: 'Reaching out to Jordan Rivera.',
    });
    expect(clean.update).not.toHaveBeenCalled();
    expect(result.rewritten).toBe(1);
    expect(result.matched).toBe(1);
  });

  it('writes the undo-log file with pre-overwrite values BEFORE any ticket.update() call commits', async () => {
    const dirty = fakeTicket({ id: 't-1', title: `Reese autonomous outreach — inactivity (${UUID})`, description: `Reaching out to ${UUID}.` });
    mockFindAll.mockResolvedValue([dirty]);

    const callOrder: string[] = [];
    writeFileSpy.mockImplementation(() => {
      callOrder.push('undo_log_written');
    });
    dirty.update.mockImplementation(async () => {
      callOrder.push('ticket_updated');
    });

    const result = await backfillTicketTitlesWithNames({ apply: true });

    expect(callOrder).toEqual(['undo_log_written', 'ticket_updated']);
    expect(result.undoLogPath).not.toBeNull();

    // The logged payload carries the PRE-overwrite values, not the new ones.
    const loggedPayload = JSON.parse(String(writeFileSpy.mock.calls[0][1]));
    expect(loggedPayload[0]).toMatchObject({
      ticket_id: 't-1',
      previous_title: `Reese autonomous outreach — inactivity (${UUID})`,
      previous_description: `Reaching out to ${UUID}.`,
    });
  });

  it('is idempotent: a second run over already-rewritten (clean) rows makes zero further writes', async () => {
    // Simulates re-running --apply after a completed run: the row no longer
    // contains a UUID, so it's not a candidate at all.
    const alreadyRewritten = fakeTicket({ id: 't-1', title: 'Reese autonomous outreach — inactivity (Jordan Rivera)', description: 'Reaching out to Jordan Rivera.' });
    mockFindAll.mockResolvedValue([alreadyRewritten]);

    const result = await backfillTicketTitlesWithNames({ apply: true });

    expect(alreadyRewritten.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 1, matched: 0, rewritten: 0 });
  });

  it('makes zero writes and skips the undo log when there is nothing to rewrite', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await backfillTicketTitlesWithNames({ apply: true });

    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 0, matched: 0, rewritten: 0, undoLogPath: null });
  });
});
