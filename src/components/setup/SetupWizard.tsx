import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { 
  SetupStep, 
  SetupData, 
  initialSetupData,
} from './types';
import { MiningModeSelection } from './steps/MiningModeSelection';
import { TemplateModeSelection } from './steps/TemplateModeSelection';
import { PoolConfigStep } from './steps/PoolConfigStep';
import { BitcoinSetup } from './steps/BitcoinSetup';
import { HashrateStep } from './steps/HashrateStep';
import { MiningIdentityStep } from './steps/MiningIdentityStep';
import { ReviewStart } from './steps/ReviewStart';
import { getCurrentConfig } from '@/hooks/useControlApi';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Compute steps based on data (pure function, no hooks)
 */
function computeSteps(data: SetupData): SetupStep[] {
  const isSoloMode = data.miningMode === 'solo';
  const isPoolMode = data.miningMode === 'pool';
  const isJdMode = data.mode === 'jd';

  const steps: SetupStep[] = ['mining-mode'];

  if (isSoloMode) {
    steps.push('pool', 'hashrate', 'identity', 'review');
    return steps;
  }

  if (isPoolMode) {
    steps.push('template-mode', 'pool');
    if (isJdMode) {
      steps.push('bitcoin');
    }
    steps.push('hashrate', 'identity', 'review');
  }

  return steps;
}

/**
 * Setup wizard orchestrator - sv2-wizard inspired design
 * Manages step navigation and data collection.
 * Pre-fills from existing config if available (for reconfiguration).
 */
export function SetupWizard() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<SetupStep>('mining-mode');
  const [data, setData] = useState<SetupData>(initialSetupData);
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  
  // Track latest data in a ref for use in callbacks
  const dataRef = useRef(data);
  dataRef.current = data;

  // Load existing config on mount (if any)
  useEffect(() => {
    getCurrentConfig().then(config => {
      if (config) {
        setData(config);
        setIsReconfiguring(true);
      }
      setLoadingConfig(false);
    });
  }, []);

  const updateData = useCallback((updates: Partial<SetupData>) => {
    // Update ref synchronously BEFORE setData so handleNext sees the new value immediately
    const newData = { ...dataRef.current, ...updates };
    dataRef.current = newData;
    setData(newData);
  }, []);

  const handleNext = useCallback(() => {
    // Use ref to get latest data synchronously
    const steps = computeSteps(dataRef.current);
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      // When going back, also clear data that depends on later steps
      // to avoid stale state issues
      const prevStep = steps[currentIndex - 1];
      
      // If going back to mining-mode, clear everything including miningMode
      if (prevStep === 'mining-mode') {
        updateData({
          miningMode: null,
          mode: null,
          pool: null,
          bitcoin: null,
          jdc: null,
          translator: null,
        });
      }
      // If going back to template-mode, clear pool-dependent data
      else if (prevStep === 'template-mode') {
        updateData({
          pool: null,
          bitcoin: null,
          jdc: null,
          translator: null,
        });
      }
      
      setCurrentStep(prevStep);
    }
  }, [currentStep, updateData]);

  const handleComplete = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // Compute steps from current data for display
  const steps = computeSteps(data);

  const stepProps = {
    data,
    updateData,
    onNext: handleNext,
    onBack: handleBack,
  };

  const currentStepIndex = steps.indexOf(currentStep);
  const totalSteps = steps.length;
  
  // Safety: if currentStep is not in steps array (can happen after data changes),
  // reset to first step
  useEffect(() => {
    if (currentStepIndex === -1 && !loadingConfig) {
      setCurrentStep('mining-mode');
    }
  }, [currentStepIndex, loadingConfig]);

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-3xl">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">
            {isReconfiguring ? 'Reconfigure SV2 Setup' : 'SV2 Setup Wizard'}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isReconfiguring ? 'Update your Stratum V2 configuration' : 'Configure your Stratum V2 deployment'}
          </p>
        </div>

        {/* Main Card */}
        <Card className="relative rounded-2xl border-border min-h-[400px]">
          {/* Progress bar at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-border rounded-t-2xl overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>

          {/* Header */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            {currentStepIndex > 0 ? (
              <button
                onClick={handleBack}
                className="h-8 w-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            ) : (
              <div className="w-8" />
            )}

            <div className="font-mono text-xs uppercase tracking-widest text-primary">
              Step {currentStepIndex + 1} of {totalSteps}
            </div>

            <div className="flex gap-1.5">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                    idx < currentStepIndex ? 'bg-primary' :
                    idx === currentStepIndex ? 'bg-primary animate-pulse' :
                    'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step Content */}
          <CardContent className="p-8 md:p-12">
            {isReconfiguring && currentStepIndex === 0 && (
              <div className="mb-6 p-4 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning-foreground">
                You are reconfiguring your SV2 setup. This will replace your current configuration.
              </div>
            )}
            
            {currentStep === 'mining-mode' && <MiningModeSelection {...stepProps} />}
            {currentStep === 'template-mode' && <TemplateModeSelection {...stepProps} />}
            {currentStep === 'pool' && <PoolConfigStep {...stepProps} />}
            {currentStep === 'bitcoin' && <BitcoinSetup {...stepProps} />}
            {currentStep === 'hashrate' && <HashrateStep {...stepProps} />}
            {currentStep === 'identity' && <MiningIdentityStep {...stepProps} />}
            {currentStep === 'review' && <ReviewStart {...stepProps} onComplete={handleComplete} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
