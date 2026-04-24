import { chmod, cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');

export const copyCliToDist = async ({ root = packageRoot } = {}) => {
  const cliSource = resolve(root, 'src/cli');
  const cliTarget = resolve(root, 'dist/cli');

  await rm(cliTarget, { recursive: true, force: true });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await cp(cliSource, cliTarget, { recursive: true, force: true });

  const sourceEntries = await readdir(cliSource, { withFileTypes: true });
  for (const entry of sourceEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const sourcePath = join(cliSource, entry.name);
    const targetPath = join(cliTarget, entry.name);
    const sourceStat = await stat(sourcePath);
    await chmod(targetPath, sourceStat.mode);
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  await copyCliToDist();
}
