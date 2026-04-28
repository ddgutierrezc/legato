import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  validateClosureBundleEnvelope,
  validateFreshHeadCloseoutEnvelope,
  validateReleaseExecutionPacketEnvelope,
} from './release-control-summary-schema.mjs';

const normalizeSha = (value) => String(value ?? '').trim().toLowerCase();

const inferCurrentHead = () => {
  try {
    return normalizeSha(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }));
  } catch {
    return '';
  }
};

const inferFastForward = (expectedHead, currentHead) => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', expectedHead, currentHead], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export const validateReleaseCloseout = ({
  releaseId,
  closureBundle,
  packet,
  expectedHead,
  currentHead,
  isFastForward,
} = {}) => {
  const closureValidation = validateClosureBundleEnvelope(closureBundle);
  if (!closureValidation.ok) {
    return {
      ok: false,
      code: 'SERIALIZATION_ERROR',
      errors: closureValidation.errors,
      recovery: ['Regenerate closure bundle and rerun closeout validation.'],
    };
  }

  const packetValidation = validateReleaseExecutionPacketEnvelope(packet);
  if (!packetValidation.ok) {
    return {
      ok: false,
      code: 'MISSING_RELEASE_PACKET',
      errors: packetValidation.errors,
      recovery: ['Regenerate release-execution-packet/v1 and rerun closeout validation.'],
    };
  }

  if (String(closureBundle?.reconciliation_verdict ?? '').trim() !== 'pass') {
    return {
      ok: false,
      code: 'STEP_ORDER_VIOLATION',
      errors: ['closeout requires reconciliation_verdict=pass before completion.'],
      recovery: ['Run reconcile step and rerun closeout validation.'],
    };
  }

  const canonicalReleaseId = String(releaseId ?? closureBundle?.release_id ?? packet?.release_id ?? '').trim();
  const canonicalExpectedHead = normalizeSha(expectedHead || closureBundle?.expected_head || closureBundle?.source_commit);
  const canonicalCurrentHead = normalizeSha(currentHead || inferCurrentHead());
  const ff = typeof isFastForward === 'boolean'
    ? isFastForward
    : inferFastForward(canonicalExpectedHead, canonicalCurrentHead);

  if (canonicalExpectedHead !== canonicalCurrentHead) {
    return {
      ok: false,
      code: 'STALE_HEAD',
      envelope: {
        schema_version: 'release-closeout-fresh-head/v1',
        release_id: canonicalReleaseId,
        status: 'FAIL',
        code: 'STALE_HEAD',
        expected_head: canonicalExpectedHead,
        current_head: canonicalCurrentHead,
        recovery: [
          'git fetch --all',
          'git rebase origin/main',
          'rerun mixed canary + closeout validator',
        ],
      },
      recovery: ['Fetch/rebase to latest HEAD, then rerun closeout validation.'],
    };
  }

  if (!ff) {
    return {
      ok: false,
      code: 'NON_FAST_FORWARD_HEAD',
      envelope: {
        schema_version: 'release-closeout-fresh-head/v1',
        release_id: canonicalReleaseId,
        status: 'FAIL',
        code: 'NON_FAST_FORWARD_HEAD',
        expected_head: canonicalExpectedHead,
        current_head: canonicalCurrentHead,
        recovery: [
          'Resolve divergence to fast-forward state',
          'rerun closeout validator',
        ],
      },
      recovery: ['Resolve non-fast-forward divergence and rerun closeout validation.'],
    };
  }

  const passEnvelope = {
    schema_version: 'release-closeout-fresh-head/v1',
    release_id: canonicalReleaseId,
    status: 'PASS',
    code: null,
    expected_head: canonicalExpectedHead,
    current_head: canonicalCurrentHead,
    recovery: [],
  };
  const validation = validateFreshHeadCloseoutEnvelope(passEnvelope);
  if (!validation.ok) {
    return {
      ok: false,
      code: 'SERIALIZATION_ERROR',
      errors: validation.errors,
      recovery: ['Fix closeout envelope serialization and rerun.'],
    };
  }

  return {
    ok: true,
    code: null,
    envelope: passEnvelope,
    recovery: [],
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--closure-bundle' && args[i + 1]) {
      options.closureBundlePath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-packet' && args[i + 1]) {
      options.releasePacketPath = args[i + 1];
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
      continue;
    }
    if (arg === '--output' && args[i + 1]) {
      options.outputPath = args[i + 1];
      i += 1;
    }
  }

  const closureBundle = JSON.parse(await readFile(resolve(options.closureBundlePath), 'utf8'));
  const packet = JSON.parse(await readFile(resolve(options.releasePacketPath), 'utf8'));
  const result = validateReleaseCloseout({
    releaseId: closureBundle.release_id,
    closureBundle,
    packet,
    expectedHead: options.expectedHead,
    currentHead: options.currentHead,
  });

  const envelope = result.envelope ?? {
    schema_version: 'release-closeout-fresh-head/v1',
    release_id: String(closureBundle?.release_id ?? '').trim(),
    status: 'FAIL',
    code: result.code ?? 'UNKNOWN',
    expected_head: normalizeSha(options.expectedHead || closureBundle?.expected_head || closureBundle?.source_commit),
    current_head: normalizeSha(options.currentHead || inferCurrentHead()),
    recovery: result.recovery ?? [],
  };

  const envelopeValidation = validateFreshHeadCloseoutEnvelope(envelope);
  if (!envelopeValidation.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: 'SERIALIZATION_ERROR', errors: envelopeValidation.errors }, null, 2)}\n`);
    process.exit(1);
  }

  if (options.outputPath) {
    await writeFile(resolve(options.outputPath), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
