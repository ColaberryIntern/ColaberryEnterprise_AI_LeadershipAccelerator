import { randomUUID } from 'crypto';

// Shared in-memory Sequelize-model fake for Inbox Intel unit/integration
// tests. Supports the subset of the Sequelize API this codebase's services
// actually call (create/findByPk/findOne/findAll/update), so services can
// run end-to-end against real logic without a live Postgres connection.
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
      return Array.from(rows.values()).find((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)) || null;
    },
    async findAll({ where }: any = {}) {
      const all = Array.from(rows.values());
      if (!where) return all;
      return all.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}
