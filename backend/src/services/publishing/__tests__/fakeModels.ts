import { Op } from 'sequelize';

/**
 * An in-memory stand-in for the handful of Sequelize models the publishing flow touches.
 *
 * NOT a Sequelize emulator. It implements exactly the surface the services under test call
 * (findByPk, findOne, findAll, findOrCreate, count, create, static update, instance update,
 * set) and exactly the where-operators those calls use (equality, IN via array, Op.lte,
 * Op.ne, Op.is, Op.or). Anything else throws, so a service that starts using an operator the
 * fake does not model fails loudly here rather than passing on a silently-ignored clause.
 *
 * The point of the exercise: the end-to-end test drives the REAL services - composer,
 * action, approval, worker - and only the persistence is faked. If the fake were a mock
 * that answered whatever the test wanted, the test would prove nothing about the seams
 * between those services, which is where the last three defects in this run lived.
 */

type Row = Record<string, any>;

let nextId = 1;
export function fakeId(prefix: string): string {
  const n = String(nextId++).padStart(12, '0');
  return `${prefix.slice(0, 8).padEnd(8, '0')}-0000-4000-8000-${n}`;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const key of Reflect.ownKeys(where)) {
    const cond = (where as any)[key];
    if (key === Op.or) {
      if (!(cond as Row[]).some((alt) => matches(row, alt))) return false;
      continue;
    }
    if (typeof key === 'symbol') throw new Error(`fakeModels: unsupported top-level operator ${String(key)}`);
    const value = row[key as string];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      for (const opKey of Reflect.ownKeys(cond)) {
        const bound = (cond as any)[opKey];
        if (opKey === Op.lte) { if (!(toMs(value) <= toMs(bound))) return false; }
        else if (opKey === Op.ne) { if (value === bound) return false; }
        else if (opKey === Op.is) { if (bound === null && value !== null && value !== undefined) return false; }
        else throw new Error(`fakeModels: unsupported operator ${String(opKey)} on ${String(key)}`);
      }
      continue;
    }
    if (Array.isArray(cond)) { if (!cond.includes(value)) return false; continue; }
    if (cond instanceof Date) { if (toMs(value) !== toMs(cond)) return false; continue; }
    if ((value ?? null) !== (cond ?? null)) return false;
  }
  return true;
}

function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' || typeof v === 'number') return new Date(v).getTime();
  return Number.NaN;
}

export interface FakeModel {
  name: string;
  rows: Row[];
  reset(): void;
  create(values: Row): Promise<Row>;
  findByPk(id: string): Promise<Row | null>;
  findOne(opts?: { where?: Row; order?: [string, string][] }): Promise<Row | null>;
  findAll(opts?: { where?: Row; order?: [string, string][]; limit?: number; attributes?: string[] }): Promise<Row[]>;
  findOrCreate(opts: { where: Row; defaults?: Row }): Promise<[Row, boolean]>;
  count(opts?: { where?: Row }): Promise<number>;
  update(values: Row, opts: { where: Row }): Promise<[number]>;
}

export function fakeModel(name: string, idPrefix: string, defaults: Row = {}): FakeModel {
  const rows: Row[] = [];

  function wrap(row: Row): Row {
    Object.defineProperty(row, 'update', {
      enumerable: false,
      value: async (patch: Row) => { Object.assign(row, patch, { updated_at: new Date() }); return row; },
    });
    Object.defineProperty(row, 'set', { enumerable: false, value: (patch: Row) => { Object.assign(row, patch); } });
    Object.defineProperty(row, 'toJSON', { enumerable: false, value: () => ({ ...row }) });
    return row;
  }

  function sort(list: Row[], order?: [string, string][]): Row[] {
    if (!order || order.length === 0) return list;
    const [[field, dir]] = order;
    return [...list].sort((a, b) => {
      const av = a[field]; const bv = b[field];
      const cmp = av instanceof Date || bv instanceof Date ? toMs(av) - toMs(bv) : String(av).localeCompare(String(bv));
      return dir.toUpperCase() === 'DESC' ? -cmp : cmp;
    });
  }

  const model: FakeModel = {
    name,
    rows,
    reset() { rows.length = 0; },
    async create(values) {
      const row = wrap({ ...defaults, id: fakeId(idPrefix), created_at: new Date(), updated_at: new Date(), ...values });
      rows.push(row);
      return row;
    },
    async findByPk(id) { return rows.find((r) => r.id === id) ?? null; },
    async findOne(opts = {}) { return sort(rows.filter((r) => matches(r, opts.where)), opts.order)[0] ?? null; },
    async findAll(opts = {}) {
      const out = sort(rows.filter((r) => matches(r, opts.where)), opts.order);
      return opts.limit ? out.slice(0, opts.limit) : out;
    },
    async findOrCreate({ where, defaults: d }) {
      const hit = rows.find((r) => matches(r, where));
      if (hit) return [hit, false];
      return [await model.create({ ...where, ...(d ?? {}) }), true];
    },
    async count(opts = {}) { return rows.filter((r) => matches(r, opts.where)).length; },
    async update(values, { where }) {
      const hits = rows.filter((r) => matches(r, where));
      for (const r of hits) Object.assign(r, values, { updated_at: new Date() });
      return [hits.length];
    },
  };
  return model;
}

/** Every model the compose -> approve -> schedule -> publish path touches. */
export function makeFakeModelSet() {
  const set = {
    Brand: fakeModel('Brand', 'brand'),
    BrandDomain: fakeModel('BrandDomain', 'bdomain'),
    BrandGovernanceRule: fakeModel('BrandGovernanceRule', 'bgrule'),
    Campaign: fakeModel('Campaign', 'campaign'),
    ContentItem: fakeModel('ContentItem', 'citem', { status: 'draft', revision: 1, metadata: {}, human_approved: false, archived_at: null, scheduled_for: null, published_at: null }),
    ContentVariant: fakeModel('ContentVariant', 'cvariant', { is_manually_edited: false, validation_state: 'unvalidated', validation_errors: [], metadata: {}, link_url: null, tracked_link_id: null, channel_account_id: null, disclosure_text: null }),
    ContentItemMedia: fakeModel('ContentItemMedia', 'cimedia'),
    MediaAsset: fakeModel('MediaAsset', 'masset'),
    ContentApprovalRequest: fakeModel('ContentApprovalRequest', 'approval'),
    ContentApprovalEvent: fakeModel('ContentApprovalEvent', 'apevent'),
    TrackedLink: fakeModel('TrackedLink', 'tlink', { status: 'draft', click_count: 0, metadata: {} }),
    PublishingJob: fakeModel('PublishingJob', 'pjob', { state: 'pending', attempts: 0, max_attempts: 3, next_retry_at: null, dead_lettered_at: null, dead_letter_reason: null, claimed_by: null, claimed_at: null, last_error: null, last_error_class: null, policy_snapshot: {} }),
    ExternalPublication: fakeModel('ExternalPublication', 'extpub', { metadata: {}, permalink: null, removed_at: null }),
    PlatformDeliveryEvent: fakeModel('PlatformDeliveryEvent', 'devent'),
  };
  return set;
}

export type FakeModelSet = ReturnType<typeof makeFakeModelSet>;

export function resetAll(set: FakeModelSet): void {
  // The set may arrive as a module namespace (import * as) carrying non-model keys.
  for (const m of Object.values(set) as Array<Partial<FakeModel>>) if (typeof m?.reset === 'function') m.reset();
}
