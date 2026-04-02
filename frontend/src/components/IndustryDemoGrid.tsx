import React from 'react';
import type { IndustryDemo } from '../config/industryDemos';
import InlineDemoPlayer from './InlineDemoPlayer';

interface IndustryDemoGridProps {
  demos?: IndustryDemo[];
  headline?: string;
  subtext?: string;
  trackContext: string;
  compact?: boolean;
}

export default function IndustryDemoGrid({
  demos,
  trackContext,
}: IndustryDemoGridProps) {
  const allowedScenarios = demos ? demos.map(d => d.scenario) : undefined;
  return <InlineDemoPlayer allowedScenarios={allowedScenarios} trackContext={trackContext} />;
}
