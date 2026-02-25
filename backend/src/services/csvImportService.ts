import { parse } from 'csv-parse/sync';
import { Op } from 'sequelize';
import Lead from '../models/Lead';
import { calculateLeadScore, LeadInput } from './leadService';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  total: number;
}

const REQUIRED_FIELDS = ['name', 'email'];

export async function importLeadsFromCsv(buffer: Buffer): Promise<ImportResult> {
  const records: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    total: records.length,
  };

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row

    try {
      // Validate required fields
      if (!row.name || !row.email) {
        result.errors.push({ row: rowNum, message: 'Missing required field: name or email' });
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email)) {
        result.errors.push({ row: rowNum, message: `Invalid email: ${row.email}` });
        continue;
      }

      // Check for duplicate (by email)
      const existing = await Lead.findOne({
        where: { email: { [Op.iLike]: row.email.trim() } },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // Build lead data
      const leadData: LeadInput = {
        name: row.name.trim(),
        email: row.email.trim().toLowerCase(),
        company: row.company?.trim() || '',
        role: row.role?.trim() || '',
        phone: row.phone?.trim() || '',
        title: row.title?.trim() || '',
        company_size: row.company_size?.trim() || '',
        evaluating_90_days: row.evaluating_90_days === 'true' || row.evaluating_90_days === 'Yes',
        interest_area: row.interest_area?.trim() || '',
        message: row.message?.trim() || '',
        source: row.source?.trim() || 'csv_import',
        form_type: row.form_type?.trim() || 'csv_import',
        consent_contact: row.consent_contact === 'true' || row.consent_contact === 'Yes',
        utm_source: row.utm_source?.trim() || '',
        utm_campaign: row.utm_campaign?.trim() || '',
        page_url: row.page_url?.trim() || '',
      };

      const leadScore = calculateLeadScore(leadData);

      await Lead.create({
        ...leadData,
        lead_score: leadScore,
        pipeline_stage: 'new_lead',
        status: 'new',
      });

      result.imported++;
    } catch (error: any) {
      result.errors.push({ row: rowNum, message: error.message });
    }
  }

  return result;
}

export function getExpectedColumns(): string[] {
  return [
    'name', 'email', 'company', 'title', 'phone', 'role',
    'company_size', 'evaluating_90_days', 'interest_area', 'message',
    'source', 'form_type', 'consent_contact',
    'utm_source', 'utm_campaign', 'page_url',
  ];
}
