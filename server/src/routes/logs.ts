import { Router, type Request, type Response } from 'express';
import Docker from 'dockerode';
import { CONTAINER_NAMES } from '../constants.js';

/**
 * Docker multiplexed stream format (non-TTY containers):
 * Each chunk has an 8-byte header: [stream_type(1), pad(3), size(4 big-endian)]
 * followed by `size` bytes of payload. This function strips the headers.
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

const router = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const VALID_CONTAINERS = new Set<string>(Object.values(CONTAINER_NAMES));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const container = req.query['container'] as string;
  const tail = parseInt((req.query['tail'] as string) ?? '200', 10);

  if (!container || !VALID_CONTAINERS.has(container)) {
    res.status(400).json({ error: `Invalid container. Valid values: ${[...VALID_CONTAINERS].join(', ')}` });
    return;
  }

  try {
    const c = docker.getContainer(container);
    const logs = await c.logs({
      stdout: true,
      stderr: true,
      tail: isNaN(tail) ? 200 : tail,
      timestamps: false,
    });
    // Docker returns a multiplexed stream (8-byte header per chunk) for non-TTY containers.
    // Each header: [stream_type(1), pad(3), size(4 big-endian)]. Strip headers before sending.
    const text = typeof logs === 'string' ? logs : demuxDockerLogs(logs as Buffer);
    res.json({ logs: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to fetch logs: ${message}` });
  }
});

export default router;
