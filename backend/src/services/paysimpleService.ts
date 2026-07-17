import crypto from 'crypto';
import { env } from '../config/env';

/* ------------------------------------------------------------------ */
/*  PaySimple API Service                                              */
/*  Handles customer management and hosted payment link creation       */
/* ------------------------------------------------------------------ */

const SANDBOX_BASE = 'https://sandbox-api.paysimple.com';
const LIVE_BASE = 'https://api.paysimple.com';

function getBaseUrl(): string {
  return env.paysimpleEnv === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

/**
 * PaySimple API authentication.
 * Uses plain-text basic scheme: "basic {ApiUser}:{ApiKey}" (no Base64 encoding).
 * Ref: https://documentation.paysimple.com/reference/authentication-overview
 */
function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `basic ${env.paysimpleApiUser}:${env.paysimpleApiKey}`,
    'Content-Type': 'application/json',
  };
}

const isTestMode = (): boolean => env.paymentMode === 'test';

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const options: RequestInit = {
    method,
    headers: getAuthHeaders(),
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[PaySimple] ${method} ${path}${isTestMode() ? ' (TEST MODE)' : ''}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[PaySimple] API error ${response.status}: ${errorBody}`);
    throw new Error(`PaySimple API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  return data.Response ?? data.data ?? data;
}

/* ------------------------------------------------------------------ */
/*  Customer Management (API v4)                                       */
/* ------------------------------------------------------------------ */

export interface PaySimpleCustomer {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Company: string;
  Phone?: string;
}

export async function createCustomer(params: {
  fullName: string;
  email: string;
  company: string;
  phone?: string;
}): Promise<PaySimpleCustomer> {
  const nameParts = params.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || params.fullName;
  const lastName = nameParts.slice(1).join(' ') || '-';

  // Phone must be 10 digits numeric only (PaySimple validation)
  const cleanPhone = params.phone?.replace(/\D/g, '').slice(0, 10);

  return apiRequest<PaySimpleCustomer>('POST', '/v4/customer', {
    FirstName: firstName,
    LastName: lastName,
    Email: params.email,
    Company: params.company,
    Phone: cleanPhone && cleanPhone.length === 10 ? cleanPhone : undefined,
  });
}

export async function findCustomerByEmail(
  email: string
): Promise<PaySimpleCustomer | null> {
  try {
    const results = await apiRequest<PaySimpleCustomer[]>(
      'GET',
      `/v4/customer?email=${encodeURIComponent(email)}`
    );
    return Array.isArray(results) && results.length > 0 ? results[0] : null;
  } catch {
    return null;
  }
}

export async function findOrCreateCustomer(params: {
  fullName: string;
  email: string;
  company: string;
  phone?: string;
}): Promise<PaySimpleCustomer> {
  const existing = await findCustomerByEmail(params.email);
  if (existing) {
    console.log(`[PaySimple] Found existing customer ${existing.Id} for ${params.email}`);
    return existing;
  }
  const customer = await createCustomer(params);
  console.log(`[PaySimple] Created customer ${customer.Id} for ${params.email}`);
  return customer;
}

/* ------------------------------------------------------------------ */
/*  Hosted Payment Links (API v5 — POST /ps/payment_link)              */
/* ------------------------------------------------------------------ */

export interface HostedPaymentLink {
  id: string;
  payment_link: string;
}

