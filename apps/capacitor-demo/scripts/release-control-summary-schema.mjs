import { RELEASE_OPS_REASON_CODES } from './release-ops-diagnostics.mjs';

const TERMINAL_STATUSES = new Set([
  'published',
  'already_published',
  'blocked',
  'failed',
  'not_selected',
  'incomplete',
]);

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
};

const normalizeEvidence = (evidence = []) => {
  if (!Array.isArray(evidence)) {
    return [];
  }
  return evidence
    .map((entry) => {
      if (typeof entry === 'string') {
        return { label: 'evidence', path: entry.trim() };
      }
      return {
        label: String(entry?.label ?? 'evidence').trim() || 'evidence',
        path: String(entry?.path ?? '').trim(),
      };
    })
    .filter((entry) => entry.path);
};

export const normalizeTargetSummary = (candidate = {}) => ({
  target: String(candidate.target ?? '').trim(),
  selected: Boolean(candidate.selected),
  terminal_status: String(candidate.terminal_status ?? '').trim() || 'incomplete',
  stage_statuses: candidate.stage_statuses && typeof candidate.stage_statuses === 'object' && !Array.isArray(candidate.stage_statuses)
    ? candidate.stage_statuses
    : {},
  evidence: normalizeEvidence(candidate.evidence),
  missing_evidence: toStringArray(candidate.missing_evidence),
  notes: toStringArray(candidate.notes),
});

