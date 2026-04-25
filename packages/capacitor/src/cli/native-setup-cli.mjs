import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  LEGATO_ANDROID_GROUNDWORK_CONTRACT,
  LEGATO_ANDROID_PLAYBACK_SERVICE_CLASS,
} from './android-groundwork-contract.mjs';

const SERVICE_CLASS = LEGATO_ANDROID_PLAYBACK_SERVICE_CLASS;

const IOS_PLIST_PATH = 'apps/capacitor-demo/ios/App/App/Info.plist';
const ANDROID_PLUGIN_MANIFEST_PATH = 'packages/capacitor/android/src/main/AndroidManifest.xml';

const SUPPORTED_PATCH_SET = new Set([IOS_PLIST_PATH, ANDROID_PLUGIN_MANIFEST_PATH]);

const GENERATED_FILE_MARKERS = ['ios/App/CapApp-SPM/'];

/**
 * @typedef {'ok' | 'missing' | 'misconfigured'} FindingStatus
 */

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   owner: 'repo-owned';
 *   file: string;
 *   status: FindingStatus;
 *   details: string;
 *   remediation: string;
 * }} Finding
 */

/**
 * @typedef {{
 *   ruleId: string;
 *   file: string;
 *   kind: 'replace-file' | 'insert-audio-background-mode';
 *   summary: string;
 *   safe: boolean;
 *   reason?: string;
 *   beforeDigest: string;
 *   afterDigest?: string;
 *   apply: (content: string) => string;
 * }} PlannedChange
 */

function writeJsonLine(stdout, value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(stderr) {
  stderr.write(
    [
      'Usage:',
      '  legato native doctor [--json]',
      '  legato native configure --dry-run [--json]',
      '  legato native configure --apply [--json]',
      '',
      'Notes:',
      '  - This is a repo-owned maintainer CLI, not a general consumer bootstrap CLI.',
      '  - configure defaults to no-op unless one of --dry-run/--apply is passed.',
      '  - apply only touches the repo-owned safe patch set.',
      '  - It does not mutate Capacitor-generated files (for example, ios/App/CapApp-SPM/**).',
    ].join('\n'),
  );
  stderr.write('\n');
}

function resolveRepoRoot(cwd) {
  let current = path.resolve(cwd);
  const root = path.parse(current).root;

  while (true) {
    const hasExpectedLayout =
      existsSync(path.join(current, 'packages', 'capacitor')) &&
      existsSync(path.join(current, 'apps', 'capacitor-demo'));

    if (hasExpectedLayout) {
      return current;
    }

    if (current === root) {
      return null;
    }

    current = path.dirname(current);
  }
}

function isGeneratedPath(relativePath) {
  return GENERATED_FILE_MARKERS.some((marker) => relativePath.includes(marker));
}

function digest(content) {
  return `${content.length}:${content.split('\n').length}`;
}

function findAll(content, pattern) {
  return [...content.matchAll(pattern)].map((m) => m[0]);
}

function buildAndroidManifestTemplate() {
  const permissionLines = LEGATO_ANDROID_GROUNDWORK_CONTRACT.requiredPermissions.map(
    (permission) => `    <uses-permission android:name="${permission}" />`,
  );

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    ...permissionLines,
    '    <application>',
    `        <service android:name="${SERVICE_CLASS}" android:exported="${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.exported}" android:foregroundServiceType="${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.foregroundServiceType}" />`,
    '    </application>',
    '</manifest>',
    '',
  ].join('\n');
}

function inspectIosBackgroundMode(content) {
  const keyRegex = /<key>\s*UIBackgroundModes\s*<\/key>/;
  const keyMatch = keyRegex.exec(content);
  if (!keyMatch) {
    return {
      status: 'missing',
      details: 'Info.plist is missing UIBackgroundModes.',
      remediation: 'Add UIBackgroundModes with an array containing audio.',
      desired: 'missing-key',
    };
  }

  const tail = content.slice(keyMatch.index + keyMatch[0].length);
  const arrayRegex = /<array>[\s\S]*?<\/array>/;
  const arrayMatch = arrayRegex.exec(tail);
  if (!arrayMatch) {
    return {
      status: 'misconfigured',
      details: 'UIBackgroundModes key exists but does not declare an array value.',
      remediation: 'Convert UIBackgroundModes to an array and include audio.',
      desired: 'invalid-shape',
    };
  }

  const hasAudio = /<string>\s*audio\s*<\/string>/.test(arrayMatch[0]);
  if (!hasAudio) {
    return {
      status: 'missing',
      details: 'UIBackgroundModes is present but audio is missing.',
      remediation: 'Add <string>audio</string> inside UIBackgroundModes array.',
      desired: 'missing-audio',
    };
  }

  return {
    status: 'ok',
    details: 'Info.plist includes UIBackgroundModes/audio.',
    remediation: 'No changes required.',
    desired: 'ok',
  };
}

