import { Op } from 'sequelize';
import {
  Lead,
  Visitor,
  VisitorSession,
  PageEvent,
  BehavioralSignal,
  CampaignLead,
  Campaign,
  InteractionOutcome,
  ChatConversation,
  Activity,
  Appointment,
  LeadTemperatureHistory,
} from '../models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JourneyTimelineEvent {
  id: string;
  timestamp: string;
  category: 'website' | 'signal' | 'campaign' | 'interaction' | 'conversation' | 'appointment' | 'activity' | 'temperature' | 'pipeline';
  event_type: string;
  title: string;
  detail?: string;
  metadata?: Record<string, any>;
  journey_stage: 'awareness' | 'interest' | 'consideration' | 'evaluation' | 'decision';
  source_table: string;
  source_id: string;
}

export interface JourneyStageProgression {
  stage: string;
  entered_at: string;
  touchpoints: number;
}

export interface JourneyMetrics {
  total_touchpoints: number;
  first_touch_at: string | null;
  latest_touch_at: string | null;
  journey_duration_days: number;
  current_stage: string;
  time_in_current_stage_days: number;
  stage_progression: JourneyStageProgression[];
  engagement_velocity: number;
  stall_detected: boolean;
  days_since_last_touchpoint: number;
}

export interface JourneyTimeline {
  lead_id?: number;
  visitor_id?: string;
  lead_name?: string;
  company?: string;
  events: JourneyTimelineEvent[];
  metrics: JourneyMetrics;
  stage_summary: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Stage inference
// ---------------------------------------------------------------------------

const STAGE_ORDER = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'] as const;

function inferStage(category: string, eventType: string, detail?: string, metadata?: Record<string, any>): JourneyTimelineEvent['journey_stage'] {
  // Decision signals
  if (eventType === 'converted' || eventType === 'enrollment_close') return 'decision';
  if (category === 'pipeline' && (detail?.includes('negotiation') || detail?.includes('enrolled'))) return 'decision';
  if (category === 'website' && metadata?.page_category === 'enroll') return 'decision';

  // Evaluation signals
  if (category === 'interaction' && ['replied', 'clicked', 'booked_meeting', 'answered'].includes(eventType)) return 'evaluation';
  if (category === 'appointment' && ['strategy_call', 'demo'].includes(eventType)) return 'evaluation';
  if (category === 'campaign' && eventType === 'enrolled') return 'evaluation';

  // Consideration signals
  if (category === 'conversation') return 'consideration';
  if (category === 'signal' && (metadata?.signal_strength ?? 0) >= 25) return 'consideration';
  if (category === 'website' && metadata?.page_category === 'contact') return 'consideration';
  if (category === 'activity' && ['email_sent', 'call', 'meeting'].includes(eventType)) return 'consideration';
  if (eventType === 'form_submitted' || eventType === 'form_started') return 'consideration';

  // Interest signals
  if (category === 'signal') return 'interest';
  if (category === 'website' && metadata?.page_category === 'pricing') return 'interest';
  if (category === 'website' && metadata?.is_return_visit) return 'interest';
  if (category === 'website' && (metadata?.pageview_count ?? 0) > 3) return 'interest';
  if (category === 'temperature') return 'interest';

  // Default: awareness
  return 'awareness';
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchSessionEvents(visitorId: string): Promise<JourneyTimelineEvent[]> {
  const sessions = await VisitorSession.findAll({
    where: { visitor_id: visitorId },
    order: [['started_at', 'ASC']],
    limit: 100,
  });

  return sessions.map((s: any) => ({
    id: s.id,
    timestamp: s.started_at?.toISOString?.() || s.started_at,
    category: 'website' as const,
    event_type: 'session',
    title: `Website session (${s.pageview_count || 0} pages, ${Math.round((s.duration_seconds || 0) / 60)}min)`,
    detail: s.entry_page ? `Entry: ${s.entry_page}${s.exit_page ? ` → Exit: ${s.exit_page}` : ''}` : undefined,
    metadata: {
      pageview_count: s.pageview_count,
      duration_seconds: s.duration_seconds,
      is_bounce: s.is_bounce,
      page_category: s.landing_page_category,
      is_return_visit: false, // will be determined by position
    },
    journey_stage: 'awareness' as const,
    source_table: 'visitor_sessions',
    source_id: s.id,
  }));
}

async function fetchPageEvents(visitorId: string, leadId?: number): Promise<JourneyTimelineEvent[]> {
  // Collect all visitor_ids linked to this lead
  const visitorIds: string[] = [];
  if (visitorId) visitorIds.push(visitorId);
  if (leadId) {
    try {
      const { Visitor } = require('../models');
      const linkedVisitors = await Visitor.findAll({ where: { lead_id: leadId }, attributes: ['id'] });
      for (const v of linkedVisitors) {
        if (v.id && !visitorIds.includes(v.id)) visitorIds.push(v.id);
      }
    } catch { /* non-blocking */ }
  }
  if (visitorIds.length === 0) return [];

  const events = await PageEvent.findAll({
    where: { visitor_id: { [Op.in]: visitorIds } },
    order: [['timestamp', 'ASC']],
    limit: 200,
  });

  const titleMap: Record<string, (e: any) => string> = {
    form_submit: (e) => `Form submitted on ${e.page_category || e.page_path}`,
    form_start: (e) => `Form started on ${e.page_category || e.page_path}`,
    cta_click: (e) => `CTA clicked: ${e.event_data?.element_text || e.event_data?.cta_name || 'action'}`,
    pageview: (e) => `Visited ${e.page_path || e.page_title || 'page'}`,
    scroll: (e) => `Scrolled to ${e.event_data?.depth || '?'}% on ${e.page_path || 'page'}`,
    booking_modal_opened: (e) => `Opened booking modal (${e.event_data?.dates_available || 0} dates, ${e.event_data?.total_slots || 0} slots${e.event_data?.has_prefill ? ', pre-filled' : ''})`,
    booking_date_selected: (e) => `Selected date: ${e.event_data?.date || 'unknown'}`,
    booking_time_selected: (e) => `Selected time slot: ${e.event_data?.slot_start || 'unknown'}`,
    book_strategy_call_click: () => 'Submitted booking form',
    time_on_page: (e) => `Spent ${e.event_data?.seconds || '?'}s on page`,
    heartbeat: () => 'Still on page',
    media_play: (e) => `Played ${e.event_data?.element_tag || 'media'}: ${e.event_data?.element_text || 'content'}`,
    embed_click: (e) => `Interacted with embed: ${e.event_data?.element_text || 'content'}`,
    click: (e) => `Clicked ${e.event_data?.element_tag || 'element'}: ${(e.event_data?.element_text || '').slice(0, 60)}`,
    demo_start: () => 'Started AI Workforce Designer demo',
    demo_complete: () => 'Watched full AI Workforce Designer demo',
    demo_skip: () => 'Skipped AI Workforce Designer demo',
    demo_to_input_focus: () => 'Transitioned from demo to input (ready to start)',
    demo_watch_click: () => 'Clicked "Watch Demo" button',
    demo_industry_click: (e) => `Clicked ${e.event_data?.industry || 'industry'} AI demo`,
  };

  return events.map((e: any) => {
    const type = e.event_type;
    const titleFn = titleMap[type];
    const title = titleFn ? titleFn(e) : `${type} on ${e.page_category || e.page_path}`;
    const stage = ['booking_modal_opened', 'booking_date_selected', 'booking_time_selected', 'book_strategy_call_click'].includes(type)
      ? 'decision' as const
      : ['cta_click', 'form_start', 'form_submit', 'demo_start', 'demo_complete', 'demo_skip', 'demo_to_input_focus', 'demo_watch_click', 'demo_industry_click'].includes(type)
      ? 'consideration' as const
      : 'awareness' as const;

    return {
      id: e.id,
      timestamp: e.timestamp?.toISOString?.() || e.timestamp,
      category: 'website' as const,
      event_type: type === 'form_submit' ? 'form_submitted' : type === 'form_start' ? 'form_started' : type,
      title,
      detail: e.page_title || e.page_path,
      metadata: { page_category: e.page_category, event_data: e.event_data },
      journey_stage: stage,
      source_table: 'page_events',
      source_id: e.id,
    };
  });
}

async function fetchSignals(visitorId: string, leadId?: number): Promise<JourneyTimelineEvent[]> {
  const where: any = { visitor_id: visitorId };
  if (leadId) where[Op.or] = [{ visitor_id: visitorId }, { lead_id: leadId }];

  const signals = await BehavioralSignal.findAll({
    where: leadId ? { [Op.or]: [{ visitor_id: visitorId }, { lead_id: leadId }] } : { visitor_id: visitorId },
    order: [['detected_at', 'ASC']],
    limit: 200,
  });

  return signals.map((s: any) => ({
    id: s.id,
    timestamp: s.detected_at?.toISOString?.() || s.detected_at,
    category: 'signal' as const,
    event_type: s.signal_type,
    title: `Signal: ${s.signal_type.replace(/_/g, ' ')} (strength ${s.signal_strength})`,
    detail: s.context?.pages ? `Pages: ${s.context.pages.join(', ')}` : undefined,
    metadata: { signal_strength: s.signal_strength, context: s.context },
    journey_stage: 'interest' as const,
    source_table: 'behavioral_signals',
    source_id: s.id,
  }));
}

async function fetchCampaignEvents(leadId: number): Promise<JourneyTimelineEvent[]> {
  const enrollments = await CampaignLead.findAll({
    where: { lead_id: leadId },
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'type'] }],
    order: [['enrolled_at', 'ASC']],
  });

  return enrollments.map((cl: any) => ({
    id: cl.id,
    timestamp: cl.enrolled_at?.toISOString?.() || cl.enrolled_at,
    category: 'campaign' as const,
    event_type: 'enrolled',
    title: `Enrolled in campaign: ${cl.campaign?.name || 'Unknown'}`,
    detail: `Type: ${cl.campaign?.type || 'unknown'} | Status: ${cl.status} | Step ${cl.current_step_index || 0}/${cl.total_steps || 0}`,
    metadata: { campaign_type: cl.campaign?.type, status: cl.status, touchpoint_count: cl.touchpoint_count, response_count: cl.response_count },
    journey_stage: 'evaluation' as const,
    source_table: 'campaign_leads',
    source_id: cl.id,
  }));
}

