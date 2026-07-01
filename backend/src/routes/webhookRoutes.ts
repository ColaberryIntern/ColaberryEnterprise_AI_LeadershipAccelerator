import { Router } from 'express';
import express from 'express';
import { handlePaySimpleWebhook } from '../controllers/webhookController';
import { handleMandrillWebhook, handleMandrillWebhookHead, handleMandrillInbound } from '../controllers/mandrillWebhookController';
import { handleGhlSmsReply } from '../controllers/ghlWebhookController';
import { handleSynthflowCallComplete } from '../controllers/synthflowWebhookController';
import { handleApolloPhoneReveal } from '../controllers/apolloWebhookController';
import { handleAdvisoryWebhook, handleAdvisoryWebhookHead } from '../controllers/advisorySyncController';
import { handleBuildPlanWebhook, handleBuildPlanWebhookHead } from '../controllers/buildPlanWebhookController';

const router = Router();

// Capture the raw body alongside the parsed one so HMAC can be verified over
// the exact bytes the sender signed (re-serializing a parsed body is lossy
// across languages). Used by the build-plan webhook.
const jsonWithRawBody = express.json({
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody: Buffer }).rawBody = buf;
  },
});

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

// Apollo phone number reveal webhook — async phone enrichment callback
router.post('/api/webhook/apollo/phone-reveal', express.json(), handleApolloPhoneReveal);

// Advisory sync webhook — Agent Foundry (AI Workforce Designer) events
router.head('/api/webhooks/advisory', handleAdvisoryWebhookHead);
router.post('/api/webhooks/advisory', express.json(), handleAdvisoryWebhook);

// Build-plan webhook — Story-Driven Build engine (AI Project Architect) pushes a
// generated deep_plan.json to be ingested as native student sprints/tasks.
// Raw-body JSON so HMAC verifies over the exact signed bytes.
router.head('/api/webhooks/build-plan', handleBuildPlanWebhookHead);
router.post('/api/webhooks/build-plan', jsonWithRawBody, handleBuildPlanWebhook);

export default router;
