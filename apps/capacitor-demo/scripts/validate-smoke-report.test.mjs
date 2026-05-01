import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  validateSmokeReports,
  formatValidationSummary,
} from './validate-smoke-report.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const validatorEntrypoint = resolve(currentDir, 'validate-smoke-report.mjs');

const createPassReport = (platform) => ({
  schemaVersion: 1,
  flow: 'smoke',
  status: 'PASS',
  checks: [
    { label: 'current track present', ok: true, detail: 'track title exists' },
    { label: 'state is present', ok: true, detail: 'state=paused' },
  ],
  snapshotSummary: 'state=paused | track=fixture',
  recentEvents: ['[smoke] completed'],
  errors: [],
  metadata: {
    platform,
    collectedAt: '2026-04-22T21:00:00.000Z',
  },
  runtimeIntegrity: {
    transportCommandsObserved: true,
    progressAdvancedWhilePlaying: true,
    trackEndTransitionObserved: false,
    snapshotProjectionCoherent: true,
    details: {
      transport: 'setup/add/play/pause observed',
      progress: 'position advanced by 1.2s',
      trackEnd: 'not covered in smoke flow',
      snapshot: 'snapshot coherence verified',
    },
  },
  parityEvidence: {
    addStartIndexConverged: true,
    remoteOrderConverged: true,
    eventStateSnapshotConverged: true,
    capabilitiesConverged: true,
    seekSemanticsConverged: true,
    details: {
      addStartIndex: 'add(startIndex) activated expected queue index.',
      remoteOrder: 'remote events emitted after canonical mutation events.',
      eventStateSnapshot: 'single assertion contract matched event/state/snapshot outputs.',
      capabilities: 'getCapabilities payload matched projected transport capabilities.',
      seekSemantics: 'seekability matrix aligned with media type, duration evidence, and runtime support.',
    },
  },
  requestEvidence: {
    byRuntime: {
      [platform]: {
        byTrack: {
          'track-auth-a': {
            requests: [
              {
                requestUrl: 'https://media.example.com/auth-a.m3u8',
                requestHeaders: { Authorization: 'Bearer auth-a' },
              },
            ],
          },
          'track-public': {
            requests: [
              {
                requestUrl: 'https://media.example.com/public.mp3',
                requestHeaders: {},
              },
            ],
          },
        },
      },
    },
    assertions: [
      {
        label: 'shared group A includes expected Authorization header',
        ok: true,
        detail: 'track-auth-a request carried Authorization=Bearer auth-a',
      },
      {
        label: 'shared group B includes expected Authorization header',
        ok: true,
        detail: 'track-auth-b request carried Authorization=Bearer auth-b',
      },
      {
        label: 'per-track override precedence uses track Authorization over shared group',
        ok: true,
        detail: 'track-override used Authorization=Bearer override-token while groupA remained Bearer auth-a',
      },
      {
        label: 'public track without leaked Authorization',
        ok: true,
        detail: 'track-public request headers were empty',
      },
      {
        label: 'mixed-token playlist behavior keeps group tokens isolated per track',
        ok: true,
        detail: 'observed auth values were scoped to their track IDs with no cross-track bleed',
      },
    ],
  },
});

const withRuntimeIntegrity = (report) => ({
  ...report,
  runtimeIntegrity: {
    transportCommandsObserved: true,
    progressAdvancedWhilePlaying: true,
    trackEndTransitionObserved: false,
    snapshotProjectionCoherent: true,
    details: {
      transport: 'setup/add/play/pause observed',
      progress: 'position advanced by 1.2s',
      trackEnd: 'not covered in smoke flow',
      snapshot: 'snapshot coherence verified',
    },
  },
});

const createCollectorFailReport = (platform) => ({
  schemaVersion: 1,
  flow: 'smoke',
  status: 'FAIL',
  checks: [{ label: `${platform}-collector`, ok: false, detail: 'collector retrieval failed at find-marker' }],
  snapshotSummary: `collector retrieval failed (platform=${platform}, step=find-marker)`,
  recentEvents: [],
  errors: ['Could not find LEGATO_SMOKE_REPORT marker in log output.'],
  metadata: {
    platform,
    step: 'find-marker',
    collectedAt: '2026-04-22T21:00:00.000Z',
  },
  runtimeIntegrity: {
    transportCommandsObserved: false,
    progressAdvancedWhilePlaying: false,
    trackEndTransitionObserved: false,
    snapshotProjectionCoherent: false,
    details: {
      transport: 'collector failed before transport verification',
      progress: 'collector failed before progress verification',
      trackEnd: 'collector failed before track-end verification',
      snapshot: 'collector failed before snapshot verification',
    },
  },
  parityEvidence: {
    addStartIndexConverged: false,
    remoteOrderConverged: false,
    eventStateSnapshotConverged: false,
    capabilitiesConverged: false,
    seekSemanticsConverged: false,
    details: {
      addStartIndex: 'collector failed before add(startIndex) verification',
      remoteOrder: 'collector failed before remote order verification',
      eventStateSnapshot: 'collector failed before event/state/snapshot verification',
      capabilities: 'collector failed before capabilities verification',
      seekSemantics: 'collector failed before seek semantics verification',
    },
  },
});

const runValidatorCli = async (reportPaths) => new Promise((resolveResult) => {
  const child = spawn(process.execPath, [validatorEntrypoint, ...reportPaths], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    resolveResult({ code, stdout, stderr });
  });
});

test('shared validator marks all-platform PASS when every normalized report passes schema and checks', () => {
  const result = validateSmokeReports([
    { path: 'android.json', report: createPassReport('android') },
    { path: 'ios.json', report: withRuntimeIntegrity(createPassReport('ios')) },
  ]);

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
  assert.equal(result.platforms.android.status, 'PASS');
  assert.equal(result.platforms.ios.status, 'PASS');
});

