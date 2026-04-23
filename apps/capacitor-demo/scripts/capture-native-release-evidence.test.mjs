import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  captureNativeReleaseEvidence,
  formatCaptureSummary,
} from './capture-native-release-evidence.mjs';

test('capture copies required evidence files and writes manifest', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-native-evidence-'));
  const sourceDir = join(tempDir, 'source');
  const outputDir = join(tempDir, 'output');

  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, 'android-resolution.log'), 'android deps ok\n', 'utf8');
  await writeFile(join(sourceDir, 'ios-resolution.log'), 'ios resolver ok\n', 'utf8');
  await writeFile(join(sourceDir, 'android-smoke-report.json'), '{"status":"PASS"}\n', 'utf8');
  await writeFile(join(sourceDir, 'ios-smoke-report.json'), '{"status":"PASS"}\n', 'utf8');

  const result = await captureNativeReleaseEvidence({
    androidResolutionLogPath: join(sourceDir, 'android-resolution.log'),
    iosResolutionLogPath: join(sourceDir, 'ios-resolution.log'),
    androidSmokeReportPath: join(sourceDir, 'android-smoke-report.json'),
    iosSmokeReportPath: join(sourceDir, 'ios-smoke-report.json'),
    outputDir,
  });

  const manifestRaw = await readFile(result.manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.status, 'PASS');
  assert.equal(typeof manifest.artifacts.androidResolutionLog, 'string');
  assert.equal(typeof manifest.artifacts.iosResolutionLog, 'string');
  assert.equal(typeof manifest.artifacts.androidSmokeReport, 'string');
  assert.equal(typeof manifest.artifacts.iosSmokeReport, 'string');
  assert.equal(manifest.failures.length, 0);

  const copiedAndroidResolution = await readFile(manifest.artifacts.androidResolutionLog, 'utf8');
  assert.match(copiedAndroidResolution, /android deps ok/i);

  const summary = formatCaptureSummary(manifest);
  assert.match(summary, /Overall: PASS/i);
  assert.match(summary, /manifest:/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('capture fails with actionable message when any required evidence file is missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-native-evidence-missing-'));
  const sourceDir = join(tempDir, 'source');
  const outputDir = join(tempDir, 'output');

  await mkdir(sourceDir, { recursive: true });

  const result = await captureNativeReleaseEvidence({
    androidResolutionLogPath: join(sourceDir, 'android-resolution.log'),
    iosResolutionLogPath: join(sourceDir, 'ios-resolution.log'),
    androidSmokeReportPath: join(sourceDir, 'android-smoke-report.json'),
    iosSmokeReportPath: join(sourceDir, 'ios-smoke-report.json'),
    outputDir,
  });

  const manifestRaw = await readFile(result.manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.status, 'FAIL');
  assert.equal(manifest.exitCode, 1);
  assert.match(manifest.failures.join('\n'), /android-resolution\.log/i);
  assert.match(manifest.failures.join('\n'), /ios-resolution\.log/i);

  await rm(tempDir, { recursive: true, force: true });
});