function planIosBackgroundMode(content, file) {
  const inspection = inspectIosBackgroundMode(content);
  if (inspection.status === 'ok') {
    return [];
  }

  if (inspection.desired === 'invalid-shape') {
    return [
      {
        ruleId: 'ios.background-audio',
        file,
        kind: 'insert-audio-background-mode',
        summary: 'UIBackgroundModes exists with unsupported shape; manual patch required.',
        safe: false,
        reason: 'Unsupported plist structure for safe idempotent mutation.',
        beforeDigest: digest(content),
        apply: (currentContent) => currentContent,
      },
    ];
  }

  if (inspection.desired === 'missing-key') {
    if (!content.includes('</dict>')) {
      return [
        {
          ruleId: 'ios.background-audio',
          file,
          kind: 'insert-audio-background-mode',
          summary: 'Cannot inject UIBackgroundModes because </dict> was not found.',
          safe: false,
          reason: 'Unsupported plist format.',
          beforeDigest: digest(content),
          apply: (currentContent) => currentContent,
        },
      ];
    }

    const insertion = ['\t<key>UIBackgroundModes</key>', '\t<array>', '\t\t<string>audio</string>', '\t</array>']
      .join('\n');
    const next = content.replace('</dict>', `${insertion}\n</dict>`);

    return [
      {
        ruleId: 'ios.background-audio',
        file,
        kind: 'insert-audio-background-mode',
        summary: 'Add UIBackgroundModes/audio to Info.plist.',
        safe: true,
        beforeDigest: digest(content),
        afterDigest: digest(next),
        apply: () => next,
      },
    ];
  }

  const keyRegex = /<key>\s*UIBackgroundModes\s*<\/key>[\s\S]*?<array>([\s\S]*?)<\/array>/;
  const match = keyRegex.exec(content);
  if (!match) {
    return [
      {
        ruleId: 'ios.background-audio',
        file,
        kind: 'insert-audio-background-mode',
        summary: 'Cannot safely locate UIBackgroundModes array for insertion.',
        safe: false,
        reason: 'Could not match expected plist key/array layout.',
        beforeDigest: digest(content),
        apply: (currentContent) => currentContent,
      },
    ];
  }

  const full = match[0];
  const withAudio = full.replace('</array>', '\n\t\t<string>audio</string>\n\t</array>');
  const next = content.replace(full, withAudio);

  return [
    {
      ruleId: 'ios.background-audio',
      file,
      kind: 'insert-audio-background-mode',
      summary: 'Append audio to existing UIBackgroundModes array.',
      safe: true,
      beforeDigest: digest(content),
      afterDigest: digest(next),
      apply: () => next,
    },
  ];
}

function inspectAndroidPluginManifest(content) {
  const permissionMatches = new Map();
  for (const permission of LEGATO_ANDROID_GROUNDWORK_CONTRACT.requiredPermissions) {
    const escapedPermission = permission.replaceAll('.', '\\.');
    const count = findAll(
      content,
      new RegExp(`<uses-permission[^>]*android:name="${escapedPermission}"[^>]*\\/>`, 'g'),
    ).length;
    permissionMatches.set(permission, count);
  }

  const serviceDeclarations = findAll(
    content,
    new RegExp(`<service[^>]*android:name=\"${SERVICE_CLASS.replaceAll('.', '\\.')}\"[^>]*(?:>|/>)`, 'g'),
  );

  const missing = [];
  for (const [permission, count] of permissionMatches.entries()) {
    if (count === 0) {
      missing.push(permission);
    }
  }
  if (serviceDeclarations.length === 0) {
    missing.push(`service:${SERVICE_CLASS}`);
  } else {
    const hasExpectedExported = serviceDeclarations.some((service) =>
      service.includes(`android:exported="${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.exported}"`),
    );
    const hasExpectedForegroundServiceType = serviceDeclarations.some((service) =>
      service.includes(
        `android:foregroundServiceType="${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.foregroundServiceType}"`,
      ),
    );

    if (!hasExpectedExported) {
      missing.push(`service-exported:${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.exported}`);
    }
    if (!hasExpectedForegroundServiceType) {
      missing.push(
        `service-foregroundServiceType:${LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.foregroundServiceType}`,
      );
    }
  }

  if (missing.length === 0) {
    return {
      status: 'ok',
      details: 'Android plugin manifest includes required service and permissions.',
      remediation: 'No changes required.',
      missing,
    };
  }

  return {
    status: 'missing',
    details: `Android plugin manifest missing: ${missing.join(', ')}.`,
    remediation:
      'Add required foreground-service permissions and the contract playback service declaration in packages/capacitor/android/src/main/AndroidManifest.xml.',
    missing,
  };
}

