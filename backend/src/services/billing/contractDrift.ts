/**
 * Where CCPP's placement contracts and PaySimple's live schedules disagree.
 *
 * CCPP records payments automatically, but contract terms (amount, number of payments, dates) are
 * typed by hand, so they drift. Found 2026-11-24: a member's contract read $500 x 97 in CCPP while
 * PaySimple was set to $589.96 x 24.
 *
 * This file is the comparison only: no network, no database, no writes. Reading is in
 * contractDriftSource.ts. Neither system is treated as automatically right: the signed agreement
 * decides the terms, so this lists differences for a person and never corrects them.
 */

export interface CcppContract {
  id: number;
  customerId: string | null;
  name: string | null;
  amount: number | null;
  totalPayments: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface GatewaySchedule {
  id: string;
  customerId: string;
  name: string;
  amount: number;
  status: string;
  frequency: string;
  endDate: Date | null;
}

export type DriftKind =
  | 'two_active_schedules'
  | 'placeholder_terms'
  | 'amount_mismatch'
  | 'end_date_mismatch'
  | 'several_contracts'
  | 'contract_without_schedule'
  | 'schedule_without_contract';

export interface DriftRow {
  kind: DriftKind;
  customerId: string;
  name: string;
  contractIds: number[];
  scheduleIds: string[];
  detail: string;
}

export interface DriftResult {
  rows: DriftRow[];
  contractsChecked: number;
  activeSchedules: number;
  agreeing: number;
}

/** Written by the 2026 Accelerator enrollment as a stand-in. Never a receivable. */
const PLACEHOLDER = { amount: 500, totalPayments: 97 };
/** The month a final payment lands in can differ from the schedule's cut-off by up to a cycle. */
const END_DATE_TOLERANCE_DAYS = 31;
/** The Accelerator app's own membership prices. Those members live in the app, not in a CCPP contract. */
const APP_MEMBERSHIP_PRICES = new Set([149, 199, 1788]);

export const isActive = (s: GatewaySchedule): boolean => s.status.toLowerCase() === 'active';

const cents = (n: number): number => Math.round(n * 100);
const money = (n: number | null): string => (n === null ? 'no amount' : `$${n.toFixed(2)}`);
const day = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : 'none');

const isPlaceholder = (c: CcppContract): boolean =>
  c.amount === PLACEHOLDER.amount && c.totalPayments === PLACEHOLDER.totalPayments;

/** Still inside its term. A contract with no end date cannot be shown to be over, so it counts. */
const inTerm = (c: CcppContract, now: Date): boolean => !c.endDate || c.endDate >= now;

function group<T extends { customerId: string | null }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    if (!item.customerId) continue;
    out.set(item.customerId, [...(out.get(item.customerId) ?? []), item]);
  }
  return out;
}

function compareTerms(c: CcppContract, s: GatewaySchedule): Pick<DriftRow, 'kind' | 'detail'> | null {
  if (isPlaceholder(c)) {
    return { kind: 'placeholder_terms', detail: `CCPP has the $500 x 97 placeholder; PaySimple charges ${money(s.amount)} (${s.frequency})` };
  }
  if (c.amount === null || cents(c.amount) !== cents(s.amount)) {
    return { kind: 'amount_mismatch', detail: `CCPP ${money(c.amount)}, PaySimple ${money(s.amount)} (${s.frequency})` };
  }
  if (c.endDate && s.endDate) {
    const days = Math.abs(c.endDate.getTime() - s.endDate.getTime()) / 86_400_000;
    if (days > END_DATE_TOLERANCE_DAYS) {
      return { kind: 'end_date_mismatch', detail: `CCPP ends ${day(c.endDate)}, PaySimple ends ${day(s.endDate)}` };
    }
  } else if (c.endDate && !s.endDate) {
    return { kind: 'end_date_mismatch', detail: `CCPP ends ${day(c.endDate)}, PaySimple has no end date and keeps charging` };
  }
  return null;
}

/** `contracts` must already be limited to CCPP status 1 (active); see contractDriftSource.ts. */
export function findContractDrift(contracts: CcppContract[], schedules: GatewaySchedule[], now: Date): DriftResult {
  const active = schedules.filter(isActive);
  const byContract = group(contracts);
  const bySchedule = group(active);
  const rows: DriftRow[] = [];
  let agreeing = 0;

  for (const customerId of new Set([...byContract.keys(), ...bySchedule.keys()])) {
    const cs = byContract.get(customerId) ?? [];
    const ss = bySchedule.get(customerId) ?? [];
    const base = {
      customerId,
      name: ss[0]?.name || cs[0]?.name || `customer ${customerId}`,
      contractIds: cs.map((c) => c.id),
      scheduleIds: ss.map((s) => s.id),
    };
    const add = (kind: DriftKind, detail: string): void => { rows.push({ ...base, kind, detail }); };

    if (ss.length > 1) {
      add('two_active_schedules', `${ss.length} active schedules: ${ss.map((s) => `${s.id} ${money(s.amount)}`).join(', ')}`);
    } else if (ss.length === 1 && cs.length > 1) {
      add('several_contracts', `${cs.length} active CCPP contracts for one schedule of ${money(ss[0].amount)}`);
    } else if (ss.length === 1 && cs.length === 1) {
      const diff = compareTerms(cs[0], ss[0]);
      if (diff) add(diff.kind, diff.detail); else agreeing += 1;
    } else if (ss.length === 1) {
      if (!APP_MEMBERSHIP_PRICES.has(ss[0].amount)) {
        add('schedule_without_contract', `PaySimple charges ${money(ss[0].amount)} (${ss[0].frequency}); no active CCPP contract`);
      }
    } else {
      const open = cs.filter((c) => inTerm(c, now));
      if (open.length) {
        add('contract_without_schedule', open.map((c) => `contract ${c.id}: ${money(c.amount)} x ${c.totalPayments ?? '?'}, ends ${day(c.endDate)}`).join('; '));
      }
    }
  }

  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { rows, contractsChecked: contracts.length, activeSchedules: active.length, agreeing };
}

const HEADINGS: Array<[DriftKind, string]> = [
  ['two_active_schedules', 'Two or more active schedules (check for a double charge)'],
  ['amount_mismatch', 'Amount differs'],
  ['end_date_mismatch', 'End date differs'],
  ['placeholder_terms', 'CCPP still has the $500 x 97 placeholder'],
  ['several_contracts', 'More than one active CCPP contract'],
  ['schedule_without_contract', 'PaySimple is charging, no active CCPP contract'],
  ['contract_without_schedule', 'Active CCPP contract still in term, PaySimple is not charging'],
];

export function renderDrift(r: DriftResult): string {
  const lines = [
    `${r.contractsChecked} active CCPP contracts, ${r.activeSchedules} active PaySimple schedules: `
      + `${r.agreeing} agree, ${r.rows.length} differ.`,
  ];
  for (const [kind, heading] of HEADINGS) {
    const rows = r.rows.filter((x) => x.kind === kind);
    if (!rows.length) continue;
    lines.push('', `${heading}: ${rows.length}`);
    rows.forEach((x) => lines.push(
      `  ${x.name} (customer ${x.customerId}${x.contractIds.length ? `, contract ${x.contractIds.join('/')}` : ''}): ${x.detail}`,
    ));
  }
  return lines.join('\n');
}
