import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Shared in-memory Sequelize-model fake for Inbox Intel unit/integration
// tests. Supports the subset of the Sequelize API this codebase's services
// actually call (create/findByPk/findOne/findAll/update), so services can
// run end-to-end against real logic without a live Postgres connection.
//
// Understands Op.or/Op.and/Op.notIn/Op.in on top of plain equality —
// `Object.entries(where)` alone silently ignores Symbol-keyed conditions
// like `{ [Op.or]: [...] }` (Object.entries only returns string-keyed
// properties), which made an earlier version of this fake return EVERY row
// for any query using Op.or instead of filtering — a real bug in the test
// harness, not in the code under test. Caught by caseKnowledgeService.test.ts.
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;

  for (const op of Object.getOwnPropertySymbols(where)) {
    const clauses = where[op];
    if (op === Op.or) {
      if (!clauses.some((c: any) => matchesWhere(row, c))) return false;
    } else if (op === Op.and) {
      if (!clauses.every((c: any) => matchesWhere(row, c))) return false;
    }
  }

  for (const [key, value] of Object.entries(where)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const symbolKeys = Object.getOwnPropertySymbols(value as object);
      if (symbolKeys.includes(Op.notIn)) {
        if ((value as any)[Op.notIn].includes(row[key])) return false;
        continue;
      }
      if (symbolKeys.includes(Op.in)) {
        if (!(value as any)[Op.in].includes(row[key])) return false;
        continue;
      }
      if (symbolKeys.includes(Op.ne)) {
        if (row[key] === (value as any)[Op.ne]) return false;
        continue;
      }
      if (symbolKeys.includes(Op.or)) {
        const alt = (value as any)[Op.or];
        if (!alt.some((v: any) => row[key] === v)) return false;
        continue;
      }
    }
    if (row[key] !== value) return false;
  }

  return true;
}

export function makeFakeModel() {
  const rows = new Map<string, any>();
  return {
    rows,
    async create(attrs: any) {
      const id = attrs.id || randomUUID();
      const row: any = {
        id,
        ...attrs,
        toJSON() {
          const { toJSON, update, ...rest } = row;
          return rest;
        },
        async update(patch: any) {
          Object.assign(row, patch);
          return row;
        },
      };
      rows.set(id, row);
      return row;
    },
    async findByPk(id: string) {
      return rows.get(id) || null;
    },
    async findOne({ where }: any = {}) {
      return Array.from(rows.values()).find((r) => matchesWhere(r, where)) || null;
    },
    async findAll({ where }: any = {}) {
      return Array.from(rows.values()).filter((r) => matchesWhere(r, where));
    },
    async count({ where }: any = {}) {
      return Array.from(rows.values()).filter((r) => matchesWhere(r, where)).length;
    },
  };
}
