import type { SmokeReportV1 } from './smoke-verdict.js';

export const LEGATO_SMOKE_REPORT_MARKER: 'LEGATO_SMOKE_REPORT';
export function buildSmokeMarkerLine(report: SmokeReportV1): string;
export function deriveAutomationStatus(report: SmokeReportV1 | null): 'idle' | 'pass' | 'fail';
export function buildAutomationSnapshot(input: {
  report: SmokeReportV1 | null;
  fallbackSnapshotSummary: string;
  fallbackRecentEvents?: string[];
}): string;
