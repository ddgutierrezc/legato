import { createNotSelectedSummary, normalizeTargetSummary } from './release-control-summary-schema.mjs';

const buildEvidence = (root = 'artifacts/release-ci') => [
  { label: 'dispatch', path: `${root}/dispatch.json` },
  { label: 'preflight-log', path: `${root}/preflight.log` },
  { label: 'publish-log', path: `${root}/publish.log` },
  { label: 'verify-log', path: `${root}/verify.log` },
  { label: 'summary', path: `${root}/summary.json` },
];

const resolveTerminalStatus = ({ mode, stages }) => {
  if (stages.android_preflight !== 'success') {
    return 'failed';
  }
  if (stages.android_verify !== 'success') {
    return 'failed';
  }
  if (mode === 'publish' && stages.android_publish === 'success') {
    return 'published';
  }
  if (mode === 'preflight-only') {
    return 'blocked';
  }
  return 'failed';
};

export const adaptAndroidReleaseSummary = ({ selected, releaseSummary, evidenceRoot }) => {
  if (!selected) {
    return createNotSelectedSummary('android');
  }

  const summary = releaseSummary ?? {};
  const stages = summary.stages ?? {};
  const terminalStatus = resolveTerminalStatus({ mode: summary.mode, stages });
  const evidence = buildEvidence(evidenceRoot);
  const missingEvidence = [];

  return normalizeTargetSummary({
    target: 'android',
    selected: true,
    terminal_status: terminalStatus,
    stage_statuses: {
      validate_dispatch: stages.validate_dispatch ?? 'unknown',
      preflight: stages.android_preflight ?? 'unknown',
      publish: stages.android_publish ?? 'unknown',
      verify: stages.android_verify ?? 'unknown',
    },
    evidence,
    missing_evidence: missingEvidence,
    notes: ['failed', 'blocked'].includes(terminalStatus) ? ['android lane did not reach terminal success states.'] : [],
  });
};
