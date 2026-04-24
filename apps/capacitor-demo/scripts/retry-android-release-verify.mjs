import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const PASS = 'PASS';
const FAIL = 'FAIL';
const CONFIG_ERROR_EXIT_CODE = 2;

const toPositiveInteger = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: expected positive integer, received ${value}`);
  }
  return parsed;
};

export const parseRetryConfig = (argv) => {
  const config = {
    attempts: 6,
    backoffMs: 120000,
    command: 'npm run release:android:verify',
    summaryFile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--attempts' && argv[i + 1]) {
      config.attempts = toPositiveInteger(argv[i + 1], 'attempts');
      i += 1;
      continue;
    }
    if (arg === '--backoff-ms' && argv[i + 1]) {
      config.backoffMs = toPositiveInteger(argv[i + 1], 'backoff-ms');
      i += 1;
      continue;
    }
    if (arg === '--command' && argv[i + 1]) {
      config.command = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--summary-file' && argv[i + 1]) {
      config.summaryFile = argv[i + 1];
      i += 1;
    }
  }

  return config;
};

const defaultRunCommand = async (command) => new Promise((resolvePromise) => {
  const child = spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('close', (code) => {
    resolvePromise({ exitCode: Number.isInteger(code) ? code : 1 });
  });

  child.on('error', () => {
    resolvePromise({ exitCode: 1 });
  });
});

const wait = (ms) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, ms);
});

export const retryAndroidReleaseVerify = async ({
  attempts,
  backoffMs,
  command,
  runCommand = defaultRunCommand,
  sleep = wait,
} = {}) => {
  const retries = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runCommand(command, attempt);
    const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : 1;
    retries.push({
      attempt,
      exitCode,
      status: exitCode === 0 ? PASS : FAIL,
    });

    if (exitCode === 0) {
      return {
        status: PASS,
        exitCode: 0,
        attemptsConfigured: attempts,
        attemptsUsed: attempt,
        backoffMs,
        command,
        retries,
      };
    }

    if (attempt < attempts) {
      await sleep(backoffMs);
    }
  }

  return {
    status: FAIL,
    exitCode: 1,
    attemptsConfigured: attempts,
    attemptsUsed: attempts,
    backoffMs,
    command,
    retries,
    failures: [`Android verify did not pass after ${attempts} attempt(s).`],
  };
};

export const formatVerifyRetrySummary = (result) => {
  const lines = [
    `Mode: verify-retry`,
    `Overall: ${result.status}`,
    `Attempts configured: ${result.attemptsConfigured}`,
    `Attempts used: ${result.attemptsUsed}`,
    `Backoff (ms): ${result.backoffMs}`,
  ];

  if (Array.isArray(result.retries) && result.retries.length > 0) {
    lines.push('Attempt results:');
    for (const retry of result.retries) {
      lines.push(`- #${retry.attempt}: ${retry.status} (exit ${retry.exitCode})`);
    }
  }

  if (Array.isArray(result.failures) && result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const writeSummaryJson = async (summaryFile, result) => {
  if (!summaryFile) {
    return;
  }

  const outputPath = resolve(summaryFile);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  let config;
  try {
    config = parseRetryConfig(process.argv.slice(2));
  } catch (error) {
    process.stdout.write(`Mode: verify-retry\nOverall: FAIL\nFailures:\n- ${error.message}\n`);
    process.exit(CONFIG_ERROR_EXIT_CODE);
  }

  const result = await retryAndroidReleaseVerify(config);
  await writeSummaryJson(config.summaryFile, result);
  process.stdout.write(`${formatVerifyRetrySummary(result)}\n`);
  process.exit(result.exitCode);
}
