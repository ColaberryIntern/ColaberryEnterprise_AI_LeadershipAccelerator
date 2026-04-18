import { Request, Response } from 'express';
import {
  leadsBySource, conversionByEntryPoint, ingestTail, ingestStatusCounts,
} from '../services/ingestStatsService';

export async function getIngestStats(_req: Request, res: Response) {
  try {
    const [by24h, by7d, by30d, conversion, statusCounts, tail] = await Promise.all([
      leadsBySource(24),
      leadsBySource(24 * 7),
      leadsBySource(24 * 30),
      conversionByEntryPoint(),
      ingestStatusCounts(24),
      ingestTail(25),
    ]);

    res.json({
      leads_by_source: { '24h': by24h, '7d': by7d, '30d': by30d },
      conversion_by_entry_point: conversion,
      status_counts_24h: statusCounts,
      tail,
    });
  } catch (err: any) {
    console.error('[IngestStats] Error:', err.message);
    res.status(500).json({ error: 'Failed to load ingest stats' });
  }
}
