import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SMOKE_REPORT_V1_REQUIRED_KEYS,
  detectSmokeReportV1SemanticDrift,
  validateSmokeReportV1,
  validateSmokeReportV1Compatibility,
} from '../scripts/report-schema.mjs';
import {
  buildSmokeReportV1,
  createInitialSmokeVerdict,
  reduceSmokeVerdict,
} from './smoke-verdict.js';

const pausedSnapshot = {
  state: 'paused',
  currentTrack: { title: 'Demo Track 1' },
  position: 1425,
  duration: 3000,
};

const createPassingVerdict = () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'smoke' });
  const withSnapshot = reduceSmokeVerdict(started, { type: 'snapshot', snapshot: pausedSnapshot });
  return reduceSmokeVerdict(withSnapshot, { type: 'complete' });
};

test('SmokeReportV1 contract keeps all required keys for PASS reports', () => {
  const report = buildSmokeReportV1({
    verdict: createPassingVerdict(),
    recentEvents: ['setup complete', 'smoke complete'],
  });

  assert.equal(report.status, 'PASS');
  assert.deepEqual(
    Object.keys(report).filter((key) => SMOKE_REPORT_V1_REQUIRED_KEYS.includes(key)).sort(),
    [...SMOKE_REPORT_V1_REQUIRED_KEYS].sort(),
  );

  const validation = validateSmokeReportV1(report);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test('SmokeReportV1 contract forces actionable errors for FAIL reports', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'smoke' });
  const failedVerdict = reduceSmokeVerdict(started, { type: 'error', message: 'native playback failed' });

  const report = buildSmokeReportV1({
    verdict: failedVerdict,
    recentEvents: ['setup complete', 'smoke failed'],
  });

  assert.equal(report.status, 'FAIL');
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /native playback failed/);

  const validation = validateSmokeReportV1(report);
  assert.equal(validation.ok, true);
});

test('SmokeReportV1 compatibility allows additive fields without breaking v1 consumers', () => {
  const report = buildSmokeReportV1({
    verdict: createPassingVerdict(),
    recentEvents: ['setup complete'],
  });

  const withMetadata = {
    ...report,
    metadata: {
      platform: 'android',
      collectedAt: '2026-04-22T00:00:00.000Z',
    },
  };

  const compatibility = validateSmokeReportV1Compatibility(withMetadata);
  assert.equal(compatibility.ok, true);
  assert.deepEqual(compatibility.errors, []);
});

test('SmokeReportV1 accepts optional request evidence payload keyed by runtime + track', () => {
  const report = buildSmokeReportV1({
    verdict: createPassingVerdict(),
    recentEvents: ['setup complete'],
    requestEvidence: {
      byRuntime: {
        ios: {
          byTrack: {
            'track-auth-a': {
              requests: [
                {
                  requestUrl: 'https://media.example.com/auth-a.m3u8',
                  requestHeaders: { Authorization: 'Bearer ios-a' },
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
          label: 'auth track includes authorization header',
          ok: true,
          detail: 'track-auth-a request carried Authorization header',
        },
        {
          label: 'public track has no leaked authorization header',
          ok: true,
          detail: 'track-public request did not include auth header',
        },
      ],
    },
  });

  const validation = validateSmokeReportV1(report);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test('SmokeReportV1 compatibility fails when required keys are removed', () => {
  const report = buildSmokeReportV1({
    verdict: createPassingVerdict(),
    recentEvents: ['setup complete'],
  });

  const broken = { ...report };
  delete broken.recentEvents;

  const compatibility = validateSmokeReportV1Compatibility(broken);
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.errors.some((error) => error.includes('recentEvents')), true);
});

test('SmokeReportV1 semantic drift detection rejects required-key meaning changes', () => {
  const drift = detectSmokeReportV1SemanticDrift({
    schemaVersion: 'number-latest',
    flow: 'string-any-flow',
    status: 'enum-pass-fail-running',
    checks: 'array-check-entry',
    snapshotSummary: 'string-summary',
    recentEvents: 'array-recent-events',
    errors: 'array-error-message',
  });

  assert.equal(drift.ok, false);
  assert.equal(drift.errors.some((error) => error.includes('schemaVersion')), true);
  assert.equal(drift.errors.some((error) => error.includes('status')), true);
});
