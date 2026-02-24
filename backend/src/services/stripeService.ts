import Stripe from 'stripe';
import { env } from '../config/env';

const stripe = new Stripe(env.stripeSecretKey);

export async function createCheckoutSession(params: {
  cohortId: string;
  fullName: string;
  email: string;
  company: string;
  title?: string;
  phone?: string;
  companySize?: string;
  couponCode?: string;
}): Promise<Stripe.Checkout.Session> {
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: params.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Enterprise AI Leadership Accelerator',
            description: `Cohort enrollment for ${params.fullName}`,
          },
          unit_amount: 450000, // $4,500 in cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      cohort_id: params.cohortId,
      full_name: params.fullName,
      company: params.company,
      email: params.email,
      title: params.title || '',
      phone: params.phone || '',
      company_size: params.companySize || '',
    },
    success_url: `${env.frontendUrl}/enroll/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.frontendUrl}/enroll/cancel`,
    allow_promotion_codes: true,
  };

  // Apply coupon if provided directly
  if (params.couponCode) {
    sessionParams.discounts = [{ coupon: params.couponCode }];
    // Disable promotion codes when a specific coupon is applied
    delete sessionParams.allow_promotion_codes;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export function constructWebhookEvent(
  payload: Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    env.stripeWebhookSecret
  );
}

export async function retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId);
}
