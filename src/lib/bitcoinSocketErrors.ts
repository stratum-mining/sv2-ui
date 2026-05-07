const BITCOIN_SOCKET_ERROR_PATTERNS = [
  'Socket not found at',
  'Socket file exists at',
  'Socket did not respond',
  'Permission denied for',
  'is not a Unix socket',
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
