import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTargetSummary } from './release-control-summary-schema.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const toIsoTimestamp = () => new Date().toISOString();

export const parseSummaryJsonPayload = (label, raw) => {
  const value = String(raw ?? '').trim();
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`SERIALIZATION_ERROR: unable to parse ${label} summary payload (${reason})`);
  }
};

const resolveOverallStatus = (targets) => {
  const values = Object.values(targets);
  const selected = values.filter((entry) => entry.selected);
  if (selected.length === 0) {
    return 'failed';
  }

  const hasPublishedLike = selected.some((entry) => ['published', 'already_published'].includes(entry.terminal_status));
  const hasFailureLike = selected.some((entry) => ['failed', 'blocked', 'incomplete'].includes(entry.terminal_status));

  if (hasPublishedLike && !hasFailureLike) {
    return 'success';
  }
  if (hasPublishedLike && hasFailureLike) {
    return 'partial_success';
  }
  return 'failed';
};

export const aggregateReleaseSummary = ({
  release_id,
  source_commit = '',
  selected_targets = [],
  requested_modes = {},
  target_summaries = {},
} = {}) => {
  const normalized = {};
  for (const target of ['android', 'ios', 'npm']) {
    const summary = normalizeTargetSummary(target_summaries[target] ?? {
      target,
      selected: selected_targets.includes(target),
      terminal_status: selected_targets.includes(target) ? 'incomplete' : 'not_selected',
      stage_statuses: {},
      evidence: [],
      missing_evidence: [],
      notes: [],
    });

    if (summary.missing_evidence.length > 0) {
      summary.terminal_status = 'incomplete';
      summary.notes = [...summary.notes, 'missing evidence detected for target'];
    }

    normalized[target] = summary;
  }

  return {
    release_id: String(release_id ?? '').trim(),
    source_commit: String(source_commit ?? '').trim(),
    selected_targets,
    requested_modes,
    generated_at: toIsoTimestamp(),
    targets: normalized,
    overall_status: resolveOverallStatus(normalized),
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {
    target_summaries: {},
  };
  let outputDir = resolve(scriptDir, '../artifacts/release-control');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--release-id' && args[i + 1]) {
      options.release_id = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--selected-targets' && args[i + 1]) {
      options.selected_targets = args[i + 1].split(',').map((entry) => entry.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--source-commit' && args[i + 1]) {
      options.source_commit = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--requested-modes' && args[i + 1]) {
      const map = {};
      for (const pair of args[i + 1].split(',').map((entry) => entry.trim()).filter(Boolean)) {
        const [target, mode] = pair.split('=').map((entry) => entry.trim());
        if (target) {
          map[target] = mode ?? '';
        }
      }
      options.requested_modes = map;
      i += 1;
      continue;
    }
    if (arg === '--android-summary' && args[i + 1]) {
      options.target_summaries.android = JSON.parse(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--ios-summary' && args[i + 1]) {
      options.target_summaries.ios = JSON.parse(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--npm-summary' && args[i + 1]) {
      options.target_summaries.npm = JSON.parse(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--output-dir' && args[i + 1]) {
      outputDir = resolve(args[i + 1]);
      i += 1;
    }
  }

  const summary = aggregateReleaseSummary(options);
  const root = resolve(outputDir, summary.release_id || 'missing-release-id');
  await mkdir(root, { recursive: true });
  const jsonPath = resolve(root, 'summary.json');
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const markdown = [
    '# Cross-Platform Release Summary',
    '',
    `- Release ID: \`${summary.release_id}\``,
    `- Source commit: \`${summary.source_commit || 'unknown'}\``,
    `- Overall status: \`${summary.overall_status}\``,
    '',
    '## Target outcomes',
    ...Object.values(summary.targets).map((target) => `- ${target.target}: ${target.terminal_status}`),
  ].join('\n');
  await writeFile(resolve(root, 'summary.md'), `${markdown}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ summaryPath: jsonPath }, null, 2)}\n`);
}