export const validateTargetSummary = (candidate = {}) => {
  const summary = normalizeTargetSummary(candidate);
  const errors = [];

  if (!summary.target) {
    errors.push('target is required.');
  }
  if (!TERMINAL_STATUSES.has(summary.terminal_status)) {
    errors.push(`terminal_status must be one of ${[...TERMINAL_STATUSES].join(', ')}.`);
  }
  if (!Array.isArray(candidate?.missing_evidence) && candidate?.missing_evidence !== undefined) {
    errors.push('missing_evidence must be an array when provided.');
  }
  if (!Array.isArray(candidate?.notes) && candidate?.notes !== undefined) {
    errors.push('notes must be an array when provided.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: summary,
  };
};

export const createNotSelectedSummary = (target) => normalizeTargetSummary({
  target,
  selected: false,
  terminal_status: 'not_selected',
  stage_statuses: {},
  evidence: [],
  missing_evidence: [],
  notes: [],
});

export const RELEASE_CONTROL_TERMINAL_STATUSES = Object.freeze([...TERMINAL_STATUSES]);

export const validateReleaseNotesFactContract = (candidate = {}) => {
  const errors = [];
  const releaseId = String(candidate?.release_id ?? '').trim();
  const sourceCommit = String(candidate?.source_commit ?? '').trim();
  const versions = candidate?.versions ?? {};

  if (!releaseId) {
    errors.push('release_id is required.');
  }
  if (!sourceCommit) {
    errors.push('source_commit is required.');
  }

  const requiredVersionPaths = [
    ['versions.npm.capacitor.name', versions?.npm?.capacitor?.name],
    ['versions.npm.capacitor.version', versions?.npm?.capacitor?.version],
    ['versions.npm.contract.name', versions?.npm?.contract?.name],
    ['versions.npm.contract.version', versions?.npm?.contract?.version],
    ['versions.android.group', versions?.android?.group],
    ['versions.android.artifact', versions?.android?.artifact],
    ['versions.android.version', versions?.android?.version],
    ['versions.ios.package_name', versions?.ios?.package_name],
    ['versions.ios.version', versions?.ios?.version],
  ];
  for (const [label, value] of requiredVersionPaths) {
    if (!String(value ?? '').trim()) {
      errors.push(`${label} is required.`);
    }
  }

  const durable = Array.isArray(candidate?.evidence?.durable) ? candidate.evidence.durable : [];
  const hasDurableEvidence = durable.some((entry) => String(entry?.url ?? entry?.path ?? '').trim());
  if (!hasDurableEvidence) {
    errors.push('evidence.durable must contain at least one URL or path.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: candidate,
  };
};

const hasText = (value) => String(value ?? '').trim().length > 0;

const isIsoTimestamp = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(String(value ?? '').trim());

const validatePublishedArtifacts = (entries, errors) => {
  if (!Array.isArray(entries)) {
    errors.push('published_artifacts must be an array.');
    return;
  }
  for (const [index, entry] of entries.entries()) {
    if (!hasText(entry?.target)) {
      errors.push(`published_artifacts[${index}].target is required.`);
    }
    if (!hasText(entry?.ref)) {
      errors.push(`published_artifacts[${index}].ref is required.`);
    }
    if (entry && Object.prototype.hasOwnProperty.call(entry, 'payload')) {
      errors.push(`published_artifacts[${index}] must be reference-only (payload duplication is not allowed).`);
    }
  }
};

export const validateDiagnosticEnvelope = (candidate = {}) => {
  const errors = [];
  const validCodes = new Set(RELEASE_OPS_REASON_CODES);

  if (!validCodes.has(String(candidate?.code ?? '').trim())) {
    errors.push('diagnostic reason code must be one of release-ops taxonomy values.');
  }
  if (!['run', 'lane'].includes(String(candidate?.scope ?? '').trim())) {
    errors.push('diagnostic scope must be run|lane.');
  }
  if (typeof candidate?.retryable !== 'boolean') {
    errors.push('diagnostic retryable must be a boolean.');
  }
  if (!hasText(candidate?.message)) {
    errors.push('diagnostic message is required.');
  }
  if (!hasText(candidate?.operator_action)) {
    errors.push('diagnostic operator_action is required.');
  }
  if (candidate?.refs !== undefined && !Array.isArray(candidate.refs)) {
    errors.push('diagnostic refs must be an array when provided.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: candidate,
  };
};

export const validatePreflightEnvelope = (candidate = {}) => {
  const errors = [];

  if (typeof candidate?.ok !== 'boolean') {
    errors.push('preflight.ok must be boolean.');
  }
  if (!Array.isArray(candidate?.selected_targets)) {
    errors.push('preflight.selected_targets must be an array.');
  }
  if (!Array.isArray(candidate?.missing)) {
    errors.push('preflight.missing must be an array.');
  }
  if (!Array.isArray(candidate?.diagnostics)) {
    errors.push('preflight.diagnostics must be an array.');
  }

  for (const [index, entry] of (candidate?.diagnostics ?? []).entries()) {
    const validation = validateDiagnosticEnvelope(entry);
    if (!validation.ok) {
      for (const error of validation.errors) {
        errors.push(`diagnostics[${index}]: ${error}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: candidate,
  };
};

export const validateClosureBundleEnvelope = (candidate = {}) => {
  const errors = [];

  if (String(candidate?.schema_version ?? '').trim() !== 'release-closure-bundle/v1') {
    errors.push('schema_version must be release-closure-bundle/v1.');
  }

  const requiredFields = [
    'release_id',
    'source_commit',
    'run_url',
    'reconciliation_verdict',
    'generated_at',
  ];
  for (const field of requiredFields) {
    if (!hasText(candidate?.[field])) {
      errors.push(`${field} is required.`);
    }
  }

  if (!['pass', 'fail'].includes(String(candidate?.reconciliation_verdict ?? '').trim())) {
    errors.push('reconciliation_verdict must be pass|fail.');
  }

  validatePublishedArtifacts(candidate?.published_artifacts, errors);

  if (!Array.isArray(candidate?.evidence_index_refs) || candidate.evidence_index_refs.length === 0) {
    errors.push('evidence_index_refs must contain at least one reference.');
  }

  if (!isIsoTimestamp(candidate?.generated_at)) {
    errors.push('generated_at must be ISO-8601 UTC timestamp.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: candidate,
  };
};
