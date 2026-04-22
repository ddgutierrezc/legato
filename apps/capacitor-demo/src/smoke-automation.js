export const LEGATO_SMOKE_REPORT_MARKER = 'LEGATO_SMOKE_REPORT';

export const buildSmokeMarkerLine = (report) => `${LEGATO_SMOKE_REPORT_MARKER} ${JSON.stringify(report)}`;

export const deriveAutomationStatus = (report) => {
  if (!report || typeof report !== 'object') {
    return 'idle';
  }

  if (report.status === 'PASS') {
    return 'pass';
  }

  return 'fail';
};

export const buildAutomationSnapshot = ({ report, fallbackSnapshotSummary, fallbackRecentEvents = [] }) => {
  const status = report?.status ?? 'IDLE';
  const snapshotSummary = typeof report?.snapshotSummary === 'string'
    ? report.snapshotSummary
    : fallbackSnapshotSummary;
  const recentEvents = Array.isArray(report?.recentEvents)
    ? report.recentEvents
    : fallbackRecentEvents;
  const errors = Array.isArray(report?.errors) ? report.errors : [];

  return [
    `status=${status}`,
    `snapshot=${snapshotSummary}`,
    `recentEvents=${recentEvents.length > 0 ? recentEvents.join(' | ') : 'none'}`,
    `errors=${errors.length > 0 ? errors.join(' | ') : 'none'}`,
  ].join('\n');
};
