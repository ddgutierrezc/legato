const PASS = 'PASS';
const FAIL = 'FAIL';
const RUNNING = 'RUNNING';
const IDLE = 'IDLE';

const FLOW_SMOKE = 'smoke';
const FLOW_LET_END = 'let-end';
const FLOW_BOUNDARY = 'boundary';

const createCheck = (label, ok, detail) => ({ label, ok, detail });

const normalizeRuntimeIntegrity = (value) => ({
  transportCommandsObserved: value?.transportCommandsObserved === true,
  progressAdvancedWhilePlaying: value?.progressAdvancedWhilePlaying === true,
  trackEndTransitionObserved: value?.trackEndTransitionObserved === true,
  snapshotProjectionCoherent: value?.snapshotProjectionCoherent === true,
  details: {
    transport: typeof value?.details?.transport === 'string' ? value.details.transport : 'transport evidence unavailable',
    progress: typeof value?.details?.progress === 'string' ? value.details.progress : 'progress evidence unavailable',
    trackEnd: typeof value?.details?.trackEnd === 'string' ? value.details.trackEnd : 'track-end evidence unavailable',
    snapshot: typeof value?.details?.snapshot === 'string' ? value.details.snapshot : 'snapshot evidence unavailable',
  },
});

const normalizeParityEvidence = (value) => ({
  addStartIndexConverged: value?.addStartIndexConverged === true,
  remoteOrderConverged: value?.remoteOrderConverged === true,
  eventStateSnapshotConverged: value?.eventStateSnapshotConverged === true,
  capabilitiesConverged: value?.capabilitiesConverged === true,
  details: {
    addStartIndex: typeof value?.details?.addStartIndex === 'string'
      ? value.details.addStartIndex
      : 'add(startIndex) evidence unavailable',
    remoteOrder: typeof value?.details?.remoteOrder === 'string'
      ? value.details.remoteOrder
      : 'remote ordering evidence unavailable',
    eventStateSnapshot: typeof value?.details?.eventStateSnapshot === 'string'
      ? value.details.eventStateSnapshot
      : 'event/state/snapshot evidence unavailable',
    capabilities: typeof value?.details?.capabilities === 'string'
      ? value.details.capabilities
      : 'capabilities evidence unavailable',
  },
});

const asNumberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readSnapshotMetrics = (snapshot) => ({
  state: typeof snapshot?.state === 'string' ? snapshot.state : 'unknown',
  currentTrack: typeof snapshot?.currentTrack?.title === 'string' && snapshot.currentTrack.title.trim() !== ''
    ? snapshot.currentTrack.title
    : '(none)',
  position: asNumberOrNull(snapshot?.position),
  duration: asNumberOrNull(snapshot?.duration),
});

const createBaseChecks = (metrics) => [
  createCheck('current track present', metrics.currentTrack !== '(none)', `track=${metrics.currentTrack}`),
  createCheck('state is present', metrics.state !== 'unknown', `state=${metrics.state}`),
  createCheck(
    'position available',
    metrics.position !== null && metrics.position >= 0,
    `position=${metrics.position ?? 'n/a'}`,
  ),
  createCheck(
    'duration available',
    metrics.duration !== null && metrics.duration > 0,
    `duration=${metrics.duration ?? 'n/a'}`,
  ),
];

const createFlowChecks = (flow, metrics) => {
  switch (flow) {
    case FLOW_SMOKE:
      return [createCheck('smoke flow ends paused', metrics.state === 'paused', `state=${metrics.state}`)];
    case FLOW_LET_END:
      return [createCheck('let-end reaches active playback lifecycle', metrics.state !== 'idle', `state=${metrics.state}`)];
    case FLOW_BOUNDARY:
      return [createCheck('boundary flow reaches ended state', metrics.state === 'ended', `state=${metrics.state}`)];
    default:
      return [createCheck('known flow selected', false, `flow=${flow ?? 'none'}`)];
  }
};

const statusFromChecks = (checks) => {
  if (!Array.isArray(checks) || checks.length === 0) {
    return FAIL;
  }

  return checks.every((check) => check.ok) ? PASS : FAIL;
};

export const deriveSmokeStatusFromChecks = (checks, errorSummary = null) => {
  if (typeof errorSummary === 'string' && errorSummary.trim() !== '') {
    return FAIL;
  }

  return statusFromChecks(checks);
};

const formatSnapshotSummary = (metrics) => [
  `state=${metrics.state}`,
  `track=${metrics.currentTrack}`,
  `position=${metrics.position ?? 'n/a'}`,
  `duration=${metrics.duration ?? 'n/a'}`,
].join(' | ');

export const createSmokeChecks = (flow, snapshot) => {
  const metrics = readSnapshotMetrics(snapshot);
  return [...createBaseChecks(metrics), ...createFlowChecks(flow, metrics)];
};

export const createSmokeSnapshotSummary = (snapshot) => {
  const metrics = readSnapshotMetrics(snapshot);
  return formatSnapshotSummary(metrics);
};

export const buildSmokeReportV1 = ({ verdict, recentEvents = [], runtimeIntegrity, parityEvidence }) => ({
  schemaVersion: 1,
  flow: 'smoke',
  status: verdict.status === PASS ? PASS : FAIL,
  checks: Array.isArray(verdict.checks) ? verdict.checks : [],
  snapshotSummary: typeof verdict.snapshotSummary === 'string' ? verdict.snapshotSummary : 'No snapshot summary available.',
  recentEvents: Array.isArray(recentEvents) ? recentEvents.filter((event) => typeof event === 'string') : [],
  errors: verdict.status === FAIL
    ? [verdict.errorSummary ?? 'One or more smoke checks failed.'].filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    : [],
  runtimeIntegrity: normalizeRuntimeIntegrity(runtimeIntegrity),
  parityEvidence: normalizeParityEvidence(parityEvidence),
});

export const createInitialSmokeVerdict = () => ({
  flow: null,
  status: IDLE,
  checks: [],
  snapshotSummary: 'No smoke run yet.',
  errorSummary: null,
});

export const reduceSmokeVerdict = (state, action) => {
  if (!action || typeof action !== 'object') {
    return state;
  }

  switch (action.type) {
    case 'start':
      return {
        flow: action.flow,
        status: RUNNING,
        checks: [],
        snapshotSummary: 'Awaiting snapshot…',
        errorSummary: null,
      };

    case 'snapshot': {
      const checks = createSmokeChecks(state.flow, action.snapshot);
      return {
        ...state,
        checks,
        snapshotSummary: createSmokeSnapshotSummary(action.snapshot),
      };
    }

    case 'error':
      return {
        ...state,
        status: FAIL,
        errorSummary: action.message,
      };

    case 'complete': {
      if (state.status === FAIL) {
        return state;
      }

      return {
        ...state,
        status: deriveSmokeStatusFromChecks(state.checks, state.errorSummary),
      };
    }

    default:
      return state;
  }
};

export const summarizeSmokeVerdict = (verdict) => {
  const lines = [
    `flow=${verdict.flow ?? 'none'}`,
    `status=${verdict.status}`,
    verdict.snapshotSummary,
  ];

  if (verdict.errorSummary) {
    lines.push(`error=${verdict.errorSummary}`);
  }

  return lines.join('\n');
};
