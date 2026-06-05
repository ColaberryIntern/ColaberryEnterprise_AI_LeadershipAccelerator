import { runChangeDetector } from '../../services/anthropicChangeDetector';
import AnthropicContentRegistry from '../../models/AnthropicContentRegistry';
import AnthropicChangeEvent from '../../models/AnthropicChangeEvent';

jest.mock('../../models/AnthropicContentRegistry');
jest.mock('../../models/AnthropicChangeEvent');
jest.mock('../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(async (fn: (t: unknown) => Promise<void>) => fn({})),
  },
}));

const MockRegistry = AnthropicContentRegistry as jest.Mocked<typeof AnthropicContentRegistry>;
const MockEvent = AnthropicChangeEvent as jest.Mocked<typeof AnthropicChangeEvent>;

function makeRow(overrides: Partial<{
  id: string;
  url: string;
  content_type: string;
  change_summary: Record<string, unknown> | null;
}> = {}): any {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    id: overrides.id ?? 'registry-uuid-1',
    url: overrides.url ?? 'https://docs.anthropic.com',
    content_type: overrides.content_type ?? 'document',
    change_summary: overrides.change_summary !== undefined
      ? overrides.change_summary
      : {
          detected_at: '2026-06-05T02:00:00.000Z',
          detection_method: 'content_hash',
          previous_value: 'aaa111',
          current_value: 'bbb222',
        },
    update,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  MockEvent.create = jest.fn().mockResolvedValue({});
});

describe('runChangeDetector — happy paths', () => {
  it('writes an event and clears the flag for a flagged row', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);

    const result = await runChangeDetector();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(MockEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        registry_id: 'registry-uuid-1',
        url: 'https://docs.anthropic.com',
        detection_method: 'content_hash',
        severity: 'unknown',
      }),
      expect.anything(),
    );
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: false, change_summary: null }),
      expect.anything(),
    );
  });

  it('returns zero immediately when no rows are flagged', async () => {
    MockRegistry.findAll = jest.fn().mockResolvedValue([]);

    const result = await runChangeDetector();

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(MockEvent.create).not.toHaveBeenCalled();
  });

  it('processes multiple flagged rows', async () => {
    const rows = [
      makeRow({ id: 'id-1', url: 'https://docs.anthropic.com' }),
      makeRow({ id: 'id-2', url: 'https://anthropic.com/news' }),
    ];
    MockRegistry.findAll = jest.fn().mockResolvedValue(rows);

    const result = await runChangeDetector();

    expect(result.processed).toBe(2);
    expect(MockEvent.create).toHaveBeenCalledTimes(2);
  });
});

describe('runChangeDetector — failure paths', () => {
  it('records error and continues when event creation fails', async () => {
    const failRow = makeRow({ id: 'fail', url: 'https://fail.example.com' });
    const okRow = makeRow({ id: 'ok', url: 'https://docs.anthropic.com' });
    MockRegistry.findAll = jest.fn().mockResolvedValue([failRow, okRow]);

    const { sequelize } = require('../../config/database');
    sequelize.transaction
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn({}));

    const result = await runChangeDetector();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.events[0].error_class).toBe('DatabaseError');
    expect(result.events[1].url).toBe('https://docs.anthropic.com');
  });

  it('tags SequelizeUniqueConstraintError as DuplicateEventError', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);

    const dupErr = Object.assign(new Error('unique violation'), { name: 'SequelizeUniqueConstraintError' });
    const { sequelize } = require('../../config/database');
    sequelize.transaction.mockRejectedValueOnce(dupErr);

    const result = await runChangeDetector();

    expect(result.errors).toBe(1);
    expect(result.events[0].error_class).toBe('DuplicateEventError');
  });
});

describe('runChangeDetector — boundary cases', () => {
  it('skips and clears a flagged row with null change_summary', async () => {
    const row = makeRow({ change_summary: null });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);

    const result = await runChangeDetector();

    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
    expect(MockEvent.create).not.toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith({ change_detected: false });
  });
});

describe('runChangeDetector — idempotency', () => {
  it('second run with no flagged rows produces no events', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn()
      .mockResolvedValueOnce([row])   // first run: one flagged row
      .mockResolvedValueOnce([]);      // second run: flag was cleared

    const first = await runChangeDetector();
    const second = await runChangeDetector();

    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    expect(MockEvent.create).toHaveBeenCalledTimes(1);
  });
});