async function fetchInteractions(leadId: number): Promise<JourneyTimelineEvent[]> {
  const outcomes = await InteractionOutcome.findAll({
    where: { lead_id: leadId },
    include: [{ model: Campaign, as: 'campaign', attributes: ['name'] }],
    order: [['created_at', 'ASC']],
    limit: 200,
  });

  return outcomes.map((o: any) => ({
    id: o.id,
    timestamp: o.created_at?.toISOString?.() || o.created_at,
    category: 'interaction' as const,
    event_type: o.outcome,
    title: `${o.channel} ${o.outcome.replace(/_/g, ' ')}${o.campaign ? ` (${o.campaign.name})` : ''}`,
    detail: o.step_index != null ? `Step ${o.step_index + 1}` : undefined,
    metadata: { channel: o.channel, step_index: o.step_index, campaign_name: o.campaign?.name },
    journey_stage: 'awareness' as const,
    source_table: 'interaction_outcomes',
    source_id: o.id,
  }));
}

async function fetchConversations(visitorId: string, leadId?: number): Promise<JourneyTimelineEvent[]> {
  const where: any = leadId ? { [Op.or]: [{ visitor_id: visitorId }, { lead_id: leadId }] } : { visitor_id: visitorId };

  const convos = await ChatConversation.findAll({
    where,
    order: [['started_at', 'ASC']],
  });

  return convos.map((c: any) => ({
    id: c.id,
    timestamp: c.started_at?.toISOString?.() || c.started_at,
    category: 'conversation' as const,
    event_type: c.trigger_type || 'chat',
    title: `Chat conversation (${c.message_count || 0} messages)`,
    detail: c.summary || `Page: ${c.page_category || c.page_url || 'unknown'} | Trigger: ${c.trigger_type || 'visitor'}`,
    metadata: { message_count: c.message_count, visitor_message_count: c.visitor_message_count, page_category: c.page_category, trigger_type: c.trigger_type },
    journey_stage: 'consideration' as const,
    source_table: 'chat_conversations',
    source_id: c.id,
  }));
}

