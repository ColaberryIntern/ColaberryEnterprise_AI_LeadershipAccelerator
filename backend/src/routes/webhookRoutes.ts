import { Router } from 'express';
import express from 'express';
import { handlePaySimpleWebhook } from '../controllers/webhookController';
import { handleMandrillWebhook, handleMandrillWebhookHead, handleMandrillInbound } from '../controllers/mandrillWebhookController';
import { handleGhlSmsReply } from '../controllers/ghlWebhookController';
import { handleSynthflowCallComplete } from '../controllers/synthflowWebhookController';
import { handleApolloPhoneReveal } from '../controllers/apolloWebhookController';
import { handleAdvisoryWebhook, handleAdvisoryWebhookHead } from '../controllers/advisorySyncController';

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

// Apollo phone number reveal webhook — async phone enrichment callback
router.post('/api/webhook/apollo/phone-reveal', express.json(), handleApolloPhoneReveal);

// Advisory sync webhook — Agent Foundry (AI Workforce Designer) events
router.head('/api/webhooks/advisory', handleAdvisoryWebhookHead);
router.post('/api/webhooks/advisory', express.json(), handleAdvisoryWebhook);

// GitHub push webhook — raw body required for HMAC-SHA256 signature validation
router.post('/api/webhook/github', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) { res.status(401).json({ error: 'Missing X-Hub-Signature-256' }); return; }

  const { validateWebhookSignature, findEnrollmentByRepo, syncStudentActivity } = await import('../services/githubIntegrationService');

  if (!validateWebhookSignature(req.body as Buffer, signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse((req.body as Buffer).toString('utf-8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const owner: string | undefined = payload.repository?.owner?.login;
  const repo: string | undefined = payload.repository?.name;

  if (owner && repo) {
    const enrollmentId = await findEnrollmentByRepo(owner, repo);
    if (enrollmentId) {
      syncStudentActivity(enrollmentId).catch((err: Error) => {
        console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'github_webhook_sync_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message, owner, repo } }));
      });
    }
  }

  res.status(200).json({ ok: true });
});

export default router;