function planAndroidPluginManifest(content, file) {
  const inspection = inspectAndroidPluginManifest(content);
  if (inspection.status === 'ok') {
    return [];
  }

  const normalized = content.trim();
  const isBootstrapEmpty =
    normalized === '<manifest />' ||
    normalized === '<?xml version="1.0" encoding="utf-8"?>\n<manifest />';

  if (!isBootstrapEmpty) {
    return [
      {
        ruleId: 'android.plugin-service-and-permissions',
        file,
        kind: 'replace-file',
        summary: 'Manifest has custom shape; review and patch manually.',
        safe: false,
        reason: 'Only bootstrap-empty manifest replacement is currently supported.',
        beforeDigest: digest(content),
        apply: (currentContent) => currentContent,
      },
    ];
  }

  const next = buildAndroidManifestTemplate();
  return [
    {
      ruleId: 'android.plugin-service-and-permissions',
      file,
      kind: 'replace-file',
      summary: 'Replace bootstrap-empty plugin AndroidManifest.xml with required declarations.',
      safe: true,
      beforeDigest: digest(content),
      afterDigest: digest(next),
      apply: () => next,
    },
  ];
}

function getFileContent(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      absolutePath,
      content: null,
      missing: true,
    };
  }

  return {
    absolutePath,
    content: readFileSync(absolutePath, 'utf-8'),
    missing: false,
  };
}

function evaluateRules(repoRoot) {
  const iosFile = getFileContent(repoRoot, IOS_PLIST_PATH);
  const androidFile = getFileContent(repoRoot, ANDROID_PLUGIN_MANIFEST_PATH);

  /** @type {Finding[]} */
  const findings = [];
  /** @type {PlannedChange[]} */
  const plannedChanges = [];

  if (iosFile.missing || iosFile.content == null) {
    findings.push({
      id: 'ios.background-audio',
      title: 'iOS Info.plist background audio mode',
      owner: 'repo-owned',
      file: IOS_PLIST_PATH,
      status: 'missing',
      details: 'Info.plist file was not found.',
      remediation: 'Ensure apps/capacitor-demo iOS host exists and rerun doctor.',
    });
  } else {
    const iosInspection = inspectIosBackgroundMode(iosFile.content);
    findings.push({
      id: 'ios.background-audio',
      title: 'iOS Info.plist background audio mode',
      owner: 'repo-owned',
      file: IOS_PLIST_PATH,
      status: iosInspection.status,
      details: iosInspection.details,
      remediation: iosInspection.remediation,
    });
    plannedChanges.push(...planIosBackgroundMode(iosFile.content, IOS_PLIST_PATH));
  }

  if (androidFile.missing || androidFile.content == null) {
    findings.push({
      id: 'android.plugin-service-and-permissions',
      title: 'Android plugin service and permissions',
      owner: 'repo-owned',
      file: ANDROID_PLUGIN_MANIFEST_PATH,
      status: 'missing',
      details: 'Android plugin AndroidManifest.xml was not found.',
      remediation: 'Ensure packages/capacitor Android sources exist and rerun doctor.',
    });
  } else {
    const androidInspection = inspectAndroidPluginManifest(androidFile.content);
    findings.push({
      id: 'android.plugin-service-and-permissions',
      title: 'Android plugin service and permissions',
      owner: 'repo-owned',
      file: ANDROID_PLUGIN_MANIFEST_PATH,
      status: androidInspection.status,
      details: androidInspection.details,
      remediation: androidInspection.remediation,
    });
    plannedChanges.push(...planAndroidPluginManifest(androidFile.content, ANDROID_PLUGIN_MANIFEST_PATH));
  }

  return { findings, plannedChanges };
}

function printDoctor(stdout, findings) {
  stdout.write('Legato Native Doctor\n');
  stdout.write('====================\n');
  for (const finding of findings) {
    const symbol = finding.status === 'ok' ? '✓' : finding.status === 'missing' ? '✗' : '!';
    stdout.write(`${symbol} ${finding.id}\n`);
    stdout.write(`  file: ${finding.file}\n`);
    stdout.write(`  status: ${finding.status}\n`);
    stdout.write(`  details: ${finding.details}\n`);
    stdout.write(`  remediation: ${finding.remediation}\n`);
  }
}

