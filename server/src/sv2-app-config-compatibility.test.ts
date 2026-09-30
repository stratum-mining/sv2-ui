import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('bounds the output collected from a compatibility-check container', { timeout: 120_000 }, async () => {
  const fakeBinDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-fake-docker-'));
  const dockerPath = path.join(fakeBinDir, 'docker');
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

  try {
    await writeFile(dockerPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'run') process.exit(0);
if (args.join(' ').includes('malformed.toml')) {
  process.stderr.write("thread 'main' panicked: TomlError: failed to parse config\\n");
  process.exit(1);
}
const chunk = 'x'.repeat(1024 * 1024);
function writeChunk() {
  if (process.stdout.write(chunk)) setImmediate(writeChunk);
  else process.stdout.once('drain', writeChunk);
}
process.on('SIGINT', () => process.exit(0));
setTimeout(() => process.exit(0), 15_000);
writeChunk();
`);
    await chmod(dockerPath, 0o755);

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--max-old-space-size=64',
        '--import',
        'tsx',
        'server/src/sv2-app-config-compatibility.ts',
      ], {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}` },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal, stderr }));
    });

    assert.equal(result.signal, null, result.stderr);
    assert.doesNotMatch(result.stderr, /heap out of memory|reached heap limit/i);
    assert.equal(result.code, 0, result.stderr);
  } finally {
    await rm(fakeBinDir, { recursive: true, force: true });
  }
});
