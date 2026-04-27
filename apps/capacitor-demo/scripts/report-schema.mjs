export const SMOKE_REPORT_V1_SCHEMA_VERSION = 1;

export const SMOKE_REPORT_V1_REQUIRED_KEYS = Object.freeze([
  'schemaVersion',
  'flow',
  'status',
  'checks',
  'snapshotSummary',
  'recentEvents',
  'errors',
  'runtimeIntegrity',
  'parityEvidence',
]);

export const SMOKE_REPORT_V1_SEMANTIC_SIGNATURES = Object.freeze({
  schemaVersion: 'literal-1',
  flow: 'literal-smoke',
  status: 'enum-pass-fail',
  checks: 'array-check-entry',
  snapshotSummary: 'string-summary',
  recentEvents: 'array-recent-events',
  errors: 'array-error-message',
  runtimeIntegrity: 'runtime-integrity-payload',
  parityEvidence: 'parity-evidence-payload',
});

const PASS = 'PASS';
const FAIL = 'FAIL';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStringEntries = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const hasCheckEntries = (value) => Array.isArray(value)
  && value.every((entry) => isPlainObject(entry)
    && typeof entry.label === 'string'
    && entry.label.trim() !== ''
    && typeof entry.ok === 'boolean'
    && typeof entry.detail === 'string');

const hasRuntimeIntegrityPayload = (value) => isPlainObject(value)
  && typeof value.transportCommandsObserved === 'boolean'
  && typeof value.progressAdvancedWhilePlaying === 'boolean'
  && typeof value.trackEndTransitionObserved === 'boolean'
  && typeof value.snapshotProjectionCoherent === 'boolean'
  && isPlainObject(value.details)
  && typeof value.details.transport === 'string'
  && value.details.transport.trim() !== ''
  && typeof value.details.progress === 'string'
  && value.details.progress.trim() !== ''
  && typeof value.details.trackEnd === 'string'
  && value.details.trackEnd.trim() !== ''
  && typeof value.details.snapshot === 'string'
  && value.details.snapshot.trim() !== '';

const hasParityEvidencePayload = (value) => isPlainObject(value)
  && typeof value.addStartIndexConverged === 'boolean'
  && typeof value.remoteOrderConverged === 'boolean'
  && typeof value.eventStateSnapshotConverged === 'boolean'
  && typeof value.capabilitiesConverged === 'boolean'
  && isPlainObject(value.details)
  && typeof value.details.addStartIndex === 'string'
  && value.details.addStartIndex.trim() !== ''
  && typeof value.details.remoteOrder === 'string'
  && value.details.remoteOrder.trim() !== ''
  && typeof value.details.eventStateSnapshot === 'string'
  && value.details.eventStateSnapshot.trim() !== ''
  && typeof value.details.capabilities === 'string'
  && value.details.capabilities.trim() !== '';

const hasRequestEvidencePayload = (value) => {
  if (!isPlainObject(value)) {
    return false;
  }

  if (!isPlainObject(value.byRuntime)) {
    return false;
  }

  if (!Array.isArray(value.assertions) || !value.assertions.every((entry) => isPlainObject(entry)
    && typeof entry.label === 'string'
    && entry.label.trim() !== ''
    && typeof entry.ok === 'boolean'
    && typeof entry.detail === 'string')) {
    return false;
  }

  for (const runtimeEntry of Object.values(value.byRuntime)) {
    if (!isPlainObject(runtimeEntry) || !isPlainObject(runtimeEntry.byTrack)) {
      return false;
    }

    for (const trackEntry of Object.values(runtimeEntry.byTrack)) {
      if (!isPlainObject(trackEntry) || !Array.isArray(trackEntry.requests)) {
        return false;
      }

      const hasValidRequests = trackEntry.requests.every((request) => isPlainObject(request)
        && typeof request.requestUrl === 'string'
        && request.requestUrl.trim() !== ''
        && isPlainObject(request.requestHeaders)
        && Object.values(request.requestHeaders).every((headerValue) => typeof headerValue === 'string'));

      if (!hasValidRequests) {
        return false;
      }
    }
  }

  return true;
};

export const validateSmokeReportV1 = (candidate) => {
  const errors = [];

  if (!isPlainObject(candidate)) {
    return { ok: false, errors: ['report must be an object'] };
  }

  for (const requiredKey of SMOKE_REPORT_V1_REQUIRED_KEYS) {
    if (!(requiredKey in candidate)) {
      errors.push(`missing required key: ${requiredKey}`);
      continue;
    }

    if (candidate[requiredKey] === null || candidate[requiredKey] === undefined) {
      errors.push(`required key must be non-null: ${requiredKey}`);
    }
  }

  if (candidate.schemaVersion !== SMOKE_REPORT_V1_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SMOKE_REPORT_V1_SCHEMA_VERSION}`);
  }

  if (candidate.flow !== 'smoke') {
    errors.push('flow must be smoke');
  }

  if (candidate.status !== PASS && candidate.status !== FAIL) {
    errors.push('status must be PASS or FAIL');
  }

  if (!hasCheckEntries(candidate.checks)) {
    errors.push('checks must be an array of { label, ok, detail } entries');
  }

  if (typeof candidate.snapshotSummary !== 'string' || candidate.snapshotSummary.trim() === '') {
    errors.push('snapshotSummary must be a non-empty string');
  }

  if (!hasStringEntries(candidate.recentEvents)) {
    errors.push('recentEvents must be a string[]');
  }

  if (!hasStringEntries(candidate.errors)) {
    errors.push('errors must be a string[]');
  }

  if (!hasRuntimeIntegrityPayload(candidate.runtimeIntegrity)) {
    errors.push('runtimeIntegrity must include boolean checks plus non-empty details for transport/progress/trackEnd/snapshot');
  }

  if (!hasParityEvidencePayload(candidate.parityEvidence)) {
    errors.push('parityEvidence must include boolean checks plus non-empty details for addStartIndex/remoteOrder/eventStateSnapshot/capabilities');
  }

  if (candidate.requestEvidence !== undefined && !hasRequestEvidencePayload(candidate.requestEvidence)) {
    errors.push('requestEvidence, when provided, must include byRuntime.byTrack request records plus assertion checks');
  }

  if (candidate.status === FAIL && (!Array.isArray(candidate.errors) || candidate.errors.length === 0)) {
    errors.push('FAIL reports must include at least one actionable error');
  }

  return { ok: errors.length === 0, errors };
};

export const detectSmokeReportV1SemanticDrift = (proposedSignatures) => {
  const errors = [];

  if (!isPlainObject(proposedSignatures)) {
    return { ok: false, errors: ['semantic signature proposal must be an object'] };
  }

  for (const requiredKey of SMOKE_REPORT_V1_REQUIRED_KEYS) {
    if (!(requiredKey in proposedSignatures)) {
      errors.push(`semantic drift: missing required semantic signature for ${requiredKey}`);
      continue;
    }

    const expected = SMOKE_REPORT_V1_SEMANTIC_SIGNATURES[requiredKey];
    const actual = proposedSignatures[requiredKey];
    if (actual !== expected) {
      errors.push(`semantic drift: ${requiredKey} expected ${expected} but received ${actual}`);
    }
  }

  return { ok: errors.length === 0, errors };
};

export const validateSmokeReportV1Compatibility = (candidate) => validateSmokeReportV1(candidate);
