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
}): Promise<HostedPaymentLink> {
  const amount = isTestMode() ? 0.01 : params.amount;

  if (isTestMode()) {
    console.log(`[PaySimple] TEST MODE ACTIVE - $${amount} transaction (production: $${params.amount})`);
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
/*  Webhook Signature Verification                                     */
/* ------------------------------------------------------------------ */

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!env.paysimpleWebhookSecret) {
    console.warn('[PaySimple] No webhook secret configured — skipping signature check');
    return true;
  }

  if (!signature) {
    console.warn('[PaySimple] Webhook received without signature header — processing anyway');
    return true;
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
