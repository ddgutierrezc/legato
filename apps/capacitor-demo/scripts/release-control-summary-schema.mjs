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
