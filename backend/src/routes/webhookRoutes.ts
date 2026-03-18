import { Router } from 'express';
import express from 'express';
import { handlePaySimpleWebhook } from '../controllers/webhookController';
import { handleMandrillWebhook, handleMandrillWebhookHead, handleMandrillInbound } from '../controllers/mandrillWebhookController';
import { handleGhlSmsReply } from '../controllers/ghlWebhookController';
import { handleSynthflowCallComplete } from '../controllers/synthflowWebhookController';

const router = Router();

// PaySimple payment webhook — JSON body
router.post('/api/webhook/paysimple', express.json(), handlePaySimpleWebhook);

// Mandrill webhook — uses URL-encoded body (mandrill_events=<JSON>)
router.head('/api/webhook/mandrill', handleMandrillWebhookHead);
router.post('/api/webhook/mandrill', express.urlencoded({ extended: false }), handleMandrillWebhook);

// Mandrill inbound email reply webhook — URL-encoded body
router.head('/api/webhook/mandrill/inbound', handleMandrillWebhookHead);
router.post('/api/webhook/mandrill/inbound', express.urlencoded({ extended: false }), handleMandrillInbound);

// GHL SMS reply webhook — JSON body from GHL Workflow
router.post('/api/webhook/ghl/sms-reply', express.json(), handleGhlSmsReply);

// Synthflow voice call completion webhook — JSON body from Synthflow
router.post('/api/webhook/synthflow/call-complete', express.json(), handleSynthflowCallComplete);

export default router;