async function fetchActivities(leadId: number): Promise<JourneyTimelineEvent[]> {
  const activities = await Activity.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'ASC']],
    limit: 200,
  });

  return activities.map((a: any) => ({
    id: a.id,
    timestamp: a.created_at?.toISOString?.() || a.created_at,
    category: 'activity' as const,
    event_type: a.type,
    title: a.subject || `${a.type.replace(/_/g, ' ')}`,
    detail: a.body ? a.body.substring(0, 150) : undefined,
    metadata: { type: a.type },
    journey_stage: 'awareness' as const,
    source_table: 'activities',
    source_id: a.id,
  }));
}

async function fetchAppointments(leadId: number): Promise<JourneyTimelineEvent[]> {
  const appts = await Appointment.findAll({
    where: { lead_id: leadId },
    order: [['scheduled_at', 'ASC']],
  });

  return appts.map((a: any) => ({
    id: a.id,
    timestamp: a.scheduled_at?.toISOString?.() || a.scheduled_at,
    category: 'appointment' as const,
    event_type: a.type,
    title: `${a.type.replace(/_/g, ' ')}: ${a.title || 'Appointment'}`,
    detail: `Status: ${a.status}${a.outcome_notes ? ` | ${a.outcome_notes.substring(0, 100)}` : ''}`,
    metadata: { type: a.type, status: a.status, duration_minutes: a.duration_minutes },
    journey_stage: 'evaluation' as const,
    source_table: 'appointments',
    source_id: a.id,
  }));
}

