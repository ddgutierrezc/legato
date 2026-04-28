import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateClosureBundleEnvelope, validateReleaseExecutionPacketEnvelope } from './release-control-summary-schema.mjs';
import { toRepoRelativePath } from './release-paths.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'));

const toIsoTimestamp = () => new Date().toISOString();

const collectPublishedArtifacts = ({ summary, facts }) => {
  const artifacts = [];
  const targets = summary?.targets && typeof summary.targets === 'object' ? summary.targets : {};
  for (const target of ['android', 'ios', 'npm']) {
    const entry = targets[target];
    const status = String(entry?.terminal_status ?? '').trim();
    if (!entry?.selected || !['published', 'already_published'].includes(status)) {
      continue;
    }
    artifacts.push({
      target,
      ref: `apps/capacitor-demo/artifacts/release-control/${summary.release_id}/${target}-summary.json`,
    });
  }

  for (const entry of Array.isArray(facts?.evidence?.durable) ? facts.evidence.durable : []) {
    const ref = String(entry?.url ?? entry?.path ?? '').trim();
    if (!ref) {
      continue;
    }
    artifacts.push({
      target: 'evidence',
      ref,
    });
  }

  const seen = new Set();
  return artifacts.filter((entry) => {
    const key = `${entry.target}:${entry.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const buildReleaseClosureBundle = async ({
  releaseId,
  sourceCommit,
  runUrl,
  summaryPath,
  factsPath,
  reconciliationPath,
   releasePacketPath,
  evidenceIndexRefs = [],
   expectedHead,
   currentHead,
} = {}) => {
  const summary = await readJson(summaryPath);
  const facts = await readJson(factsPath);
  const reconciliation = await readJson(reconciliationPath);
  const packet = await readJson(releasePacketPath);

  const packetValidation = validateReleaseExecutionPacketEnvelope(packet);
  if (!packetValidation.ok) {
    throw new Error(packetValidation.errors.join(' '));
  }

  const canonicalReleaseId = String(releaseId ?? summary?.release_id ?? packet?.release_id ?? '').trim();
  const canonicalSourceCommit = String(sourceCommit ?? summary?.source_commit ?? '').trim();

  const bundle = {
    schema_version: 'release-closure-bundle/v1',
    release_id: canonicalReleaseId,
    source_commit: canonicalSourceCommit,
    run_url: String(runUrl ?? '').trim(),
    reconciliation_verdict: reconciliation?.ok ? 'pass' : 'fail',
    published_artifacts: collectPublishedArtifacts({ summary, facts }),
    publish_refs: ['android-summary.json', 'ios-summary.json', 'npm-summary.json']
      .map((entry) => resolve(dirname(summaryPath), entry)),
    evidence_index_refs: Array.isArray(evidenceIndexRefs)
      ? evidenceIndexRefs.map((entry) => String(entry ?? '').trim()).filter(Boolean)
      : [],
    packet_ref: toRepoRelativePath(process.cwd(), resolve(releasePacketPath)),
    reconciliation_ref: toRepoRelativePath(process.cwd(), resolve(reconciliationPath)),
    expected_head: String(expectedHead ?? canonicalSourceCommit).trim(),
    current_head: String(currentHead ?? '').trim(),
    summary_ref: String(summaryPath ?? '').trim(),
    generated_at: toIsoTimestamp(),
  };

  const validation = validateClosureBundleEnvelope(bundle);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  return bundle;
};

export const writeReleaseClosureBundle = async ({ outputDir, ...options } = {}) => {
  const bundle = await buildReleaseClosureBundle(options);
  const root = resolve(outputDir ?? resolve(scriptDir, '../artifacts/release-control', bundle.release_id || 'missing-release-id'));
  await mkdir(root, { recursive: true });
  const bundlePath = resolve(root, 'closure-bundle.json');
  const pointerPath = resolve(root, 'closure-bundle.md');
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  const pointerMarkdown = [
    '# Release closure bundle',
    '',
    `- release_id: \`${bundle.release_id}\``,
    `- source_commit: \`${bundle.source_commit}\``,
    `- run_url: ${bundle.run_url}`,
    `- reconciliation_verdict: \`${bundle.reconciliation_verdict}\``,
    `- closure_bundle_json: \`${bundlePath}\``,
  ].join('\n');
  await writeFile(pointerPath, `${pointerMarkdown}\n`, 'utf8');

  return { bundlePath, pointerPath, bundle };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--source-commit' && args[i + 1]) {
      options.sourceCommit = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--run-url' && args[i + 1]) {
      options.runUrl = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--summary' && args[i + 1]) {
      options.summaryPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--facts' && args[i + 1]) {
      options.factsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--reconciliation' && args[i + 1]) {
      options.reconciliationPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-packet' && args[i + 1]) {
      options.releasePacketPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--evidence-index-ref' && args[i + 1]) {
      options.evidenceIndexRefs = options.evidenceIndexRefs ?? [];
      options.evidenceIndexRefs.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--expected-head' && args[i + 1]) {
      options.expectedHead = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--current-head' && args[i + 1]) {
      options.currentHead = args[i + 1];
      i += 1;
    }
  }

  const result = await writeReleaseClosureBundle(options);
  process.stdout.write(`${JSON.stringify(result.bundle, null, 2)}\n`);
}
