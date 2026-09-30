/**
 * feedControlShared — types + the tiny LIVE/PREVIEW Badge shared between
 * FeedControlTab.tsx and the drawers it opens (FeedControlTypeDrawer,
 * FeedControlPolicyPanel). Split out so FeedControlTab.tsx (already at the
 * modular-composition hard ceiling) and its extracted drawers don't each
 * redefine the same shapes — see CLAUDE.md's "Extract reusable logic" rule.
 */
import React from 'react';

export interface SurfaceDef { id: string; label: string; description: string; color: string; soft: string; order: number; }
export interface FCType {
  slug: string; label: string; student_label: string;
  home_surface: string; feed_mode: string; today_eligible: boolean;
  bucket: string; render_band: string; difficulty: string;
  cadence: number | null; frequency_cap: number | null; cooldown_days: number | null;
}
export interface Policy {
  todayCadence: number; ambientProviders: string[];
  defaultFrequencyCap: number; defaultCooldownDays: number;
  recencyHalfLifeDays: number; explorationPct: number; priorityWeight: number;
}

export const AMBIENT = ['blog', 'podcast', 'testimonial'];

/** LIVE = this control reaches real students now. PREVIEW = it only changes the
 *  simulator below until Feed Control is switched on. */
export function Badge({ kind }: { kind: 'live' | 'preview' }) {
  return <span className={`fc-badge ${kind}`} title={kind === 'live' ? 'Reaches real students now' : 'Changes the preview only — not the live feed yet'}>{kind === 'live' ? 'LIVE' : 'PREVIEW'}</span>;
}
