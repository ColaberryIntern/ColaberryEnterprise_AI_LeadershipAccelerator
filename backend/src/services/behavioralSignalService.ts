import { Op } from 'sequelize';
import {
  BehavioralSignal,
  PageEvent,
  Visitor,
  VisitorSession,
} from '../models';

/**
 * Signal type definitions with base strength values.
 * Strength is on a 1-100 scale: higher = stronger buying intent.
 */
const SIGNAL_DEFINITIONS: Record<string, { strength: number; description: string }> = {
  // High-intent page visits
  pricing_visit:         { strength: 35, description: 'Visited pricing page' },
  enroll_page_visit:     { strength: 45, description: 'Visited enrollment page' },
  contact_page_visit:    { strength: 30, description: 'Visited contact page' },
  strategy_call_visit:   { strength: 40, description: 'Visited strategy call prep page' },
  advisory_page_visit:   { strength: 25, description: 'Visited advisory page' },

  // Engagement depth signals
  deep_scroll_program:   { strength: 25, description: 'Deep scroll on program page (>75%)' },
  deep_scroll_pricing:   { strength: 30, description: 'Deep scroll on pricing page (>75%)' },
  deep_scroll_case_study:{ strength: 20, description: 'Deep scroll on case studies (>75%)' },

  // CTA interactions
  cta_click_enroll:      { strength: 40, description: 'Clicked enrollment CTA' },
  cta_click_contact:     { strength: 30, description: 'Clicked contact CTA' },
  cta_click_strategy:    { strength: 35, description: 'Clicked strategy call CTA' },
  cta_click_other:       { strength: 15, description: 'Clicked a CTA' },

  // Form interactions
  form_started:          { strength: 30, description: 'Started filling out a form' },
  form_submitted:        { strength: 50, description: 'Submitted a form' },

  // Session behavior
  return_visit:          { strength: 25, description: 'Returned to the site' },
  multi_page_session:    { strength: 15, description: 'Viewed 3+ pages in a session' },
  long_session:          { strength: 20, description: 'Session lasted 5+ minutes' },
  extended_time_on_page: { strength: 15, description: 'Spent 3+ minutes on a single page' },

  // Multi-category browsing
  research_pattern:      { strength: 30, description: 'Viewed program + pricing + case studies' },
  evaluation_pattern:    { strength: 45, description: 'Viewed pricing + enroll page' },
};

/**
 * Detect behavioral signals from events within a single session.
 * Call this when a session closes or periodically for active sessions.
 * Returns the newly created signals (does not duplicate existing ones).
 */
