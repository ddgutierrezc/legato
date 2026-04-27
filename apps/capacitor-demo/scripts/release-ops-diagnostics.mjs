const KNOWN_REASON_CODES = new Set([
  'PATH_OR_CWD',
  'SERIALIZATION_ERROR',
  'PACKAGE_TARGET_SCOPE',
  'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
  'UNKNOWN',
]);

const DEFAULT_RETRYABLE = {
  PATH_OR_CWD: false,
  SERIALIZATION_ERROR: false,
  PACKAGE_TARGET_SCOPE: false,
  MISSING_NARRATIVE_OR_DERIVATIVE_NOTES: false,
  UNKNOWN: false,
};

const toString = (value) => String(value ?? '').trim();

const normalizeRefs = (refs) => {
  if (!Array.isArray(refs)) {
    return [];
  }
  return refs.map((entry) => toString(entry)).filter(Boolean);
};

export const resolveReasonCode = (code) => {
  const normalized = toString(code).toUpperCase();
  return KNOWN_REASON_CODES.has(normalized) ? normalized : 'UNKNOWN';
};

export const renderOperatorAction = (code, { releaseId = '', target = '' } = {}) => {
  const resolvedCode = resolveReasonCode(code);
  const normalizedReleaseId = toString(releaseId);
  const releaseNarrativePath = normalizedReleaseId
    ? `docs/releases/notes/${normalizedReleaseId}.json`
    : 'docs/releases/notes/<release_id>.json';

  switch (resolvedCode) {
    case 'PATH_OR_CWD':
      return 'Set --repo-root explicitly or run from repository root, then rerun the release step.';
    case 'SERIALIZATION_ERROR':
      return 'Inspect generated JSON inputs (summary, lane outputs), fix malformed payload, then rerun aggregate step.';
    case 'PACKAGE_TARGET_SCOPE':
      return `Use npm package_target=capacitor|contract consistently for selected npm lane${target ? ` (${target})` : ''}.`;
    case 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES':
      return `Provide required narrative (${releaseNarrativePath}) and iOS derivative notes (docs/releases/notes/${normalizedReleaseId || '<release_id>'}-ios-derivative.md when iOS selected) before rerun.`;
    default:
      return 'Inspect lane artifacts and rerun with explicit selected targets/modes after correcting input contract.';
  }
};

export const normalizeReleaseDiagnostic = (candidate = {}) => {
  const code = resolveReasonCode(candidate.code);
  const scopeValue = toString(candidate.scope).toLowerCase();
  const scope = scopeValue === 'lane' ? 'lane' : 'run';
  const target = toString(candidate.target) || null;
  const message = toString(candidate.message) || 'release operation failed';
  const retryable = typeof candidate.retryable === 'boolean' ? candidate.retryable : DEFAULT_RETRYABLE[code];
  const operatorAction = toString(candidate.operator_action)
    || renderOperatorAction(code, { releaseId: candidate.releaseId, target: target ?? '' });

  return {
    code,
    scope,
    target,
    retryable,
    message,
    operator_action: operatorAction,
    refs: normalizeRefs(candidate.refs),
  };
};

export const RELEASE_OPS_REASON_CODES = Object.freeze([...KNOWN_REASON_CODES]);
