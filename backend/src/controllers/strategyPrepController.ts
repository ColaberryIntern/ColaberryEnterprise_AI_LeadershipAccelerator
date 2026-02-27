import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import StrategyCall from '../models/StrategyCall';
import StrategyCallIntelligence from '../models/StrategyCallIntelligence';
import {
  strategyPrepSchema,
  CHALLENGE_OPTIONS,
  TOOL_OPTIONS,
  AI_MATURITY_LEVELS,
  TEAM_SIZE_OPTIONS,
  TIMELINE_OPTIONS,
  BUDGET_OPTIONS,
} from '../schemas/strategyPrepSchema';
import { calculateCompletionScore, cancelPrepNudge } from '../services/strategyPrepService';
import { synthesizeIntelligence } from '../services/synthesisService';
import { extractText } from '../services/fileExtractionService';

export async function handleGetPrep(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    const call = await StrategyCall.findOne({
      where: { prep_token: token },
      include: [{ model: StrategyCallIntelligence, as: 'intelligence' }],
    });

    if (!call) {
      res.status(404).json({ error: 'Strategy call not found' });
      return;
    }

    const intelligence = (call as any).intelligence as StrategyCallIntelligence | null;

    res.json({
      call: {
        id: call.id,
        name: call.name,
        email: call.email,
        company: call.company,
        scheduled_at: call.scheduled_at,
        timezone: call.timezone,
      },
      intelligence: intelligence
        ? {
            primary_challenges: intelligence.primary_challenges,
            ai_maturity_level: intelligence.ai_maturity_level,
            team_size: intelligence.team_size,
            priority_use_case: intelligence.priority_use_case,
            timeline_urgency: intelligence.timeline_urgency,
            current_tools: intelligence.current_tools,
            budget_range: intelligence.budget_range,
            evaluating_consultants: intelligence.evaluating_consultants,
            previous_ai_investment: intelligence.previous_ai_investment,
            specific_questions: intelligence.specific_questions,
            additional_context: intelligence.additional_context,
            uploaded_file_name: intelligence.uploaded_file_name,
            completion_score: intelligence.completion_score,
            status: intelligence.status,
          }
        : null,
      options: {
        challenges: CHALLENGE_OPTIONS,
        tools: TOOL_OPTIONS,
        maturityLevels: AI_MATURITY_LEVELS,
        teamSizes: TEAM_SIZE_OPTIONS,
        timelines: TIMELINE_OPTIONS,
        budgets: BUDGET_OPTIONS,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function handleSubmitPrep(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    const call = await StrategyCall.findOne({ where: { prep_token: token } });
    if (!call) {
      res.status(404).json({ error: 'Strategy call not found' });
      return;
    }

    const data = strategyPrepSchema.parse(req.body);

    // Upsert intelligence record
    let intelligence = await StrategyCallIntelligence.findOne({
      where: { strategy_call_id: call.id },
    });

    const hasUploadedFile = !!(intelligence?.uploaded_file_name);
    const completionScore = calculateCompletionScore(data, hasUploadedFile);

    const fields = {
      strategy_call_id: call.id,
      lead_id: call.lead_id || null,
      primary_challenges: data.primary_challenges,
      ai_maturity_level: data.ai_maturity_level,
      team_size: data.team_size,
      priority_use_case: data.priority_use_case,
      timeline_urgency: data.timeline_urgency,
      current_tools: data.current_tools,
      budget_range: data.budget_range,
      evaluating_consultants: data.evaluating_consultants,
      previous_ai_investment: data.previous_ai_investment,
      specific_questions: data.specific_questions,
      additional_context: data.additional_context,
      completion_score: completionScore,
      status: 'submitted' as const,
      submitted_at: new Date(),
      updated_at: new Date(),
    };

    if (intelligence) {
      await intelligence.update(fields);
    } else {
      intelligence = await StrategyCallIntelligence.create(fields);
    }

    // Trigger AI synthesis async (non-blocking)
    synthesizeIntelligence(intelligence.id).catch((err) =>
      console.error('[StrategyPrep] Synthesis failed (non-blocking):', err)
    );

    // Cancel pending nudge campaign actions now that prep is submitted (non-blocking)
    if (call.lead_id) {
      cancelPrepNudge(call.lead_id).catch((err) =>
        console.error('[StrategyPrep] Cancel nudge failed (non-blocking):', err)
      );
    }

    res.json({
      success: true,
      completion_score: completionScore,
      status: intelligence.status,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next(error);
  }
}

export async function handleUploadFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    const call = await StrategyCall.findOne({ where: { prep_token: token } });
    if (!call) {
      res.status(404).json({ error: 'Strategy call not found' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Find or create intelligence record
    let intelligence = await StrategyCallIntelligence.findOne({
      where: { strategy_call_id: call.id },
    });

    // Delete old file if replacing
    if (intelligence?.uploaded_file_path) {
      try {
        fs.unlinkSync(intelligence.uploaded_file_path);
      } catch {
        // Old file may not exist; ignore
      }
    }

    // Extract text from uploaded file
    let extractedText: string | null = null;
    try {
      extractedText = await extractText(file.path);
      console.log(`[StrategyPrep] Extracted ${extractedText.length} chars from ${file.originalname}`);
    } catch (err: any) {
      console.warn('[StrategyPrep] Text extraction failed (non-fatal):', err.message);
    }

    const uploadFields = {
      strategy_call_id: call.id,
      lead_id: call.lead_id || null,
      uploaded_file_path: file.path,
      uploaded_file_name: file.originalname,
      uploaded_file_type: file.mimetype,
      extracted_text: extractedText,
      updated_at: new Date(),
    };

    if (intelligence) {
      await intelligence.update(uploadFields);
    } else {
      intelligence = await StrategyCallIntelligence.create({
        ...uploadFields,
        primary_challenges: [],
        ai_maturity_level: '',
        team_size: '',
        timeline_urgency: '',
        current_tools: [],
        completion_score: 20, // File alone = 20%
        status: 'draft',
      } as any);
    }

    // Recalculate completion score if form data exists
    if (intelligence.ai_maturity_level) {
      const score = calculateCompletionScore(
        {
          primary_challenges: intelligence.primary_challenges || [],
          ai_maturity_level: intelligence.ai_maturity_level as any,
          team_size: intelligence.team_size as any,
          timeline_urgency: intelligence.timeline_urgency as any,
          priority_use_case: intelligence.priority_use_case || '',
          current_tools: intelligence.current_tools || [],
          budget_range: intelligence.budget_range || '',
          evaluating_consultants: intelligence.evaluating_consultants,
          previous_ai_investment: intelligence.previous_ai_investment || '',
          specific_questions: intelligence.specific_questions || '',
          additional_context: intelligence.additional_context || '',
        },
        true
      );
      await intelligence.update({ completion_score: score });
    }

    res.json({
      success: true,
      file_name: file.originalname,
      file_size: file.size,
      extracted_length: extractedText?.length || 0,
      completion_score: intelligence.completion_score,
    });
  } catch (error) {
    next(error);
  }
}