test('shared validator marks FAIL when any platform artifact carries collector or smoke failure', () => {
  const result = validateSmokeReports([
    { path: 'android.json', report: createPassReport('android') },
    { path: 'ios.json', report: createCollectorFailReport('ios') },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.platforms.android.status, 'PASS');
  assert.equal(result.platforms.ios.status, 'FAIL');
  assert.equal(result.failures.length > 0, true);
  assert.match(result.failures[0], /ios/i);
  assert.match(result.failures[0], /collector retrieval failed/i);
});

test('shared validator marks FAIL on schema contract violations even if report says PASS', () => {
  const invalidReport = createPassReport('android');
  delete invalidReport.snapshotSummary;

  const result = validateSmokeReports([{ path: 'android.json', report: invalidReport }]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.platforms.android.status, 'FAIL');
  assert.equal(result.failures.length > 0, true);
  assert.match(result.failures[0], /missing required key: snapshotSummary/i);
});

test('summary output is stable and includes per-platform verdict lines', () => {
  const result = validateSmokeReports([
    { path: 'android.json', report: createPassReport('android') },
    { path: 'ios.json', report: createCollectorFailReport('ios') },
  ]);

  const summary = formatValidationSummary(result);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /android: PASS/i);
  assert.match(summary, /ios: FAIL/i);
  assert.match(summary, /collector retrieval failed/i);
});

test('CLI exits with 0 when all supplied artifacts validate as PASS', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-validator-pass-'));
  const androidPath = join(tempDir, 'android.json');
  const iosPath = join(tempDir, 'ios.json');

  await writeFile(androidPath, `${JSON.stringify(createPassReport('android'))}\n`, 'utf8');
  await writeFile(iosPath, `${JSON.stringify(withRuntimeIntegrity(createPassReport('ios')))}\n`, 'utf8');

  try {
    const result = await runValidatorCli([androidPath, iosPath]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Overall: PASS/i);
    assert.equal(result.stderr, '');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('shared validator fails iOS PASS artifacts when runtime integrity payload is missing', () => {
  const iosWithoutRuntimeIntegrity = createPassReport('ios');
  delete iosWithoutRuntimeIntegrity.runtimeIntegrity;

  const result = validateSmokeReports([
    { path: 'ios.json', report: iosWithoutRuntimeIntegrity },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.ios.status, 'FAIL');
  assert.match(result.failures[0], /runtimeIntegrity/i);
});

test('CLI exits non-zero with actionable output when any artifact fails validation', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-validator-fail-'));
  const androidPath = join(tempDir, 'android.json');
  const iosPath = join(tempDir, 'ios.json');

  await writeFile(androidPath, `${JSON.stringify(createPassReport('android'))}\n`, 'utf8');
  await writeFile(iosPath, `${JSON.stringify(createCollectorFailReport('ios'))}\n`, 'utf8');

  try {
    const result = await runValidatorCli([androidPath, iosPath]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Overall: FAIL/i);
    assert.match(result.stdout, /ios: FAIL/i);
    assert.match(result.stdout, /collector retrieval failed/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('shared validator fails PASS artifacts when parity evidence payload is missing', () => {
  const androidWithoutParityEvidence = createPassReport('android');
  delete androidWithoutParityEvidence.parityEvidence;

  const result = validateSmokeReports([
    { path: 'android.json', report: androidWithoutParityEvidence },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.android.status, 'FAIL');
  assert.match(result.failures[0], /parity.?evidence/i);
});

test('shared validator fails PASS artifacts when seek semantics parity does not converge', () => {
  const report = createPassReport('android');
  report.parityEvidence.seekSemanticsConverged = false;
  report.parityEvidence.details.seekSemantics = 'streaming-like fixture reported seek=true with no finite evidence';

  const result = validateSmokeReports([
    { path: 'android.json', report },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.android.status, 'FAIL');
  assert.match(result.failures[0], /seek-semantics parity/i);
});

test('shared validator fails PASS artifacts when request evidence payload is missing', () => {
  const reportWithoutRequestEvidence = createPassReport('android');
  delete reportWithoutRequestEvidence.requestEvidence;

  const result = validateSmokeReports([
    { path: 'android.json', report: reportWithoutRequestEvidence },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.android.status, 'FAIL');
  assert.match(result.failures[0], /request.?evidence/i);
});

test('shared validator fails PASS artifacts when request evidence assertions flag leakage', () => {
  const leakedReport = createPassReport('ios');
  leakedReport.requestEvidence.assertions = [
    {
      label: 'public track has no leaked authorization header',
      ok: false,
      detail: 'track-public request leaked Authorization header from previous track',
    },
  ];

  const result = validateSmokeReports([
    { path: 'ios.json', report: leakedReport },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.ios.status, 'FAIL');
  assert.match(result.failures[0], /request.?evidence/i);
  assert.match(result.failures[0], /leaked Authorization/i);
});

test('shared validator fails PASS artifacts missing shared-playback-headers assertion coverage', () => {
  const report = createPassReport('android');
  report.requestEvidence.assertions = [
    {
      label: 'auth track includes authorization header',
      ok: true,
      detail: 'legacy assertion only',
    },
  ];

  const result = validateSmokeReports([
    { path: 'android.json', report },
  ]);

  assert.equal(result.status, 'FAIL');
  assert.equal(result.platforms.android.status, 'FAIL');
  assert.match(result.failures[0], /missing shared-playback-headers coverage/i);
  assert.match(result.failures[0], /shared group A/i);
});
