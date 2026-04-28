import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeReleaseDiagnostic } from './release-ops-diagnostics.mjs';
import { validatePreflightEnvelope, validateReleaseExecutionPacketEnvelope } from './release-control-summary-schema.mjs';
import { resolveReleasePaths } from './release-paths.mjs';

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
  releasePacketPath,
  releaseId,
  selectedTargets,
  npmPackageTarget = '',
  changelogAnchor = '',
} = {}) => {
  const root = resolve(repoRoot ?? resolve(scriptDir, '../..'));
  const normalizedReleaseId = String(releaseId ?? '').trim();
  const resolvedPaths = resolveReleasePaths({ repoRoot: root, releaseId: normalizedReleaseId });
  const packetPath = resolve(releasePacketPath ?? resolvedPaths.packetPath);
  const missing = [];
  const diagnostics = [];

  const packetExists = await pathExists(packetPath);
  if (!packetExists) {
    return {
      ok: false,
      selected_targets: [],
      missing: [{
        field: 'release_packet',
        target: null,
        expected: 'release-execution-packet/v1 JSON',
        reason_code: 'MISSING_RELEASE_PACKET',
        message: `Missing required release packet: ${packetPath}`,
        refs: [packetPath],
        release_id: normalizedReleaseId,
      }],
      diagnostics: [normalizeReleaseDiagnostic({
        code: 'MISSING_RELEASE_PACKET',
        scope: 'run',
        message: `Missing required release packet: ${packetPath}`,
        refs: [packetPath],
        releaseId: normalizedReleaseId,
      })],
    };
  }

  const packet = JSON.parse(await readFile(packetPath, 'utf8'));
  const packetValidation = validateReleaseExecutionPacketEnvelope(packet);
  if (!packetValidation.ok) {
    return {
      ok: false,
      selected_targets: [],
      missing: packetValidation.errors.map((error) => ({
        field: 'release_packet',
        target: null,
        expected: 'valid release-execution-packet/v1 envelope',
        reason_code: 'SERIALIZATION_ERROR',
        message: error,
        refs: [packetPath],
        release_id: String(packet?.release_id ?? normalizedReleaseId),
      })),
      diagnostics: [normalizeReleaseDiagnostic({
        code: 'SERIALIZATION_ERROR',
        scope: 'run',
        message: `Release packet validation failed: ${packetValidation.errors.join('; ')}`,
        refs: [packetPath],
        releaseId: String(packet?.release_id ?? normalizedReleaseId),
      })],
    };
  }

  const effectiveReleaseId = String(packet.release_id ?? normalizedReleaseId).trim();
  const explicitTargets = parseTargets(selectedTargets).filter((target) => KNOWN_TARGETS.includes(target));
  const targets = [...new Set((explicitTargets.length > 0 ? explicitTargets : parseTargets(packet.selected_targets)).filter((target) => KNOWN_TARGETS.includes(target)))];
  const effectiveNpmPackageTarget = String(npmPackageTarget ?? '').trim() || String(packet?.inputs?.npm_package_target ?? '').trim();
  const effectiveChangelogAnchor = String(changelogAnchor ?? '').trim() || String(packet?.inputs?.changelog_anchor ?? '').trim();
  const narrativeRef = String(packet?.inputs?.narrative_ref ?? '').trim();
  const derivativeRef = String(packet?.inputs?.ios_derivative_ref ?? '').trim();

  if (!narrativeRef) {
    addMissing(missing, diagnostics, {
      field: 'packet.inputs.narrative_ref',
      target: null,
      expected: 'docs/releases/notes/<release_id>.json',
      reason_code: 'MISSING_REQUIRED_INPUT',
      message: 'release packet is missing required input narrative_ref.',
      refs: [packetPath],
      release_id: effectiveReleaseId,
    });
  }

  if (!effectiveChangelogAnchor) {
    addMissing(missing, diagnostics, {
      field: 'packet.inputs.changelog_anchor',
      target: null,
      expected: 'CHANGELOG.md#r-<normalized-release-id>',
      reason_code: 'MISSING_REQUIRED_INPUT',
      message: 'release packet is missing required input changelog_anchor.',
      refs: [packetPath],
      release_id: effectiveReleaseId,
    });
  }

  if (!effectiveReleaseId) {
    addMissing(missing, diagnostics, {
      field: 'release_id',
      target: null,
      expected: 'non-empty release id',
      reason_code: 'MISSING_REQUIRED_INPUT',
      message: 'release_id is required for preflight completeness checks.',
      refs: [packetPath],
      release_id: effectiveReleaseId,
    });
  }

  const narrativePath = resolve(root, narrativeRef || `docs/releases/notes/${effectiveReleaseId}.json`);
  if (!await pathExists(narrativePath)) {
    addMissing(missing, diagnostics, {
      field: 'narrative_file',
      target: null,
      expected: narrativeRef || `docs/releases/notes/${effectiveReleaseId}.json`,
      reason_code: 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
      message: `Missing required narrative file: ${narrativeRef || `docs/releases/notes/${effectiveReleaseId}.json`}`,
      refs: [narrativePath],
      release_id: effectiveReleaseId,
    });
  }

  if (!/^CHANGELOG\.md#r-/i.test(effectiveChangelogAnchor)) {
    addMissing(missing, diagnostics, {
      field: 'changelog_anchor',
      target: null,
      expected: 'CHANGELOG.md#r-<normalized-release-id>',
      reason_code: 'MISSING_REQUIRED_INPUT',
      message: 'changelog_anchor must use CHANGELOG.md#r-... format.',
      refs: [packetPath],
      release_id: effectiveReleaseId,
    });
  }

  if (targets.includes('ios')) {
    if (!derivativeRef) {
      addMissing(missing, diagnostics, {
        field: 'packet.inputs.ios_derivative_ref',
        target: 'ios',
        expected: `docs/releases/notes/${effectiveReleaseId}-ios-derivative.md`,
        reason_code: 'MISSING_REQUIRED_INPUT',
        message: 'release packet is missing required input ios_derivative_ref for ios lane.',
        refs: [packetPath],
        release_id: effectiveReleaseId,
      });
    }
    const derivativePath = resolve(root, derivativeRef || `docs/releases/notes/${effectiveReleaseId}-ios-derivative.md`);
    if (!await pathExists(derivativePath)) {
      addMissing(missing, diagnostics, {
        field: 'ios_derivative_notes_file',
        target: 'ios',
        expected: derivativeRef || `docs/releases/notes/${effectiveReleaseId}-ios-derivative.md`,
        reason_code: 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
        message: `Missing required derivative iOS notes file: ${derivativeRef || `docs/releases/notes/${effectiveReleaseId}-ios-derivative.md`}`,
        refs: [derivativePath],
        release_id: effectiveReleaseId,
      });
    }
  }

  if (targets.includes('npm')) {
    const normalizedPackageTarget = effectiveNpmPackageTarget;
    if (!['capacitor', 'contract'].includes(normalizedPackageTarget)) {
      addMissing(missing, diagnostics, {
        field: 'npm_package_target',
        target: 'npm',
        expected: 'capacitor|contract',
        reason_code: 'PACKAGE_TARGET_SCOPE',
        message: 'npm_package_target must be capacitor or contract when npm lane is selected.',
        release_id: effectiveReleaseId,
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
          releaseId: effectiveReleaseId,
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
    if (arg === '--release-packet' && args[i + 1]) {
      options.releasePacketPath = args[i + 1];
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