export async function createPaymentLink(params: {
  externalId: string;
  cohortName: string;
  amount: number;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  // When true, charge `amount` verbatim even in test mode (used by subscriptions,
  // which set their own small test amounts). Otherwise test mode forces $0.01.
  exactAmount?: boolean;
}): Promise<HostedPaymentLink> {
  const amount = (isTestMode() && !params.exactAmount) ? 0.01 : params.amount;

  if (isTestMode()) {
    console.log(`[PaySimple] TEST MODE${params.exactAmount ? ' (exact amount)' : ''} - $${amount} transaction (list price: $${params.amount})`);
  }

  const result = await apiRequest<HostedPaymentLink>('POST', '/ps/payment_link', {
    external_id: params.externalId,
    external_id_label: 'Enrollment:',
    item: {
      price: amount,
      allow_price_entry: false,
      name: `AI Leadership Accelerator - ${params.cohortName}`,
      description: isTestMode()
        ? `TEST MODE - Colaberry Enterprise AI Leadership Accelerator enrollment (original: $${params.amount})`
        : 'Colaberry Enterprise AI Leadership Accelerator enrollment',
    },
    customer: {
      first_name: params.customerFirstName,
      last_name: params.customerLastName,
      email: params.customerEmail,
    },
    checkout_config: {
      company: {
        name: 'Colaberry Enterprise AI',
        email: 'info@colaberry.com',
      },
      payment_acceptance: ['credit_card', 'bank_account'],
    },
  });

  console.log(`[PaySimple] Payment link created: ${result.payment_link} (id: ${result.id})`);
  return result;
}

export async function deletePaymentLink(linkId: string): Promise<void> {
  await apiRequest('DELETE', `/ps/payment_link/${linkId}`);
  console.log(`[PaySimple] Deleted payment link ${linkId}`);
}

/* ------------------------------------------------------------------ */
/*  Full Enrollment Flow                                               */
/* ------------------------------------------------------------------ */

export interface CreateInvoiceResult {
  customerId: number;
  paymentLinkId: string;
  externalId: string;
  amount: number;
  paymentLink: string;
  mode: 'test' | 'live';
}

export async function createEnrollmentInvoice(params: {
  fullName: string;
  email: string;
  company: string;
  phone?: string;
  cohortName: string;
  amount?: number;
}): Promise<CreateInvoiceResult> {
  const amount = params.amount || 4500;

  // 1. Find or create customer in PaySimple (v4)
  const customer = await findOrCreateCustomer({
    fullName: params.fullName,
    email: params.email,
    company: params.company,
    phone: params.phone,
  });

  // 2. Create hosted payment link (v5)
  const nameParts = params.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || params.fullName;
  const lastName = nameParts.slice(1).join(' ') || '-';

  const externalId = `CB-${customer.Id}-${Date.now()}`;

  const link = await createPaymentLink({
    externalId,
    cohortName: params.cohortName,
    amount,
    customerFirstName: firstName,
    customerLastName: lastName,
    customerEmail: params.email,
  });

  return {
    customerId: customer.Id,
    paymentLinkId: link.id,
    externalId,
    amount: isTestMode() ? 0.01 : amount,
    paymentLink: link.payment_link,
    mode: isTestMode() ? 'test' : 'live',
  };
}

/* ------------------------------------------------------------------ */
/*  Payments listing (API v4 — GET /v4/payment) — pull for reconcile   */
/* ------------------------------------------------------------------ */

// Loosely-typed PaySimple payment record; normalized in paymentSyncService with
// field fallbacks (the exact envelope varies by API version and we can't exercise
// the live API from local dev).
export interface PaySimplePayment {
  Id?: number | string;
  CustomerId?: number | string;
  CustomerFirstName?: string;
  CustomerLastName?: string;
  Email?: string;
  Amount?: number;
  Status?: string;
  PaymentType?: string;
  PaymentDate?: string;
  [k: string]: unknown;
}

