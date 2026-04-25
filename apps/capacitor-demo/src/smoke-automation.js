export const LEGATO_SMOKE_REPORT_MARKER = 'LEGATO_SMOKE_REPORT';

const MAX_MARKER_RECENT_EVENTS = 2;
const MAX_MARKER_EVENT_LENGTH = 160;

const compactRecentEvent = (entry) => {
  const value = String(entry ?? '');
  return value.length > MAX_MARKER_EVENT_LENGTH
    ? `${value.slice(0, MAX_MARKER_EVENT_LENGTH - 1)}…`
    : value;
};

export const compactSmokeMarkerReport = (report) => ({
  schemaVersion: report?.schemaVersion,
  flow: report?.flow,
  status: report?.status,
  checks: Array.isArray(report?.checks) ? report.checks : [],
  snapshotSummary: typeof report?.snapshotSummary === 'string' ? report.snapshotSummary : 'unavailable',
  recentEvents: Array.isArray(report?.recentEvents)
    ? report.recentEvents.slice(-MAX_MARKER_RECENT_EVENTS).map(compactRecentEvent)
    : [],
  errors: Array.isArray(report?.errors) ? report.errors.map((entry) => String(entry ?? '')) : [],
});

export const buildSmokeMarkerLine = (report) => `${LEGATO_SMOKE_REPORT_MARKER} ${JSON.stringify(compactSmokeMarkerReport(report))}`;

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
