import { access, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeReleaseDiagnostic } from './release-ops-diagnostics.mjs';
import { validatePreflightEnvelope } from './release-control-summary-schema.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const KNOWN_TARGETS = ['android', 'ios', 'npm'];

const pathExists = async (path) => access(path).then(() => true).catch(() => false);

const parseTargets = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim().toLowerCase()).filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry ?? '').trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      // fall through to comma-based parsing
    }
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const addMissing = (missing, diagnostics, entry) => {
  missing.push(entry);
  diagnostics.push(normalizeReleaseDiagnostic({
    code: entry.reason_code,
    scope: entry.target ? 'lane' : 'run',
    target: entry.target ?? null,
    message: entry.message,
    refs: entry.refs ?? [],
    releaseId: entry.release_id,
  }));
};

export const evaluateReleasePreflightCompleteness = async ({
  repoRoot,
  releaseId,
  selectedTargets,
  npmPackageTarget = '',
  changelogAnchor = '',
} = {}) => {
  const root = resolve(repoRoot ?? resolve(scriptDir, '../..'));
  const normalizedReleaseId = String(releaseId ?? '').trim();
  const targets = [...new Set(parseTargets(selectedTargets).filter((target) => KNOWN_TARGETS.includes(target)))];
  const missing = [];
  const diagnostics = [];

  if (!normalizedReleaseId) {
    addMissing(missing, diagnostics, {
      field: 'release_id',
      target: null,
      expected: 'non-empty release id',
      reason_code: 'SERIALIZATION_ERROR',
      message: 'release_id is required for preflight completeness checks.',
      release_id: normalizedReleaseId,
    });
  }

  const narrativePath = resolve(root, `docs/releases/notes/${normalizedReleaseId}.json`);
  if (!await pathExists(narrativePath)) {
    addMissing(missing, diagnostics, {
      field: 'narrative_file',
      target: null,
      expected: `docs/releases/notes/${normalizedReleaseId}.json`,
      reason_code: 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
      message: `Missing required narrative file: docs/releases/notes/${normalizedReleaseId}.json`,
      refs: [narrativePath],
      release_id: normalizedReleaseId,
    });
  }

  if (!/^CHANGELOG\.md#r-/i.test(String(changelogAnchor ?? '').trim())) {
    addMissing(missing, diagnostics, {
      field: 'changelog_anchor',
      target: null,
      expected: 'CHANGELOG.md#r-<normalized-release-id>',
      reason_code: 'SERIALIZATION_ERROR',
      message: 'changelog_anchor must use CHANGELOG.md#r-... format.',
      release_id: normalizedReleaseId,
    });
  }

  if (targets.includes('ios')) {
    const derivativePath = resolve(root, `docs/releases/notes/${normalizedReleaseId}-ios-derivative.md`);
    if (!await pathExists(derivativePath)) {
      addMissing(missing, diagnostics, {
        field: 'ios_derivative_notes_file',
        target: 'ios',
        expected: `docs/releases/notes/${normalizedReleaseId}-ios-derivative.md`,
        reason_code: 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
        message: `Missing required derivative iOS notes file: docs/releases/notes/${normalizedReleaseId}-ios-derivative.md`,
        refs: [derivativePath],
        release_id: normalizedReleaseId,
      });
    }
  }

  if (targets.includes('npm')) {
    const normalizedPackageTarget = String(npmPackageTarget ?? '').trim();
    if (!['capacitor', 'contract'].includes(normalizedPackageTarget)) {
      addMissing(missing, diagnostics, {
        field: 'npm_package_target',
        target: 'npm',
        expected: 'capacitor|contract',
        reason_code: 'PACKAGE_TARGET_SCOPE',
        message: 'npm_package_target must be capacitor or contract when npm lane is selected.',
        release_id: normalizedReleaseId,
      });
    }
  }

  const envelope = {
    ok: missing.length === 0,
    selected_targets: targets,
    missing,
    diagnostics,
  };

  const validation = validatePreflightEnvelope(envelope);
  if (!validation.ok) {
    return {
      ok: false,
      selected_targets: targets,
      missing,
      diagnostics: [
        ...diagnostics,
        normalizeReleaseDiagnostic({
          code: 'SERIALIZATION_ERROR',
          scope: 'run',
          message: `Preflight envelope validation failed: ${validation.errors.join('; ')}`,
          releaseId: normalizedReleaseId,
        }),
      ],
    };
  }

  return envelope;
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--selected-targets' && args[i + 1]) {
      options.selectedTargets = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--npm-package-target' && args[i + 1]) {
      options.npmPackageTarget = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--changelog-anchor' && args[i + 1]) {
      options.changelogAnchor = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i += 1;
    }
  }

  const result = await evaluateReleasePreflightCompleteness(options);
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
