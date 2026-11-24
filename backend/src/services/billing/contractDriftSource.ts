/**
 * Reads the two sides of the contract drift report. SELECT and GET only.
 *
 * Failure modes: if PaySimple or CCPP is unreachable, or PaySimple's list is longer than the page cap,
 * this THROWS. A partial read would report real schedules as missing, so no report is better than a
 * wrong one. No retries here: it is run on demand and is safe to run again. Timeouts live in
 * paysimpleService.apiRequest and in the CCPP connection.
 */

import { apiRequest } from '../paysimpleService';
import { connectCcpp } from '../publicEventsService';
import type { CcppContract, GatewaySchedule } from './contractDrift';

const PAGE_SIZE = 200;
const MAX_PAGES = 30;

/** Status 1 is active. Third-party portfolios (16 MentorWorks, 17 Stride) are not ours to collect. */
export const ACTIVE_CONTRACTS_QUERY = `
  SELECT c.SMIC_ID, c.PS_CustomerID, u.DisplayName, c.SMIC_PaymentAmount, c.SMIC_TotalPayments,
         c.SMIC_PayStartDate, c.SMIC_PayEndDate
  FROM dbo.ADF_Student_Marketing_SalesRepsComm c
  LEFT JOIN dnnuser.users u ON u.UserID = c.SMIC_UserID
  WHERE c.SMIC_Status = 1`;

interface ContractRecord {
  SMIC_ID: number;
  PS_CustomerID: number | string | null;
  DisplayName: string | null;
  SMIC_PaymentAmount: number | null;
  SMIC_TotalPayments: number | null;
  SMIC_PayStartDate: Date | null;
  SMIC_PayEndDate: Date | null;
}

interface ScheduleRecord {
  Id: number | string;
  CustomerId: number | string;
  CustomerFirstName?: string | null;
  CustomerLastName?: string | null;
  PaymentAmount: number;
  ScheduleStatus: string;
  ExecutionFrequencyType?: string | null;
  EndDate?: string | null;
}

/** PaySimple writes "no date" as year 1. */
function gatewayDate(v: string | null | undefined): Date | null {
  if (!v || v.startsWith('0001')) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function readSchedules(): Promise<GatewaySchedule[]> {
  const out = new Map<string, GatewaySchedule>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiRequest<ScheduleRecord[] | { Response?: ScheduleRecord[] }>(
      'GET', `/v4/recurringpayment?page=${page}&pagesize=${PAGE_SIZE}`,
    );
    const rows = Array.isArray(res) ? res : res?.Response;
    if (!Array.isArray(rows)) throw new Error('PaySimple returned an unexpected shape for the schedule list');
    for (const r of rows) {
      const amount = Number(r.PaymentAmount);
      if (r.Id == null || r.CustomerId == null || !Number.isFinite(amount) || typeof r.ScheduleStatus !== 'string') {
        throw new Error(`PaySimple schedule ${r.Id ?? '?'} is missing a field the report needs`);
      }
      out.set(String(r.Id), {
        id: String(r.Id),
        customerId: String(r.CustomerId),
        name: `${r.CustomerFirstName ?? ''} ${r.CustomerLastName ?? ''}`.trim(),
        amount,
        status: r.ScheduleStatus,
        frequency: r.ExecutionFrequencyType ?? 'unknown frequency',
        endDate: gatewayDate(r.EndDate),
      });
    }
    if (rows.length < PAGE_SIZE) return [...out.values()];
  }
  throw new Error(`PaySimple has more than ${MAX_PAGES * PAGE_SIZE} schedules; raise MAX_PAGES rather than report a partial list`);
}

export async function readActiveContracts(): Promise<CcppContract[]> {
  const pool = await connectCcpp();
  try {
    const { recordset } = await pool.request().query<ContractRecord>(ACTIVE_CONTRACTS_QUERY);
    return recordset.map((r) => ({
      id: r.SMIC_ID,
      customerId: r.PS_CustomerID && Number(r.PS_CustomerID) > 0 ? String(r.PS_CustomerID) : null,
      name: r.DisplayName,
      amount: r.SMIC_PaymentAmount,
      totalPayments: r.SMIC_TotalPayments,
      startDate: r.SMIC_PayStartDate,
      endDate: r.SMIC_PayEndDate,
    }));
  } finally {
    await pool.close();
  }
}
