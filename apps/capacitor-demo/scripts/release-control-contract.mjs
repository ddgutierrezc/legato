const TARGETS = ['android', 'ios', 'npm'];
import { buildCanonicalRefs } from './release-paths.mjs';

// Governance v1 note:
// - target/mode validation is a preflight contract gate for release-control.yml.
// - reconciliation semantics (authority, durable evidence, derivative backlinks) are enforced later
//   by validate-release-reconciliation.mjs using release facts + docs contracts.
// - this module remains target/mode focused so workflow dispatch can fail fast before lane fanout.

const ALLOWED_MODES = {
  android: new Set(['preflight-only', 'publish']),
  ios: new Set(['publish']),
  npm: new Set(['readiness', 'release-candidate', 'protected-publish']),
};

const normalizePhase = (phase) => {
  const value = String(phase ?? '').trim().toLowerCase();
  return ['preflight', 'publish', 'reconcile', 'closeout'].includes(value) ? value : 'preflight';
};

const buildPacketRefs = (releaseId) => ({
  summary_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/summary.json`,
  facts_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/release-facts.json`,
  reconciliation_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/reconciliation-report.json`,
  closure_bundle_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/closure-bundle.json`,
});

const parseTargets = (targets) => {
  if (Array.isArray(targets)) {
    return targets.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
  }
  return String(targets ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

export const validateReleaseControlContract = ({
  releaseId,
  targets,
  targetModes = {},
  changeIntent = '',
  phase = 'preflight',
  repoRoot = '.',
  npmPackageTarget = 'capacitor',
  releaseChannel = 'stable',
  releaseVersion = '0.1.1',
  releaseKey = '',
} = {}) => {
  const errors = [];
  const diagnostics = [];
  const normalizedReleaseId = String(releaseId ?? '').trim();
  if (!normalizedReleaseId) {
    errors.push('release_id is required.');
  }

  const normalizedTargets = [...new Set(parseTargets(targets))];
  if (normalizedTargets.length === 0) {
    errors.push('At least one target must be selected.');
  }

  for (const target of normalizedTargets) {
    if (!TARGETS.includes(target)) {
      errors.push(`unsupported target: ${target}. allowed targets: android|ios|npm.`);
      continue;
    }
    const mode = String(targetModes[target] ?? '').trim();
    if (!mode) {
      errors.push(`missing mode for selected target: ${target}.`);
      continue;
    }
    if (!ALLOWED_MODES[target].has(mode)) {
      errors.push(`unsupported mode for target ${target}: ${mode}. allowed: ${[...ALLOWED_MODES[target]].join('|')}.`);
    }
  }

  for (const rawTarget of Object.keys(targetModes)) {
    const target = String(rawTarget).trim().toLowerCase();
    if (!TARGETS.includes(target)) {
      errors.push(`mode/target mismatch: mode provided for unsupported target ${target}.`);
      continue;
    }
    if (!normalizedTargets.includes(target)) {
      errors.push(`mode/target mismatch: mode provided for non-selected target ${target}.`);
    }
  }

  const normalizedChangeIntent = String(changeIntent ?? '').trim().toLowerCase();
  const nonGoalSignals = [
    { token: 'platform-rewrite', message: 'centralized release platform rewrite is out of scope for release-ops maturity v1.' },
    { token: 'automate-human-narrative', message: 'automating human-authored release narrative ownership is out of scope.' },
  ];
  for (const signal of nonGoalSignals) {
    if (normalizedChangeIntent.includes(signal.token)) {
      const detail = `NON_GOAL_VIOLATION: ${signal.message}`;
      errors.push(detail);
      diagnostics.push({ code: 'NON_GOAL_VIOLATION', message: signal.message });
    }
  }

  const releaseIdentity = {
    channel: String(releaseChannel ?? 'stable').trim() || 'stable',
    version: String(releaseVersion ?? '0.1.1').trim() || '0.1.1',
    package_target: String(npmPackageTarget ?? '').trim() || 'capacitor',
  };
  releaseIdentity.release_key = `${releaseIdentity.channel}/v${releaseIdentity.version.replace(/^v/i, '')}/${releaseIdentity.package_target}`;
  const explicitReleaseKey = String(releaseKey ?? '').trim();
  if (explicitReleaseKey && explicitReleaseKey !== releaseIdentity.release_key) {
    const message = `IDENTITY_AMBIGUOUS: explicit release_key (${explicitReleaseKey}) conflicts with derived release_key (${releaseIdentity.release_key}).`;
    errors.push(message);
    diagnostics.push({ code: 'IDENTITY_AMBIGUOUS', message });
  }
  const refs = buildCanonicalRefs({ releaseIdentity, releaseId: normalizedReleaseId });

  return {
    ok: errors.length === 0,
    errors,
    diagnostics,
    value: {
      release_id: normalizedReleaseId,
      targets: normalizedTargets,
      target_modes: Object.fromEntries(
        normalizedTargets.map((target) => [target, String(targetModes[target] ?? '').trim()]),
      ),
      packet: {
        schema_version: 'release-execution-packet/v2',
        release_id: normalizedReleaseId,
        release_identity: releaseIdentity,
        phase: normalizePhase(phase),
        repo_root: String(repoRoot ?? '.').trim() || '.',
        selected_targets: normalizedTargets,
        target_modes: Object.fromEntries(
          normalizedTargets.map((target) => [target, String(targetModes[target] ?? '').trim()]),
        ),
        inputs: {
          canonical_refs: refs.canonical,
          compatibility_refs: refs.compatibility,
          npm_package_target: String(npmPackageTarget ?? '').trim() || 'capacitor',
        },
        artifacts: buildPacketRefs(normalizedReleaseId),
      },
    },
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = { targetModes: {} };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--targets' && args[i + 1]) {
      options.targets = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--target-modes' && args[i + 1]) {
      const pairs = String(args[i + 1]).split(',').map((entry) => entry.trim()).filter(Boolean);
      for (const pair of pairs) {
        const [target, mode] = pair.split('=').map((entry) => entry.trim());
        if (target) {
          options.targetModes[target] = mode ?? '';
        }
      }
      i += 1;
      continue;
    }
    if (arg === '--change-intent' && args[i + 1]) {
      options.changeIntent = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--phase' && args[i + 1]) {
      options.phase = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--npm-package-target' && args[i + 1]) {
      options.npmPackageTarget = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-key' && args[i + 1]) {
      options.releaseKey = args[i + 1];
      i += 1;
    }
  }

  const result = validateReleaseControlContract(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

export const RELEASE_CONTROL_ALLOWED_TARGETS = Object.freeze(TARGETS);
