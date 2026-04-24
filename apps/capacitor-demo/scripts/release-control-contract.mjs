const TARGETS = ['android', 'ios', 'npm'];

const ALLOWED_MODES = {
  android: new Set(['preflight-only', 'publish']),
  ios: new Set(['preflight', 'handoff', 'verify', 'closeout', 'full-manual-lane']),
  npm: new Set(['readiness', 'release-candidate', 'protected-publish']),
};

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
} = {}) => {
  const errors = [];
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
      errors.push(`unsupported mode for target ${target}: ${mode}.`);
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

  return {
    ok: errors.length === 0,
    errors,
    value: {
      release_id: normalizedReleaseId,
      targets: normalizedTargets,
      target_modes: Object.fromEntries(
        normalizedTargets.map((target) => [target, String(targetModes[target] ?? '').trim()]),
      ),
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
    }
  }

  const result = validateReleaseControlContract(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

export const RELEASE_CONTROL_ALLOWED_TARGETS = Object.freeze(TARGETS);
