import { SetupWizard } from '@/components/setup/SetupWizard';

/**
 * Setup page - guides users through initial configuration.
 * 
 * Two modes:
 * - JD (Job Declaration): Miner runs Bitcoin node and creates own block templates
 *   Components: JDC + Translator Proxy
 * 
 * - No-JD: Miner uses pool's templates directly
 *   Components: Translator Proxy only
 */
export function Setup() {
  return (
    <div className="min-h-screen bg-background">
      <SetupWizard />
    </div>
  );
}