export async function detectSessionSignals(sessionId: string): Promise<BehavioralSignal[]> {
  const session = await VisitorSession.findByPk(sessionId);
  if (!session) return [];

  const events = await PageEvent.findAll({
    where: { session_id: sessionId },
    order: [['timestamp', 'ASC']],
  });

  if (events.length === 0) return [];

  const visitorId = session.visitor_id;
  const leadId = session.lead_id || null;

  // Get existing signals for this session to avoid duplicates
  const existingSignals = await BehavioralSignal.findAll({
    where: { session_id: sessionId },
    attributes: ['signal_type'],
  });
  const existingTypes = new Set(existingSignals.map(s => s.signal_type));

  const newSignals: Array<{
    signal_type: string;
    signal_strength: number;
    context: Record<string, any>;
  }> = [];

  function addSignal(type: string, context: Record<string, any> = {}) {
    if (existingTypes.has(type)) return;
    const def = SIGNAL_DEFINITIONS[type];
    if (!def) return;
    existingTypes.add(type); // prevent duplicates within this run
    newSignals.push({
      signal_type: type,
      signal_strength: def.strength,
      context,
    });
  }

  // Categorize events
  const pageCategories = new Set<string>();
  const pageviewEvents = events.filter(e => e.event_type === 'pageview');
  const scrollEvents = events.filter(e => e.event_type === 'scroll');
  const ctaClickEvents = events.filter(e => e.event_type === 'cta_click');
  const formStartEvents = events.filter(e => e.event_type === 'form_start');
  const formSubmitEvents = events.filter(e => e.event_type === 'form_submit');
  const timeOnPageEvents = events.filter(e => e.event_type === 'time_on_page');

  // Collect page categories visited
  for (const ev of pageviewEvents) {
    if (ev.page_category) pageCategories.add(ev.page_category);
  }

  // --- High-intent page visit signals ---
  const categoryToSignal: Record<string, string> = {
    pricing: 'pricing_visit',
    enroll: 'enroll_page_visit',
    contact: 'contact_page_visit',
    strategy_call_prep: 'strategy_call_visit',
    advisory: 'advisory_page_visit',
  };

  for (const [category, signalType] of Object.entries(categoryToSignal)) {
    if (pageCategories.has(category)) {
      addSignal(signalType, { page_category: category });
    }
  }

  // --- Deep scroll signals ---
  for (const ev of scrollEvents) {
    const depth = ev.event_data?.depth_percent || 0;
    if (depth >= 75) {
      const cat = ev.page_category;
      if (cat === 'program') {
        addSignal('deep_scroll_program', { depth_percent: depth, page: ev.page_path });
      } else if (cat === 'pricing') {
        addSignal('deep_scroll_pricing', { depth_percent: depth, page: ev.page_path });
      } else if (cat === 'case_studies') {
        addSignal('deep_scroll_case_study', { depth_percent: depth, page: ev.page_path });
      }
    }
  }

  // --- CTA click signals ---
  for (const ev of ctaClickEvents) {
    const href = (ev.event_data?.href || '').toLowerCase();
    const text = (ev.event_data?.element_text || '').toLowerCase();

    if (href.includes('enroll') || text.includes('enroll')) {
      addSignal('cta_click_enroll', { href, text });
    } else if (href.includes('contact') || text.includes('contact')) {
      addSignal('cta_click_contact', { href, text });
    } else if (href.includes('strategy') || text.includes('strategy') || text.includes('call')) {
      addSignal('cta_click_strategy', { href, text });
    } else {
      addSignal('cta_click_other', { href, text });
    }
  }

  // --- Form signals ---
  if (formStartEvents.length > 0) {
    addSignal('form_started', {
      form_count: formStartEvents.length,
      pages: formStartEvents.map(e => e.page_path),
    });
  }
  if (formSubmitEvents.length > 0) {
    addSignal('form_submitted', {
      form_count: formSubmitEvents.length,
      pages: formSubmitEvents.map(e => e.page_path),
    });
  }

  // --- Session behavior signals ---
  if (pageviewEvents.length >= 3) {
    addSignal('multi_page_session', { pageview_count: pageviewEvents.length });
  }

  if (session.duration_seconds >= 300) {
    addSignal('long_session', { duration_seconds: session.duration_seconds });
  }

  // Extended time on a single page (3+ minutes)
  for (const ev of timeOnPageEvents) {
    const seconds = ev.event_data?.seconds || 0;
    if (seconds >= 180) {
      addSignal('extended_time_on_page', {
        seconds,
        page: ev.page_path,
        page_category: ev.page_category,
      });
      break; // one signal per session
    }
  }

  // --- Multi-category patterns ---
  if (pageCategories.has('program') && pageCategories.has('pricing') && pageCategories.has('case_studies')) {
    addSignal('research_pattern', { categories: Array.from(pageCategories) });
  }
  if (pageCategories.has('pricing') && pageCategories.has('enroll')) {
    addSignal('evaluation_pattern', { categories: Array.from(pageCategories) });
  }

  // --- Return visit detection (cross-session) ---
  const totalSessions = await VisitorSession.count({
    where: { visitor_id: visitorId },
  });
  if (totalSessions >= 2) {
    // Check if we already have a return_visit signal for this visitor at all
    const existingReturnSignal = await BehavioralSignal.findOne({
      where: { visitor_id: visitorId, signal_type: 'return_visit' },
      order: [['detected_at', 'DESC']],
    });
    // Only emit if last return_visit signal was >24h ago or none exists
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (!existingReturnSignal || existingReturnSignal.detected_at < oneDayAgo) {
      addSignal('return_visit', { session_count: totalSessions });
    }
  }

  // Bulk create all new signals
  const now = new Date();
  const created: BehavioralSignal[] = [];
  for (const sig of newSignals) {
    const record = await BehavioralSignal.create({
      visitor_id: visitorId,
      session_id: sessionId,
      lead_id: leadId,
      signal_type: sig.signal_type,
      signal_strength: sig.signal_strength,
      context: sig.context,
      detected_at: now,
    } as any);
    created.push(record);
  }

  return created;
}

/**
 * Detect signals for all sessions that ended recently (last 35 minutes)
 * but haven't been analyzed yet. Called by the scheduler.
 */
export async function detectSignalsForRecentSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 35 * 60 * 1000);

  // Find sessions that had their last event >30min ago (effectively closed)
  // but haven't been signal-analyzed yet
  const sessions = await VisitorSession.findAll({
    where: {
      started_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    order: [['started_at', 'DESC']],
    limit: 100,
  });

  let signalsDetected = 0;

  for (const session of sessions) {
    // Check if session's last event was >30min ago (session closed)
    const lastEvent = await PageEvent.findOne({
      where: { session_id: session.id },
      order: [['timestamp', 'DESC']],
    });

    if (!lastEvent) continue;
    if (lastEvent.timestamp > cutoff) continue; // still active

    const signals = await detectSessionSignals(session.id);
    signalsDetected += signals.length;
  }

  return signalsDetected;
}

/**
 * Get all signals for a visitor, ordered by most recent.
 */
export async function getVisitorSignals(
  visitorId: string,
  limit = 50
): Promise<BehavioralSignal[]> {
  return BehavioralSignal.findAll({
    where: { visitor_id: visitorId },
    order: [['detected_at', 'DESC']],
    limit,
  });
}

/**
 * Get signal summary for a visitor: count per type + total strength.
 */
export async function getVisitorSignalSummary(visitorId: string): Promise<{
  total_signals: number;
  total_strength: number;
  signal_types: Record<string, { count: number; total_strength: number }>;
}> {
  const signals = await BehavioralSignal.findAll({
    where: { visitor_id: visitorId },
  });

  const signalTypes: Record<string, { count: number; total_strength: number }> = {};
  let totalStrength = 0;

  for (const sig of signals) {
    totalStrength += sig.signal_strength;
    if (!signalTypes[sig.signal_type]) {
      signalTypes[sig.signal_type] = { count: 0, total_strength: 0 };
    }
    signalTypes[sig.signal_type].count++;
    signalTypes[sig.signal_type].total_strength += sig.signal_strength;
  }

  return {
    total_signals: signals.length,
    total_strength: totalStrength,
    signal_types: signalTypes,
  };
}

/**
 * Get the signal definition metadata (for UI display).
 */
export function getSignalDefinitions(): Record<string, { strength: number; description: string }> {
  return { ...SIGNAL_DEFINITIONS };
}
