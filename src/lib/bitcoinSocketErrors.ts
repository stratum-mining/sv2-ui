const BITCOIN_SOCKET_ERROR_PATTERNS = [
  'Socket not found at',
  'Socket file exists at',
  'Socket did not respond',
  'Permission denied for',
  'is not a Unix socket',
  'Bitcoin Core version does not match',
  // The version check at start, which the Bitcoin step can explain and retry.
  "Mining can't start until",
  'Bitcoin Core is still starting',
];

function getErrorMessage(error?: string | Error | null): string {
  if (!error) return '';
  return typeof error === 'string' ? error : error.message;
}

export function isBitcoinSocketError(error?: string | Error | null): boolean {
  const message = getErrorMessage(error);
  return BITCOIN_SOCKET_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function isRetryableBitcoinSocketError(error?: string | Error | null): boolean {
  const message = getErrorMessage(error);
  return message.includes('nothing is listening') || message.includes('did not respond');
}
