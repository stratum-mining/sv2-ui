import { Router, type Request, type Response } from 'express';
import Docker from 'dockerode';

const router = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Docker multiplexed stream demux (same as logs.ts).
 */
function demuxDockerLogs(raw: Buffer): string {
  const chunks: string[] = [];
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    offset += 8;
    if (size > 0) {
      const end = Math.min(offset + size, raw.length);
      chunks.push(raw.slice(offset, end).toString('utf8'));
    }
    offset += size;
  }
  return chunks.join('');
}

/**
 * GET /api/check-socket?path=/absolute/path/to/node.ipc
 *
 * Spawns a temporary Alpine container that bind-mounts the given host path
 * and checks whether it is a Unix socket. Returns { ok: true } if accessible,
 * { ok: false, reason: string } otherwise.
 *
 * This approach works even when the sv2-ui backend itself runs inside Docker,
 * because the Docker daemon (on the host) performs the bind-mount from the
 * host filesystem — not from within the sv2-ui container.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const socketPath = req.query['path'] as string;

  if (!socketPath || !socketPath.startsWith('/')) {
    res.status(400).json({ ok: false, reason: 'Path must be an absolute path starting with /' });
    return;
  }

  // Pull alpine if not cached (tiny image, ~5 MB)
  try {
    const stream = await docker.pull('alpine:latest');
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch {
    res.status(503).json({ ok: false, reason: 'Could not pull alpine image for socket check' });
    return;
  }

  let container: Docker.Container | null = null;
  try {
    // Mount the host root filesystem read-only.
    // Mounting a specific path would cause Docker to create it on the host
    // if it doesn't exist. Mounting '/' avoids any side effects because the
    // root always exists and nothing is created.
    container = await docker.createContainer({
      Image: 'alpine:latest',
      Cmd: ['sh', '-c', `if [ -S /host${socketPath} ]; then echo ok; elif [ -e /host${socketPath} ]; then echo exists_not_socket; else echo not_found; fi`],
      HostConfig: {
        Binds: ['/:/host:ro'],
        AutoRemove: false,
      },
    });

    await container.start();
    await container.wait();

    const raw = await container.logs({ stdout: true, stderr: false });
    const output = (typeof raw === 'string' ? raw : demuxDockerLogs(raw as Buffer)).trim();

    if (output === 'ok') {
      res.json({ ok: true });
    } else if (output === 'exists_not_socket') {
      res.json({ ok: false, reason: 'Path exists but is not a Unix socket' });
    } else {
      res.json({ ok: false, reason: 'Socket file not found at this path' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Docker returns this when the source path doesn't exist on the host
    if (/no such file|not found/i.test(message)) {
      res.json({ ok: false, reason: 'Socket file not found at this path on the host' });
    } else {
      res.status(500).json({ ok: false, reason: `Check failed: ${message}` });
    }
  } finally {
    if (container) {
      try { await container.remove(); } catch { /* ignore */ }
    }
  }
});

export default router;
