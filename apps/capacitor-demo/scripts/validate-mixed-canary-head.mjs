import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const PASS = 'PASS';
const FAIL = 'FAIL';
const REQUIRED_MIXED_TARGETS = ['android', 'ios', 'npm'];

const normalizeCommit = (value) => String(value ?? '').trim().toLowerCase();

export const parseMixedCanaryEvidence = (evidenceMarkdown = '') => {
  const sourceCommitMatch = evidenceMarkdown.match(/^-\s*Source commit:\s*`?([0-9a-f]{40})`?/im);
  const runUrlMatch = evidenceMarkdown.match(/^-\s*Run URL:\s*(\S+)/im);
  const summaryArtifactMatch = evidenceMarkdown.match(/^-\s*Summary artifact:\s*(\S+)/im);
  const targetsMatch = evidenceMarkdown.match(/^-\s*Targets in run:\s*`([^`]+)`/im);

  const targets = (targetsMatch?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return {
    sourceCommit: normalizeCommit(sourceCommitMatch?.[1] ?? ''),
    runUrl: String(runUrlMatch?.[1] ?? '').trim(),
    summaryArtifact: String(summaryArtifactMatch?.[1] ?? '').trim(),
    targets,
  };
};

export const validateMixedCanaryHeadEvidence = ({
  evidenceMarkdown = '',
  expectedHead = '',
} = {}) => {
  const parsed = parseMixedCanaryEvidence(evidenceMarkdown);
  const normalizedExpectedHead = normalizeCommit(expectedHead);
  const failures = [];

  if (!parsed.runUrl) {
    failures.push('Mixed canary evidence missing Run URL.');
  }

  if (!parsed.summaryArtifact) {
    failures.push('Mixed canary evidence missing Summary artifact reference.');
  }

  if (!parsed.sourceCommit) {
    failures.push('Mixed canary evidence missing source_commit field.');
  }

  if (!normalizedExpectedHead) {
    failures.push('Missing latest HEAD commit for freshness validation.');
  }

  const targetsSet = new Set(parsed.targets);
  const hasMixedTargets = REQUIRED_MIXED_TARGETS.every((target) => targetsSet.has(target));
  if (!hasMixedTargets) {
    failures.push('Mixed canary evidence must declare Targets in run as android,ios,npm.');
  }

  if (parsed.sourceCommit && normalizedExpectedHead && parsed.sourceCommit !== normalizedExpectedHead) {
    failures.push(`Mixed canary source_commit (${parsed.sourceCommit}) does not match latest HEAD (${normalizedExpectedHead}); sign-off is blocked.`);
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    sections: {
      fresh_head_evidence: status,
    },
    expectedHead: normalizedExpectedHead,
    parsed,
    failures,
  };
};

export const formatMixedCanaryHeadValidation = (result) => {
  const lines = [
    `Overall: ${result.status}`,
    `fresh_head_evidence: ${result.sections.fresh_head_evidence}`,
  ];

  if (result.expectedHead) {
    lines.push(`expected_head: ${result.expectedHead}`);
  }
  if (result.parsed.sourceCommit) {
    lines.push(`source_commit: ${result.parsed.sourceCommit}`);
  }

  if (result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const parseArgs = (argv = []) => {
  const options = {
    evidenceFilePath: '',
    expectedHead: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence-file' && argv[i + 1]) {
      options.evidenceFilePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--expected-head' && argv[i + 1]) {
      options.expectedHead = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const resolveExpectedHead = (explicitHead) => {
  const normalizedExplicit = normalizeCommit(explicitHead);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  try {
    const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    return normalizeCommit(gitHead);
  } catch {
    return '';
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.evidenceFilePath) {
    process.stdout.write('Overall: FAIL\nfresh_head_evidence: FAIL\nFailures:\n- Usage: node scripts/validate-mixed-canary-head.mjs --evidence-file <path> [--expected-head <sha>]\n');
    process.exit(1);
  }

  try {
    const evidenceMarkdown = await readFile(options.evidenceFilePath, 'utf8');
    const expectedHead = resolveExpectedHead(options.expectedHead);
    const result = validateMixedCanaryHeadEvidence({ evidenceMarkdown, expectedHead });
    process.stdout.write(`${formatMixedCanaryHeadValidation(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Overall: FAIL\nfresh_head_evidence: FAIL\nFailures:\n- Failed to validate mixed canary evidence: ${message}\n`);
    process.exit(1);
  }
}
