const MIN_IPV4_PREFIX = 24;
const DECIMAL_RE = /^(0|[1-9]\d{0,2})$/;

export function normalizeMinerTelemetryCidr(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function getMinerTelemetryCidrError(value: string | null | undefined): string | null {
  const cidr = normalizeMinerTelemetryCidr(value);
  if (!cidr) {
    return null;
  }

  const [address, prefix, extra] = cidr.split('/');
  if (!address || !prefix || extra !== undefined) {
    return 'Enter a private IPv4 CIDR such as 192.168.1.0/24';
  }

  const rawOctets = address.split('.');
  if (rawOctets.length !== 4 || !rawOctets.every((o) => DECIMAL_RE.test(o))) {
    return 'Enter a valid IPv4 address';
  }
  const octets = rawOctets.map(Number);

  if (octets.some((octet) => octet > 255)) {
    return 'Enter a valid IPv4 address';
  }

  if (!DECIMAL_RE.test(prefix)) {
    return `Use a /${MIN_IPV4_PREFIX} or narrower private IPv4 range`;
  }
  const prefixNumber = Number(prefix);

  if (prefixNumber < MIN_IPV4_PREFIX || prefixNumber > 32) {
    return `Use a /${MIN_IPV4_PREFIX} or narrower private IPv4 range`;
  }

  if (!isPrivateIpv4(octets)) {
    return 'Use the private LAN subnet where your miners expose their web/API interface';
  }

  return null;
}

export function isValidMinerTelemetryCidr(value: string | null | undefined): boolean {
  return getMinerTelemetryCidrError(value) === null;
}

export function minerTelemetryCidrForAddress(address: string | null | undefined): string {
  const ip = address?.trim() ?? '';
  if (!ip || getMinerTelemetryCidrError(`${ip}/32`) !== null) {
    return '';
  }

  return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
}
