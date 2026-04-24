import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { promoteIosDistribution } from '../promote-ios-distribution.mjs';

const writeMinimalSourceTree = async (sourceRoot, { packageName = 'LegatoCore', productName = 'LegatoCore', extraTopLevel = [] } = {}) => {
  await mkdir(join(sourceRoot, 'Sources/LegatoCore/Core'), { recursive: true });
  await mkdir(join(sourceRoot, 'Sources/LegatoCoreSessionRuntimeiOS'), { recursive: true });
  await mkdir(join(sourceRoot, 'Tests/LegatoCoreTests/Core'), { recursive: true });
  await mkdir(join(sourceRoot, 'Tests/LegatoCoreSessionRuntimeiOSTests'), { recursive: true });

  await writeFile(join(sourceRoot, 'README.md'), '# Source package\n', 'utf8');
  await writeFile(
    join(sourceRoot, 'Package.swift'),
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${packageName}",
    products: [
        .library(name: "${productName}", targets: ["LegatoCore"])
    ],
    targets: [
        .target(name: "LegatoCore", path: "Sources/LegatoCore"),
        .target(name: "LegatoCoreSessionRuntimeiOS", dependencies: ["LegatoCore"], path: "Sources/LegatoCoreSessionRuntimeiOS"),
        .testTarget(name: "LegatoCoreTests", dependencies: ["LegatoCore"], path: "Tests/LegatoCoreTests"),
        .testTarget(name: "LegatoCoreSessionRuntimeiOSTests", dependencies: ["LegatoCore", "LegatoCoreSessionRuntimeiOS"], path: "Tests/LegatoCoreSessionRuntimeiOSTests")
    ]
)
`,
    'utf8',
  );
  await writeFile(join(sourceRoot, 'Sources/LegatoCore/Core/Engine.swift'), 'public struct Engine {}\n', 'utf8');
  await writeFile(join(sourceRoot, 'Sources/LegatoCoreSessionRuntimeiOS/Runtime.swift'), 'public struct Runtime {}\n', 'utf8');
  await writeFile(join(sourceRoot, 'Tests/LegatoCoreTests/Core/EngineTests.swift'), 'import Testing\n', 'utf8');
  await writeFile(join(sourceRoot, 'Tests/LegatoCoreSessionRuntimeiOSTests/RuntimeTests.swift'), 'import Testing\n', 'utf8');

  for (const entry of extraTopLevel) {
    await writeFile(join(sourceRoot, entry), 'extra\n', 'utf8');
  }
};

test('promotion exports allowed payload and writes provenance metadata', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-promote-pass-'));
  const sourceRoot = join(tempDir, 'source');
  const destinationRoot = join(tempDir, 'destination');

  await writeMinimalSourceTree(sourceRoot);

  const result = await promoteIosDistribution({
    sourceRoot,
    destinationRoot,
    releaseTag: 'v0.1.1',
    sourceRepo: 'https://github.com/ddgutierrezc/legato.git',
    sourceCommit: '1111111111111111111111111111111111111111',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.version, '0.1.1');
  const provenanceRaw = await readFile(join(destinationRoot, 'distribution-provenance.json'), 'utf8');
  const provenance = JSON.parse(provenanceRaw);
  assert.equal(provenance.packageName, 'LegatoCore');
  assert.equal(provenance.product, 'LegatoCore');
  assert.equal(provenance.version, '0.1.1');
  assert.equal(provenance.releaseTag, 'v0.1.1');
  assert.equal(provenance.sourceCommit, '1111111111111111111111111111111111111111');

  await rm(tempDir, { recursive: true, force: true });
});

test('promotion fails when required source paths are missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-promote-missing-'));
  const sourceRoot = join(tempDir, 'source');
  const destinationRoot = join(tempDir, 'destination');
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, 'Package.swift'), 'let package = Package(name: "LegatoCore")\n', 'utf8');

  const result = await promoteIosDistribution({ sourceRoot, destinationRoot, releaseTag: 'v0.1.1' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /Missing required file in source package: README\.md/i);
  assert.match(result.failures.join('\n'), /Missing required directory in source package: Sources\/LegatoCore/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('promotion fails on unexpected extra top-level source paths', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-promote-extra-'));
  const sourceRoot = join(tempDir, 'source');
  const destinationRoot = join(tempDir, 'destination');
  await writeMinimalSourceTree(sourceRoot, { extraTopLevel: ['NOT_ALLOWED.txt'] });

  const result = await promoteIosDistribution({ sourceRoot, destinationRoot, releaseTag: 'v0.1.1' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /Unexpected top-level entries/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('promotion fails when package identity drifts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-promote-identity-'));
  const sourceRoot = join(tempDir, 'source');
  const destinationRoot = join(tempDir, 'destination');
  await writeMinimalSourceTree(sourceRoot, { packageName: 'WrongCore', productName: 'WrongCore' });

  const result = await promoteIosDistribution({ sourceRoot, destinationRoot, releaseTag: 'v0.1.1' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /Package identity drift/i);
  assert.match(result.failures.join('\n'), /Product identity drift/i);

  await rm(tempDir, { recursive: true, force: true });
});
