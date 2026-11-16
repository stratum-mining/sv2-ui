import { useId } from 'react';
import { SUPPORTED_NETWORKS, type BitcoinNetwork } from '@sv2-ui/shared';
import { Bitcoin, Check } from 'lucide-react';

interface BitcoinNetworkSelectorProps {
  value: BitcoinNetwork;
  onChange: (network: BitcoinNetwork) => void;
  /** Networks the caller wants to offer. Regtest is added only where it is enabled. */
  networks?: BitcoinNetwork[];
  className?: string;
}

const NETWORK_OPTIONS: Record<BitcoinNetwork, {
  label: string;
  iconClassName: string;
}> = {
  mainnet: { label: 'Mainnet', iconClassName: 'text-orange-500' },
  testnet4: { label: 'Testnet4', iconClassName: 'text-blue-500' },
  regtest: { label: 'Regtest', iconClassName: 'text-emerald-500' },
};

export function BitcoinNetworkSelector({
  value,
  onChange,
  networks = SUPPORTED_NETWORKS,
  className = '',
}: BitcoinNetworkSelectorProps) {
  const labelId = useId();
  const gridClassName = networks.length > 2 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2';

  return (
    <div className={className} role="group" aria-labelledby={labelId}>
      <p id={labelId} className="block text-sm font-medium mb-3">Bitcoin Network</p>
      <div className={`grid ${gridClassName} gap-3`}>
        {networks.map((network) => {
          const isSelected = value === network;
          const option = NETWORK_OPTIONS[network];

          return (
            <button
              key={network}
              type="button"
              onClick={() => onChange(network)}
              aria-pressed={isSelected}
              className={`relative p-4 rounded-xl border transition-all flex flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isSelected
                  ? 'border-primary bg-primary/[0.04]'
                  : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
              }`}
            >
              {isSelected && (
                <span
                  className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Check className="w-3 h-3 text-background" />
                </span>
              )}
              <span className="flex items-center gap-2">
                <Bitcoin className={`h-4 w-4 ${option.iconClassName}`} aria-hidden="true" />
                <span className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                  {option.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
