export class ResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response exceeded ${maxBytes} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read and parse a JSON response body without buffering more than `maxBytes`.
 *
 * Response.json() buffers the whole body, so an upstream that streams an
 * oversized or endless body could exhaust memory. The Content-Length header is
 * checked first as a fast path, but the streamed byte count is authoritative.
 */
export async function readJsonWithLimit(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(maxBytes);
  }

  if (!response.body) {
    throw new SyntaxError('Response has no body');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
