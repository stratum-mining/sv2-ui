export class DockerConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DockerConnectionError';
  }
}

export function isMissingContainerError(error: unknown): boolean {
  let current = error;

  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      cause?: unknown;
      message?: string;
      reason?: string;
      statusCode?: number;
      json?: { message?: string };
    };

    if (
      (candidate.statusCode === 404 && typeof candidate.json?.message === 'string' && candidate.json.message.includes('No such container')) ||
      candidate.message?.includes('No such container') ||
      candidate.json?.message?.includes('No such container')
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
