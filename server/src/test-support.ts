import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Run with a specific process umask and restore the previous one afterwards,
 * so tests can exercise permission handling deterministically.
 */
export async function withUmask(mask: number, run: () => Promise<void>): Promise<void> {
  const previousUmask = process.umask(mask);
  try {
    await run();
  } finally {
    process.umask(previousUmask);
  }
}

/**
 * Node has no mkfifo API, so create FIFOs through the command-line tool.
 * Created world-writable to mimic what an attacker with directory access
 * could plant.
 */
export async function createFifo(filePath: string): Promise<void> {
  await promisify(execFile)('mkfifo', ['-m', '666', filePath]);
}
