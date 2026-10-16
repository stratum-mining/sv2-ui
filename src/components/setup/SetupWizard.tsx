import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { SetupStep, SetupData, initialSetupData } from './types';
import { shouldAggregateTranslatorChannelsForPools } from './poolRules';
import { BITCOIN_MESSAGES } from '@/lib/messages';
import { Alert } from '@/components/ui/alert';

import { OnboardingLayout } from './OnboardingLayout';
import { MiningModeSelection } from './steps/MiningModeSelection';
import { PoolConfigStep } from './steps/PoolConfigStep';
import { BitcoinSetup } from './steps/BitcoinSetup';
import { HashrateStep } from './steps/HashrateStep';
import { MiningIdentityStep } from './steps/MiningIdentityStep';
import { BitcoinPrereqStep } from './steps/BitcoinPrereqStep';
import { ReviewStart } from './steps/ReviewStart';
import { getCurrentConfig, getSuggestedMinerTelemetryCidr } from '@/hooks/useControlApi';
import { useBitcoinRpcDiscovery } from '@/hooks/useBitcoinRpcDiscovery';

function computeSteps(data: SetupData): SetupStep[] {
  const isSoloMode = data.miningMode === 'solo';
  const isPoolMode = data.miningMode === 'pool';
  const isJdMode = data.mode === 'jd';
  const steps: SetupStep[] = ['mining-mode'];

  if (isSoloMode) {
    if (isJdMode) {
      steps.push('bitcoin-prereq', 'bitcoin');
    } else if (data.mode === 'no-jd') {
      steps.push('pool');
    }
    if (data.mode) {
      steps.push('hashrate');
      if (isJdMode) steps.push('identity');
      steps.push('review');
    }
    return steps;
  }

  if (isPoolMode) {
    if (data.mode === 'jd') {
      steps.push('pool', 'bitcoin-prereq', 'bitcoin', 'hashrate', 'identity', 'review');
    } else if (data.mode === 'no-jd') {
      steps.push('pool', 'hashrate', 'review');
    }
  }

  return steps;
}

const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';
const SETUP_REVIEW_STORAGE_KEY = 'sv2-ui-setup-review';
const BITCOIN_CORE_VERSION_MISMATCH_NOTICE = BITCOIN_MESSAGES.versionMismatchNotice;

export function SetupWizard() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<SetupStep>('mining-mode');
  const [data, setData] = useState<SetupData>(initialSetupData);
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  const [isSetupReview, setIsSetupReview] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [bitcoinSetupNotice, setBitcoinSetupNotice] = useState<string | null>(null);
  const { results: discoveredNodes, isLoading: isDiscovering, retry: retryDiscovery } = useBitcoinRpcDiscovery();

  const dataRef = useRef(data);
  dataRef.current = data;
  // HashrateStep reads the telemetry subnet from data only when it mounts.
  const hashrateShownRef = useRef(false);
  if (currentStep === 'hashrate') hashrateShownRef.current = true;

  useEffect(() => {
    getCurrentConfig().then(config => {
      if (config) {
        let nextConfig = config;
        setIsReconfiguring(true);

        const targetStep = window.sessionStorage.getItem(SETUP_TARGET_STEP_STORAGE_KEY) as SetupStep | null;
        const setupReviewRequested = window.sessionStorage.getItem(SETUP_REVIEW_STORAGE_KEY) === 'true';
        window.sessionStorage.removeItem(SETUP_TARGET_STEP_STORAGE_KEY);
        window.sessionStorage.removeItem(SETUP_REVIEW_STORAGE_KEY);
        setIsSetupReview(setupReviewRequested);

        if (targetStep === 'bitcoin' && config.bitcoin) {
          nextConfig = {
            ...config,
            bitcoin: {
              ...config.bitcoin,
              core_version: null,
            },
          };
          setBitcoinSetupNotice(BITCOIN_CORE_VERSION_MISMATCH_NOTICE);
        }

        setData(nextConfig);
        dataRef.current = nextConfig;

        if (targetStep && computeSteps(config).includes(targetStep)) {
          setCurrentStep(targetStep);
        }
      } else {
        // Only a fresh setup is prefilled, so editing a saved setup never
        // starts LAN scanning the operator did not choose.
        void getSuggestedMinerTelemetryCidr().then((cidr) => {
          if (!cidr || hashrateShownRef.current) return;
          const nextData = { ...dataRef.current, miner_telemetry_cidr: cidr };
          dataRef.current = nextData;
          setData(nextData);
        });
      }
      setLoadingConfig(false);
    });
  }, []);

  const updateData = useCallback((updates: Partial<SetupData>) => {
    const newData = { ...dataRef.current, ...updates };
    if (newData.translator) {
      newData.translator = {
        ...newData.translator,
        aggregate_channels: shouldAggregateTranslatorChannelsForPools([
          newData.pool,
          ...(newData.fallbackPools ?? []),
        ]),
      };
    }
    dataRef.current = newData;
    setData(newData);
  }, []);

  const handleNext = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const idx = steps.indexOf(currentStep);
    if (idx >= steps.length - 1) return;
    setCurrentStep(steps[idx + 1]);
  }, [currentStep]);

  const handleBack = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  }, [currentStep]);

  const handleComplete = useCallback(() => navigate('/'), [navigate]);

  const handleAutoAdvance = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const idx = steps.indexOf('bitcoin-prereq');
    if (idx >= 0 && idx + 2 < steps.length) {
      setCurrentStep(steps[idx + 2]);
    }
  }, []);

  const steps = computeSteps(data);
  const currentStepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    if (currentStepIndex === -1 && !loadingConfig) setCurrentStep('mining-mode');
  }, [currentStepIndex, loadingConfig]);

  const stepProps = { data, updateData, onNext: handleNext, onBack: handleBack };

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <OnboardingLayout
      onBack={currentStepIndex > 0 ? handleBack : undefined}
      progress={currentStepIndex > 0 ? { current: currentStepIndex - 1, total: steps.length - 1 } : undefined}
      stepKey={currentStep}
    >
      {isReconfiguring && currentStepIndex === 0 && (
        <Alert variant="warning" className="mb-6">
          {isSetupReview
            ? 'Review your setup to continue mining. Your saved settings are prefilled.'
            : 'Reconfiguring SV2 setup — this will replace your current configuration.'}
        </Alert>
      )}
      {currentStep === 'mining-mode' && <MiningModeSelection {...stepProps} />}
      {currentStep === 'pool' && <PoolConfigStep {...stepProps} />}
      {currentStep === 'bitcoin-prereq' && (
        <BitcoinPrereqStep
          {...stepProps}
          discoveredNodes={discoveredNodes}
          isDiscovering={isDiscovering}
          onRetryDiscovery={retryDiscovery}
          onAutoAdvance={handleAutoAdvance}
        />
      )}
      {currentStep === 'bitcoin' && (
        <BitcoinSetup
          {...stepProps}
          notice={bitcoinSetupNotice}
          onDismissNotice={() => setBitcoinSetupNotice(null)}
          discoveredNodes={discoveredNodes}
        />
      )}
      {currentStep === 'hashrate' && <HashrateStep {...stepProps} />}
      {currentStep === 'identity' && <MiningIdentityStep {...stepProps} />}
      {currentStep === 'review' && (
        <ReviewStart
          {...stepProps}
          onComplete={handleComplete}
          onGoToStep={setCurrentStep}
        />
      )}
    </OnboardingLayout>
  );
}
