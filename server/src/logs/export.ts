import type { LogContainerRole, LogOutputStream } from './types.js';

// Docker uses an 8-byte framing header for non-TTY stdout/stderr multiplexing.
// Reference: https://docs.docker.com/reference/api/engine/version/v1.45/#tag/Container/operation/ContainerAttach
export const DOCKER_LOG_HEADER_SIZE = 8;

// Cap for how much text one container may contribute to a log download. With
// json-file rotation in place this never engages; for containers created
// before the rotation config existed it stops the export once the budget is
// spent instead of materializing unbounded history.
export const CONTAINER_LOG_EXPORT_MAX_BYTES = 64 * 1024 * 1024;

export type DockerLogChunk = {
  stream: LogOutputStream;
  payload: string;
};

export type ContainerLogExportStats = {
  bytes: number;
  truncated: boolean;
};

// The download route formats lines straight into the HTTP response, so the
// helper needs the writer's backpressure signal plus the two lifecycle hooks
// that bound the docker stream: resume when the writer drains, stop when the
// consumer goes away (e.g. the browser aborts the download).
export type ContainerLogTextSink = {
  write: (text: string) => boolean;
  onDrain: (resume: () => void) => void;
  onClose: (stop: () => void) => void;
};

// Incremental counterpart of demuxDockerLogBuffer in docker.ts: the same
// frame protocol, but frames can be split at arbitrary byte boundaries
// across stream chunks, so the demuxer keeps a remainder until the frame
// completes.
export function createDockerLogDemuxer(
  emit: (chunk: DockerLogChunk) => void
): (chunk: Buffer) => void {
  let pending: Buffer = Buffer.alloc(0);

  return (chunk: Buffer): void => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);

    while (pending.length >= DOCKER_LOG_HEADER_SIZE) {
      const payloadLength = pending.readUInt32BE(4);
      const frameEnd = DOCKER_LOG_HEADER_SIZE + payloadLength;
      if (pending.length < frameEnd) {
        break;
      }

      emit({
        stream: pending.readUInt8(0) === 2 ? 'stderr' : 'stdout',
        payload: pending.subarray(DOCKER_LOG_HEADER_SIZE, frameEnd).toString('utf-8'),
      });
      pending = pending.subarray(frameEnd);
    }
  };
}

// Dockerode prefixes lines with an RFC 3339 timestamp when `timestamps: true`
// is enabled, so we split it from the log message. The formatted line keeps
// the exact shape the previous client-side download builder produced:
// `timestamp [container] [stream] message`.
const DOCKER_LOG_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\S+?)\s(.*)$/;

// Container log text is controlled by the mining workload and is written
// verbatim into the exported file, which an operator may display in a
// terminal: OSC-52 can overwrite the clipboard, CSI/C1 sequences can clear
// or repaint the screen, and a mid-line carriage return can rewrite the
// start of the line. Strip terminal-executable control characters while
// keeping printable text: an escape sequence's printable parameters remain
// as inert text (no introducer byte, nothing to act on), and tab survives
// to preserve column alignment.
// eslint-disable-next-line no-control-regex
const TERMINAL_CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function createLogLineFormatter(
  container: LogContainerRole,
  emitLine: (line: string) => void
): { consume: (chunk: DockerLogChunk) => void; flush: () => void } {
  let partial = '';
  let partialStream: LogOutputStream = 'stdout';

  const formatLine = (raw: string, stream: LogOutputStream): string => {
    const match = raw.match(DOCKER_LOG_TIMESTAMP_RE);
    const timestamp = match ? match[1] : null;
    const message = match ? match[2] : raw;
    const parts: string[] = [];
    if (timestamp) {
      parts.push(timestamp);
    }
    parts.push(`[${container}]`, `[${stream}]`, message);
    // Sanitize the joined line, not just the message: the loose timestamp
    // capture would otherwise let a container-crafted prefix carry controls.
    return parts.join(' ').replace(TERMINAL_CONTROL_CHARS_RE, '');
  };

  const emitCompleted = (raw: string, stream: LogOutputStream): void => {
    const line = raw.replace(/\r$/, '');
    if (line.length > 0) {
      emitLine(formatLine(line, stream));
    }
  };

  return {
    consume(chunk: DockerLogChunk): void {
      // A frame boundary mid-line must not glue stderr remnants onto a
      // stdout line: flush the pending partial under its own stream tag.
      if (partial.length > 0 && chunk.stream !== partialStream) {
        emitCompleted(partial, partialStream);
        partial = '';
      }
      partialStream = chunk.stream;

      const text = partial + chunk.payload;
      const lines = text.split('\n');
      partial = lines.pop() ?? '';
      for (const raw of lines) {
        emitCompleted(raw, chunk.stream);
      }
    },
    flush(): void {
      if (partial.length > 0) {
        emitCompleted(partial, partialStream);
        partial = '';
      }
    },
  };
}
