/**
 * Public unsubscribe routes — one-click opt-out (RFC 8058) + human link.
 * No auth: these are reached by mailbox providers and recipients directly.
 * The opt-out is authorized by the signed token in the query, not a session.
 */
import express, { Router } from 'express';
import { handleUnsubscribeGet, handleUnsubscribePost } from '../controllers/unsubscribeController';

const router = Router();

// Human clicks the visible link / mail client GETs the List-Unsubscribe URL.
router.get('/api/unsubscribe', handleUnsubscribeGet);

// RFC 8058 one-click: providers POST `List-Unsubscribe=One-Click` as form data.
// We authorize off the query token and ignore the body, but parse it so the
// request stream is drained cleanly.
router.post('/api/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribePost);

export default router;