// Low-level GET preserving the FULL envelope (Response + Meta) with an explicit
// timeout and capped, backoff'd retries on transient failures. apiRequest()
// unwraps to data.Response and drops Meta, which we need for pagination.
// Failure-first: bounded attempts; hard 4xx is NOT retried.
async function apiGetRaw(
  path: string,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<any> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const maxRetries = opts?.retries ?? 3;
  const url = `${getBaseUrl()}${path}`;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let transient = false;
    try {
      const response = await fetch(url, { method: 'GET', headers: getAuthHeaders(), signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return await response.json();
      const errorBody = await response.text().catch(() => '');
      if (response.status === 429 || response.status >= 500) {
        transient = true;
        throw new Error(`PaySimple transient ${response.status}: ${errorBody}`);
      }
      throw new Error(`PaySimple API error ${response.status}: ${errorBody}`);
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;
      const retryable =
        transient || err?.name === 'AbortError' || err?.code === 'ECONNRESET' ||
        /transient|fetch failed|network|timeout/i.test(String(err?.message));
      if (retryable && attempt < maxRetries) {
        const backoff = Math.min(2000 * 2 ** attempt, 15000);
        console.warn(`[PaySimple] GET ${path} attempt ${attempt + 1} failed (${err?.message}); retry in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('PaySimple GET failed');
}

// Pull payments from PaySimple, paging until exhausted. maxPages is a hard
// backstop so a bad Meta can never loop forever.
export async function listPayments(
  params: { since?: Date; until?: Date; maxPages?: number; pageSize?: number } = {}
): Promise<PaySimplePayment[]> {
  const pageSize = params.pageSize ?? 200;
  const maxPages = params.maxPages ?? 100;
  const out: PaySimplePayment[] = [];
  const base: string[] = [`pagesize=${pageSize}`, 'sortby=PaymentDate', 'direction=DESC'];
  if (params.since) base.push(`startdate=${encodeURIComponent(params.since.toISOString().slice(0, 10))}`);
  if (params.until) base.push(`enddate=${encodeURIComponent(params.until.toISOString().slice(0, 10))}`);

  for (let page = 1; page <= maxPages; page++) {
    const body = await apiGetRaw(`/v4/payment?${base.join('&')}&page=${page}`);
    const rows: PaySimplePayment[] = body?.Response ?? body?.data ?? (Array.isArray(body) ? body : []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    const totalPages = body?.Meta?.Pagination?.TotalPages;
    if (typeof totalPages === 'number' && page >= totalPages) break;
    if (rows.length < pageSize) break;
    if (page === maxPages) console.warn(`[PaySimple] listPayments hit maxPages=${maxPages}; may be truncated`);
  }
  console.log(`[PaySimple] listPayments pulled ${out.length} payment(s)`);
  return out;
}

// Fetch a single customer (email resolution when a payment can't be matched by
// external id or stored customer id). Best-effort — null on any failure.
export async function getCustomerById(customerId: string | number): Promise<PaySimpleCustomer | null> {
  try {
    const body = await apiGetRaw(`/v4/customer/${customerId}`);
    const c = body?.Response ?? body?.data ?? body;
    return c && (c.Id || c.Email) ? (c as PaySimpleCustomer) : null;
  } catch (err: any) {
    console.warn(`[PaySimple] getCustomerById ${customerId} failed: ${err?.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Webhook Signature Verification                                     */
/* ------------------------------------------------------------------ */

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined
): boolean {
  // When no secret is configured, we have nothing to verify against — fall
  // back to permissive (typical for local dev / pre-integration environments).
  if (!env.paysimpleWebhookSecret) {
    console.warn('[PaySimple] No webhook secret configured — skipping signature check');
    return true;
  }

  // Behavioral change 2026-05-17: previously this branch returned true with
  // a warning log, silently accepting unsigned webhooks even when a secret
  // WAS configured. That was effectively a security vuln — anyone could
  // POST to the webhook endpoint and claim to be PaySimple. Now we reject.
  // If PaySimple is genuinely sending unsigned webhooks, the upstream
  // integration needs to be fixed; falling back to "accept anyway" hid the
  // real problem.
  if (!signature) {
    console.warn('[PaySimple] Webhook secret IS configured but request has no signature header — rejecting');
    return false;
  }

  // PaySimple HMAC verification
  const expected = crypto
    .createHmac('sha256', env.paysimpleWebhookSecret)
    .update(payload)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
