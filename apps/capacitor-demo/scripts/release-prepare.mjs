import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { validateReleaseControlContract } from './release-control-contract.mjs';
import { evaluateReleasePreflightCompleteness } from './release-preflight-completeness.mjs';
import { resolveReleasePaths } from './release-paths.mjs';

export const prepareReleaseExecution = async (options = {}) => {
  const contract = validateReleaseControlContract(options);
  if (!contract.ok) {
    return { ok: false, errors: contract.errors, diagnostics: contract.diagnostics };
  }

  const packet = { ...contract.value.packet, phase: 'preflight', repo_root: resolve(options.repoRoot ?? '../..') };
  const paths = resolveReleasePaths({ repoRoot: packet.repo_root, releaseId: packet.release_id, releaseIdentity: packet.release_identity });
  await mkdir(dirname(paths.packetPath), { recursive: true });
  await writeFile(paths.packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

  const preflight = await evaluateReleasePreflightCompleteness({
    repoRoot: packet.repo_root,
    releasePacketPath: paths.packetPath,
    releaseId: packet.release_id,
    selectedTargets: packet.selected_targets,
    npmPackageTarget: packet.inputs.npm_package_target,
  });

  return {
    ok: preflight.ok,
    packet_path: paths.packetPath,
    packet,
    preflight,
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = { targetModes: {} };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--release-id' && args[i + 1]) options.releaseId = args[++i];
    else if (args[i] === '--targets' && args[i + 1]) options.targets = args[++i];
    else if (args[i] === '--target-modes' && args[i + 1]) {
      for (const pair of String(args[++i]).split(',')) {
        const [target, mode] = pair.split('=').map((entry) => entry.trim());
        if (target) options.targetModes[target] = mode ?? '';
      }
    } else if (args[i] === '--repo-root' && args[i + 1]) options.repoRoot = args[++i];
    else if (args[i] === '--npm-package-target' && args[i + 1]) options.npmPackageTarget = args[++i];
  }
  const result = await prepareReleaseExecution(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
