import { TRANSLATOR_PORT } from '@/lib/ports';

const LOCAL_BROWSER_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const TRANSLATOR_HOST_PLACEHOLDER = '<your-machine-ip>';

function browserHostname() {
  return window.location.hostname || '';
}

function isLocalBrowserHost(host: string) {
  return LOCAL_BROWSER_HOSTS.has(host.trim().toLowerCase());
}

export function defaultTranslatorPoolUrl(advertisedHost?: string | null) {
  const host = advertisedHost || browserHostname();
  const poolHost = host && !isLocalBrowserHost(host) ? host : TRANSLATOR_HOST_PLACEHOLDER;
  return `stratum+tcp://${poolHost}:${TRANSLATOR_PORT}`;
}

export function isConcreteTranslatorPoolUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes(TRANSLATOR_HOST_PLACEHOLDER)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    return Boolean(host) && !isLocalBrowserHost(host);
  } catch {
    return false;
  }
}
