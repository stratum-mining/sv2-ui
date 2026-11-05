import { formatSupportedVersions } from '@sv2-ui/shared';

export const BITCOIN_ERROR_MESSAGES = {
  selectVersion: 'Your setup has no supported Bitcoin Core version. Open Bitcoin setup to read it from your node.',
  unsupported: `Unsupported or missing Bitcoin Core version. Select Bitcoin Core ${formatSupportedVersions()} before starting the stack.`,
  jdConfig: 'JD mode requires JDC and Bitcoin configuration',
  missingConfig: 'Missing required configuration',
} as const;
