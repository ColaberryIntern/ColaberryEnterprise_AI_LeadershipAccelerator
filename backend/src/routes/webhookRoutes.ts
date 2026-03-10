import { Router } from 'express';
import express from 'express';
import { handleStripeWebhook } from '../controllers/webhookController';
import { handleMandrillWebhook, handleMandrillWebhookHead } from '../controllers/mandrillWebhookController';
import { handleGhlSmsReply } from '../controllers/ghlWebhookController';
import { handleSynthflowCallComplete } from '../controllers/synthflowWebhookController';

const router = Router();

// Note: This route is mounted with express.raw() middleware in server.ts
// It does NOT go through express.json()
router.post('/api/webhook', handleStripeWebhook);

// Mandrill webhook — uses URL-encoded body (mandrill_events=<JSON>)
router.head('/api/webhook/mandrill', handleMandrillWebhookHead);
router.post('/api/webhook/mandrill', express.urlencoded({ extended: false }), handleMandrillWebhook);

// GHL SMS reply webhook — JSON body from GHL Workflow
router.post('/api/webhook/ghl/sms-reply', express.json(), handleGhlSmsReply);

// Synthflow voice call completion webhook — JSON body from Synthflow
router.post('/api/webhook/synthflow/call-complete', express.json(), handleSynthflowCallComplete);

export default router;