async function fetchTemperatureHistory(leadId: number): Promise<JourneyTimelineEvent[]> {
  const history = await LeadTemperatureHistory.findAll({
    where: { lead_id: leadId },
    order: [['created_at', 'ASC']],
  });

  return history.map((h: any) => ({
    id: h.id,
    timestamp: h.created_at?.toISOString?.() || h.created_at,
    category: 'temperature' as const,
    event_type: 'temperature_change',
    title: `Temperature: ${h.previous_temperature} → ${h.new_temperature}`,
    detail: h.trigger_detail || h.trigger_type,
    metadata: { previous: h.previous_temperature, current: h.new_temperature, trigger_type: h.trigger_type },
    journey_stage: 'interest' as const,
    source_table: 'lead_temperature_history',
    source_id: h.id,
  }));
}

// ---------------------------------------------------------------------------
// Metrics computation
// ---------------------------------------------------------------------------

function computeMetrics(events: JourneyTimelineEvent[]): JourneyMetrics {
  if (events.length === 0) {
    return {
      total_touchpoints: 0,
      first_touch_at: null,
      latest_touch_at: null,
      journey_duration_days: 0,
      current_stage: 'awareness',
      time_in_current_stage_days: 0,
      stage_progression: [],
      engagement_velocity: 0,
      stall_detected: false,
      days_since_last_touchpoint: 0,
    };
  }

  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstTouch = new Date(sorted[0].timestamp);
  const latestTouch = new Date(sorted[sorted.length - 1].timestamp);
  const now = new Date();
  const durationDays = Math.max(1, Math.round((latestTouch.getTime() - firstTouch.getTime()) / (1000 * 60 * 60 * 24)));
  const daysSinceLastTouch = Math.round((now.getTime() - latestTouch.getTime()) / (1000 * 60 * 60 * 24));

  // Stage progression
  const stageMap = new Map<string, { entered_at: string; touchpoints: number }>();
  let currentStage = 'awareness';
  const stageIdx = (s: string) => STAGE_ORDER.indexOf(s as any);

  for (const event of sorted) {
    const stage = event.journey_stage;
    if (!stageMap.has(stage)) {
      stageMap.set(stage, { entered_at: event.timestamp, touchpoints: 0 });
    }
    stageMap.get(stage)!.touchpoints++;
    if (stageIdx(stage) > stageIdx(currentStage)) {
      currentStage = stage;
    }
  }

  const stageProgression: JourneyStageProgression[] = [];
  for (const stage of STAGE_ORDER) {
    const entry = stageMap.get(stage);
    if (entry) {
      stageProgression.push({ stage, entered_at: entry.entered_at, touchpoints: entry.touchpoints });
    }
  }

  const currentStageEntry = stageMap.get(currentStage);
  const timeInCurrentStage = currentStageEntry
    ? Math.round((now.getTime() - new Date(currentStageEntry.entered_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Engagement velocity: touchpoints per week in last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = sorted.filter(e => new Date(e.timestamp) >= thirtyDaysAgo);
  const velocity = recentEvents.length > 0 ? Math.round((recentEvents.length / 4.3) * 10) / 10 : 0;

  return {
    total_touchpoints: events.length,
    first_touch_at: firstTouch.toISOString(),
    latest_touch_at: latestTouch.toISOString(),
    journey_duration_days: durationDays,
    current_stage: currentStage,
    time_in_current_stage_days: timeInCurrentStage,
    stage_progression: stageProgression,
    engagement_velocity: velocity,
    stall_detected: daysSinceLastTouch > 7 && stageIdx(currentStage) >= 2,
    days_since_last_touchpoint: daysSinceLastTouch,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLeadJourney(leadId: number): Promise<JourneyTimeline | null> {
  const lead = await Lead.findByPk(leadId, {
    include: [{ model: Visitor, as: 'visitor', attributes: ['id'] }],
  });
  if (!lead) return null;

  const visitorId = (lead as any).visitor?.id;

  // Fetch all data sources in parallel
  const [sessions, pageEvents, signals, campaigns, interactions, conversations, activities, appointments, tempHistory] = await Promise.all([
    visitorId ? fetchSessionEvents(visitorId) : Promise.resolve([]),
    fetchPageEvents(visitorId, leadId),
    visitorId ? fetchSignals(visitorId, leadId) : Promise.resolve([]),
    fetchCampaignEvents(leadId),
    fetchInteractions(leadId),
    visitorId ? fetchConversations(visitorId, leadId) : Promise.resolve([]),
    fetchActivities(leadId),
    fetchAppointments(leadId),
    fetchTemperatureHistory(leadId),
  ]);

  // Mark return visits
  if (sessions.length > 1) {
    for (let i = 1; i < sessions.length; i++) {
      sessions[i].metadata = { ...sessions[i].metadata, is_return_visit: true };
    }
  }

  // Merge and re-infer stages
  const allEvents = [
    ...sessions, ...pageEvents, ...signals, ...campaigns,
    ...interactions, ...conversations, ...activities, ...appointments, ...tempHistory,
  ];

  for (const event of allEvents) {
    event.journey_stage = inferStage(event.category, event.event_type, event.detail, event.metadata);
  }

  // Sort chronologically
  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const metrics = computeMetrics(allEvents);

  const stageSummary: Record<string, number> = {};
  for (const stage of STAGE_ORDER) {
    stageSummary[stage] = allEvents.filter(e => e.journey_stage === stage).length;
  }

  return {
    lead_id: leadId,
    visitor_id: visitorId,
    lead_name: (lead as any).name,
    company: (lead as any).company,
    events: allEvents,
    metrics,
    stage_summary: stageSummary,
  };
}

export async function getVisitorJourney(visitorId: string): Promise<JourneyTimeline | null> {
  const visitor = await Visitor.findByPk(visitorId, {
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'company'] }],
  });
  if (!visitor) return null;

  const leadId = (visitor as any).lead?.id;

  const [sessions, pageEvents, signals, conversations, campaigns, interactions, activities, appointments, tempHistory] = await Promise.all([
    fetchSessionEvents(visitorId),
    fetchPageEvents(visitorId),
    fetchSignals(visitorId, leadId),
    fetchConversations(visitorId, leadId),
    leadId ? fetchCampaignEvents(leadId) : Promise.resolve([]),
    leadId ? fetchInteractions(leadId) : Promise.resolve([]),
    leadId ? fetchActivities(leadId) : Promise.resolve([]),
    leadId ? fetchAppointments(leadId) : Promise.resolve([]),
    leadId ? fetchTemperatureHistory(leadId) : Promise.resolve([]),
  ]);

  if (sessions.length > 1) {
    for (let i = 1; i < sessions.length; i++) {
      sessions[i].metadata = { ...sessions[i].metadata, is_return_visit: true };
    }
  }

  const allEvents = [
    ...sessions, ...pageEvents, ...signals, ...conversations,
    ...campaigns, ...interactions, ...activities, ...appointments, ...tempHistory,
  ];

  for (const event of allEvents) {
    event.journey_stage = inferStage(event.category, event.event_type, event.detail, event.metadata);
  }

  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const metrics = computeMetrics(allEvents);

  const stageSummary: Record<string, number> = {};
  for (const stage of STAGE_ORDER) {
    stageSummary[stage] = allEvents.filter(e => e.journey_stage === stage).length;
  }

  return {
    lead_id: leadId,
    visitor_id: visitorId,
    lead_name: (visitor as any).lead?.name,
    company: (visitor as any).lead?.company,
    events: allEvents,
    metrics,
    stage_summary: stageSummary,
  };
}
