export type SpeedMode = 'normal' | 'fast' | 'ultra' | 'instant';

const MS_PER_DAY: Record<SpeedMode, number> = {
  normal: 300_000,   // 5 min per simulated day
  fast: 90_000,      // 90 sec per simulated day
  ultra: 30_000,     // 30 sec per simulated day
  instant: 0,        // no delay — manual advance
};

export function calculateCompressedDelay(delayDays: number, speedMode: SpeedMode): number {
  return Math.round(delayDays * MS_PER_DAY[speedMode]);
}

export function getSpeedLabel(speedMode: SpeedMode): string {
  switch (speedMode) {
    case 'normal': return '5 min/day';
    case 'fast': return '90 sec/day';
    case 'ultra': return '30 sec/day';
    case 'instant': return 'Manual';
  }
}

export function formatDelay(ms: number): string {
  if (ms === 0) return 'Instant';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
}
