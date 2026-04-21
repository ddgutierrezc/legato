#!/usr/bin/env node

import { runNativeCli } from './native-setup-cli.mjs';

const args = process.argv.slice(2);
const result = await runNativeCli({
  args,
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exitCode = result.exitCode;
