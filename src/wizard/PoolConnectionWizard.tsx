/**
 * Pool Connection Wizard
 *
 * Guides miners to connect to existing Stratum V2 pools using SRI proxy components.
 *
 * Components deployed:
 * - Translator Proxy (always) - Connects miners to the selected pool
 * - Job Declarator Client (JDC) (optional) - Only if user wants to construct custom block templates
 *
 * Bitcoin Core node is required:
 * - Only if JDC is used (to construct custom block templates)
 * - Not required if using pool's templates
 *
 * Available pools:
 * - SRI Community Pool: mainnet & testnet4
 * - Braiins Pool: mainnet (non-JD only)
 * - DMND Pool: mainnet (JD or non-JD)
 */

import { Wizard } from "@/wizard/framework";
import { POOL_CONNECTION_WIZARD_CONFIG } from "./pool-connection-steps";

export interface PoolConnectionWizardProps {
  className?: string;
  onComplete?: (finalStepId: string) => void;
  initialData?: Record<string, any>;
}

export function PoolConnectionWizard({ className, onComplete, initialData }: PoolConnectionWizardProps) {
  return (
    <Wizard config={POOL_CONNECTION_WIZARD_CONFIG} onComplete={onComplete} className={className} initialData={initialData} />
  );
}

export default PoolConnectionWizard;
