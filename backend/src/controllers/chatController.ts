import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import {
  startConversation,
  sendMessage,
  closeConversation,
  getConversationHistory,
  checkProactiveChat,
  updateConversationContext,
} from '../services/chatService';
import { categorizePagePath } from '../services/visitorTrackingService';

// ---------------------------------------------------------------------------
// POST /api/chat/start — Start a new conversation
// ---------------------------------------------------------------------------

export async function handleChatStart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.status(204).end();
      return;
    }

    const { visitor_id, session_id, page_url, page_path, trigger_type, trigger_context } = req.body;

    if (!visitor_id || typeof visitor_id !== 'string') {
      res.status(400).json({ error: 'visitor_id is required' });
      return;
    }

    const pageCategory = page_path ? categorizePagePath(page_path) : 'homepage';

    const result = await startConversation({
      visitorId: visitor_id,
      sessionId: session_id || null,
      pageUrl: page_url || '',
      pageCategory,
      triggerType: trigger_type || 'visitor_initiated',
      triggerContext: trigger_context || null,
    });

    res.json(result);
  } catch (err) {
    console.error('[Chat] Start error:', (err as Error).message);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/message — Send a message
// ---------------------------------------------------------------------------

export async function handleChatMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.status(204).end();
      return;
    }

    const { conversation_id, content } = req.body;

    if (!conversation_id || typeof conversation_id !== 'string') {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }
    if (!content || typeof content !== 'string' || content.length > 2000) {
      res.status(400).json({ error: 'content is required (max 2000 chars)' });
      return;
    }

    const result = await sendMessage(conversation_id, content);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'Conversation not found' || message === 'Conversation is closed') {
      res.status(400).json({ error: message });
      return;
    }
    console.error('[Chat] Message error:', message);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/close — Close a conversation
// ---------------------------------------------------------------------------

export async function handleChatClose(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.status(204).end();
      return;
    }

    const { conversation_id } = req.body;

    if (!conversation_id || typeof conversation_id !== 'string') {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    await closeConversation(conversation_id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] Close error:', (err as Error).message);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/chat/history/:id — Get conversation messages
// ---------------------------------------------------------------------------

export async function handleChatHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.status(204).end();
      return;
    }

    const messages = await getConversationHistory(req.params.id as string);
    res.json(messages);
  } catch (err) {
    console.error('[Chat] History error:', (err as Error).message);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/chat/proactive-check — Check if visitor should see proactive chat
// ---------------------------------------------------------------------------

export async function handleProactiveCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.json({ show_proactive: false });
      return;
    }

    const visitorId = req.query.visitor_id as string;
    if (!visitorId) {
      res.json({ show_proactive: false });
      return;
    }

    const result = await checkProactiveChat(visitorId);
    res.json(result || { show_proactive: false });
  } catch (err) {
    // Non-critical — don't break the page
    res.json({ show_proactive: false });
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/context-update — Update page context mid-conversation
// ---------------------------------------------------------------------------

export async function handleContextUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableChat) {
      res.status(204).end();
      return;
    }

    const { conversation_id, page_url, page_path } = req.body;

    if (!conversation_id || typeof conversation_id !== 'string') {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    const pageCategory = page_path ? categorizePagePath(page_path) : 'homepage';

    await updateConversationContext(conversation_id, page_url || '', pageCategory);
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] Context update error:', (err as Error).message);
    next(err);
  }
}
