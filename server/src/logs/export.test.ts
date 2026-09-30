import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTAINER_LOG_EXPORT_MAX_BYTES,
  createDockerLogDemuxer,
  createLogLineFormatter,
  DOCKER_LOG_HEADER_SIZE,
  type DockerLogChunk,
} from './export.js';

function frame(stream: 'stdout' | 'stderr', payload: string): Buffer {
  const payloadBuffer = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(DOCKER_LOG_HEADER_SIZE);
  header.writeUInt8(stream === 'stderr' ? 2 : 1, 0);
  header.writeUInt32BE(payloadBuffer.length, 4);
  return Buffer.concat([header, payloadBuffer]);
}

function collectChunks(): { chunks: DockerLogChunk[]; demux: (chunk: Buffer) => void } {
  const chunks: DockerLogChunk[] = [];
  return { chunks, demux: createDockerLogDemuxer((chunk) => chunks.push(chunk)) };
}

function collectLines(container: 'translator' | 'jdc' = 'translator') {
  const lines: string[] = [];
  const formatter = createLogLineFormatter(container, (line) => lines.push(line));
  return { lines, formatter };
}

test('demuxes complete frames out of a single chunk', () => {
  const { chunks, demux } = collectChunks();
  demux(Buffer.concat([frame('stdout', 'first line\n'), frame('stderr', 'boom\n')]));

  assert.deepEqual(chunks, [
    { stream: 'stdout', payload: 'first line\n' },
    { stream: 'stderr', payload: 'boom\n' },
  ]);
});

test('reassembles a frame whose header and payload are split across chunks', () => {
  const whole = frame('stdout', 'hello world\n');
  const { chunks, demux } = collectChunks();

  demux(whole.subarray(0, 3));
  assert.deepEqual(chunks, []);

  demux(whole.subarray(3, 10));
  assert.deepEqual(chunks, []);

  demux(whole.subarray(10));
  assert.deepEqual(chunks, [{ stream: 'stdout', payload: 'hello world\n' }]);
});

test('keeps a zero-length frame from stalling the demuxer', () => {
  const { chunks, demux } = collectChunks();
  demux(Buffer.concat([
    frame('stderr', ''),
    frame('stdout', 'after empty frame\n'),
  ]));

  assert.deepEqual(chunks, [
    { stream: 'stderr', payload: '' },
    { stream: 'stdout', payload: 'after empty frame\n' },
  ]);
});

test('formats lines in the historical download format', () => {
  const { lines, formatter } = collectLines();
  formatter.consume({ stream: 'stdout', payload: '2026-09-30T12:00:00.000000000Z translator up\n' });
  formatter.consume({ stream: 'stderr', payload: 'handshake failed\n' });

  assert.deepEqual(lines, [
    '2026-09-30T12:00:00.000000000Z [translator] [stdout] translator up',
    '[translator] [stderr] handshake failed',
  ]);
});

test('buffers lines that span chunk boundaries and flushes the remainder', () => {
  const { lines, formatter } = collectLines('jdc');
  formatter.consume({ stream: 'stdout', payload: '2026-09-30T12:00:00.000Z partial ' });
  assert.deepEqual(lines, []);

  formatter.consume({ stream: 'stdout', payload: 'rest\nsecond line' });
  formatter.flush();

  assert.deepEqual(lines, [
    '2026-09-30T12:00:00.000Z [jdc] [stdout] partial rest',
    '[jdc] [stdout] second line',
  ]);
});

test('emits a partial line under its own stream tag at a stream boundary', () => {
  const { lines, formatter } = collectLines();
  formatter.consume({ stream: 'stderr', payload: 'no newline yet' });
  formatter.consume({ stream: 'stdout', payload: '2026-09-30T12:00:00.000Z from stdout\n\n' });

  assert.deepEqual(lines, [
    '[translator] [stderr] no newline yet',
    '2026-09-30T12:00:00.000Z [translator] [stdout] from stdout',
  ]);
});

test('skips empty lines and strips carriage returns from CRLF output', () => {
  const { lines, formatter } = collectLines();
  formatter.consume({ stream: 'stdout', payload: '2026-09-30T12:00:00.000Z one\r\n\r\n' });
  formatter.flush();

  assert.deepEqual(lines, [
    '2026-09-30T12:00:00.000Z [translator] [stdout] one',
  ]);
});

test('neutralizes terminal control sequences in downloaded log lines', () => {
  const { lines, formatter } = collectLines();
  // OSC-52 clipboard overwrite + BEL, followed by an ANSI clear-screen.
  formatter.consume({
    stream: 'stderr',
    payload: '\u001b]52;c;Y3VybCBodHRwczovL2F0dGFja2VyLmludmFsaWQ=\u0007safe message\u001b[2J\n',
  });
  formatter.flush();

  // Byte-level stripping leaves each sequence's printable parameters as
  // inert text; the message survives and no control byte a terminal could
  // act on reaches the file.
  assert.match(lines.join('\n'), /safe message/);
  assert.doesNotMatch(
    lines.join('\n'),
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u,
    'a downloaded text log must not retain raw terminal control bytes',
  );
});

test('keeps tabs but strips mid-line carriage returns from downloaded log lines', () => {
  const { lines, formatter } = collectLines();
  formatter.consume({ stream: 'stdout', payload: 'attempt\rretry\taligned\n' });

  assert.deepEqual(lines, ['[translator] [stdout] attemptretry\taligned']);
});

test('strips controls a container fakes inside a timestamp-shaped prefix', () => {
  const { lines, formatter } = collectLines();
  // A BEL inside the timestamp capture and an ESC in the message: both must
  // go, even though only the message would be sanitized if the line were
  // cleaned field by field.
  formatter.consume({
    stream: 'stdout',
    payload: '2026-09-30T12:00:00\u0007.000Z forged\u001b[2K\n',
  });

  assert.deepEqual(lines, ['2026-09-30T12:00:00.000Z [translator] [stdout] forged[2K']);
});

test('keeps the export byte cap generous relative to rotated history', () => {
  assert.equal(CONTAINER_LOG_EXPORT_MAX_BYTES, 64 * 1024 * 1024);
});