function printPlan(stdout, plannedChanges, mode) {
  stdout.write(`Legato Native Configure (${mode})\n`);
  stdout.write('===============================\n');

  if (plannedChanges.length === 0) {
    stdout.write('No changes planned.\n');
    return;
  }

  for (const change of plannedChanges) {
    const state = change.safe ? 'SAFE' : 'SKIP';
    stdout.write(`- [${state}] ${change.ruleId}\n`);
    stdout.write(`  file: ${change.file}\n`);
    stdout.write(`  kind: ${change.kind}\n`);
    stdout.write(`  summary: ${change.summary}\n`);
    if (!change.safe && change.reason) {
      stdout.write(`  reason: ${change.reason}\n`);
    }
  }
}

function applyPlannedChanges(repoRoot, plannedChanges) {
  const applied = [];
  const skipped = [];

  for (const change of plannedChanges) {
    if (!change.safe) {
      skipped.push({ ...change, skipReason: change.reason ?? 'Unsafe patch.' });
      continue;
    }

    if (!SUPPORTED_PATCH_SET.has(change.file)) {
      skipped.push({ ...change, skipReason: 'Not in supported patch set.' });
      continue;
    }

    if (isGeneratedPath(change.file)) {
      skipped.push({ ...change, skipReason: 'Target is Capacitor-generated artifact.' });
      continue;
    }

    const absolutePath = path.join(repoRoot, change.file);
    const before = readFileSync(absolutePath, 'utf-8');
    const after = change.apply(before);
    if (before === after) {
      skipped.push({ ...change, skipReason: 'No-op after re-check (already idempotent).' });
      continue;
    }

    writeFileSync(absolutePath, after, 'utf-8');
    applied.push(change);
  }

  return { applied, skipped };
}

export async function runNativeCli({ args, cwd, stdout, stderr }) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage(stderr);
    return { exitCode: 1 };
  }

  if (args[0] !== 'native') {
    stderr.write(`Unknown command group: ${args[0]}\n`);
    printUsage(stderr);
    return { exitCode: 1 };
  }

  const command = args[1];
  const flags = new Set(args.slice(2));
  const json = flags.has('--json');

  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) {
    stderr.write('Could not resolve Legato repository root from current directory.\n');
    return { exitCode: 1 };
  }

  if (command === 'doctor') {
    const { findings } = evaluateRules(repoRoot);
    const hasFailure = findings.some((finding) => finding.status !== 'ok');

    if (json) {
      writeJsonLine(stdout, {
        command: 'native doctor',
        repoRoot,
        findings,
        exitCode: hasFailure ? 1 : 0,
      });
    } else {
      printDoctor(stdout, findings);
      stdout.write(hasFailure ? '\nResult: gaps detected.\n' : '\nResult: all checks passed.\n');
    }

    return { exitCode: hasFailure ? 1 : 0 };
  }

  if (command === 'configure') {
    const dryRun = flags.has('--dry-run');
    const apply = flags.has('--apply');

    if ((dryRun && apply) || (!dryRun && !apply)) {
      stderr.write('configure requires exactly one mode: --dry-run or --apply\n');
      return { exitCode: 1 };
    }

    const { findings, plannedChanges } = evaluateRules(repoRoot);
    const pendingChanges = plannedChanges.filter((change) => {
      const targetFinding = findings.find((finding) => finding.file === change.file);
      return targetFinding ? targetFinding.status !== 'ok' : true;
    });

    if (dryRun) {
      if (json) {
        writeJsonLine(stdout, {
          command: 'native configure --dry-run',
          repoRoot,
          findings,
          plannedChanges: pendingChanges.map(({ apply: _apply, ...rest }) => rest),
          exitCode: 0,
        });
      } else {
        printPlan(stdout, pendingChanges, '--dry-run');
      }

      return { exitCode: 0 };
    }

    const { applied, skipped } = applyPlannedChanges(repoRoot, pendingChanges);
    const hasUnsafeRemaining = skipped.some((entry) => entry.skipReason !== 'No-op after re-check (already idempotent).');
    const exitCode = hasUnsafeRemaining ? 1 : 0;

    if (json) {
      writeJsonLine(stdout, {
        command: 'native configure --apply',
        repoRoot,
        findings,
        applied: applied.map(({ apply: _apply, ...rest }) => rest),
        skipped: skipped.map(({ apply: _apply, ...rest }) => rest),
        exitCode,
      });
    } else {
      printPlan(stdout, pendingChanges, '--apply');
      stdout.write(`\nApplied: ${applied.length}, Skipped: ${skipped.length}\n`);
      for (const entry of skipped) {
        stdout.write(`- SKIP ${entry.ruleId}: ${entry.skipReason}\n`);
      }
    }

    return { exitCode };
  }

  stderr.write(`Unknown native command: ${command ?? '(missing)'}\n`);
  printUsage(stderr);
  return { exitCode: 1 };
}
