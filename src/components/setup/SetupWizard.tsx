import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, AlertCircle, Sun, Moon } from 'lucide-react';
import { SetupStep, SetupData, initialSetupData } from './types';

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) { root.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
    else { root.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  }, [isDark]);
  return { isDark, toggle: () => setIsDark(d => !d) };
}
import { MiningModeSelection } from './steps/MiningModeSelection';
import { TemplateModeSelection } from './steps/TemplateModeSelection';
import { PoolConfigStep } from './steps/PoolConfigStep';
import { BitcoinSetup } from './steps/BitcoinSetup';
import { HashrateStep } from './steps/HashrateStep';
import { MiningIdentityStep } from './steps/MiningIdentityStep';
import { BitcoinPrereqStep } from './steps/BitcoinPrereqStep';
import { ReviewStart } from './steps/ReviewStart';
import { getCurrentConfig } from '@/hooks/useControlApi';

function ThemeToggle({ isDark, toggle }: { isDark: boolean; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
    >
      <span className="relative w-4 h-4" aria-hidden="true">
        <Sun className="absolute h-4 w-4 transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
      </span>
    </button>
  );
}

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
    if (isJdMode) steps.push('bitcoin-prereq', 'bitcoin');
    steps.push('hashrate', 'identity', 'review');
  }

  return steps;
}

export function SetupWizard() {
  const { isDark, toggle } = useTheme();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<SetupStep>('mining-mode');
  const [data, setData] = useState<SetupData>(initialSetupData);
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    getCurrentConfig().then(config => {
      if (config) { setData(config); setIsReconfiguring(true); }
      setLoadingConfig(false);
    });
  }, []);

  const updateData = useCallback((updates: Partial<SetupData>) => {
    const newData = { ...dataRef.current, ...updates };
    dataRef.current = newData;
    setData(newData);
  }, []);

  const handleNext = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  }, [currentStep]);

  const handleBack = useCallback(() => {
    const steps = computeSteps(dataRef.current);
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      const prevStep = steps[idx - 1];
      if (prevStep === 'mining-mode') {
        updateData({ miningMode: null, mode: null, pool: null, bitcoin: null, jdc: null, translator: null });
      } else if (prevStep === 'template-mode') {
        updateData({ pool: null, bitcoin: null, jdc: null, translator: null });
      }
      setCurrentStep(prevStep);
    }
  }, [currentStep, updateData]);

  const handleComplete = useCallback(() => navigate('/'), [navigate]);

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

  if (currentStep === 'mining-mode') {
    return (
      <div className="relative">
        <div className="absolute top-3 right-4 z-10"><ThemeToggle isDark={isDark} toggle={toggle} /></div>
        <MiningModeSelection {...stepProps} />
      </div>
    );
  }

  // Steps after mining-mode: 0-indexed in this sub-array
  const nonModeSteps = steps.slice(1);
  const dotIndex = currentStepIndex - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center px-6 md:px-10 h-14 border-b border-border/40 flex-shrink-0">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded flex-shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <div
          className="flex-1 flex items-center justify-center gap-1.5"
          role="progressbar"
          aria-valuenow={dotIndex + 1}
          aria-valuemin={1}
          aria-valuemax={nonModeSteps.length}
          aria-label={`Step ${dotIndex + 1} of ${nonModeSteps.length}`}
        >
          {nonModeSteps.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx <= dotIndex ? 'bg-primary w-6' : 'bg-border w-6'
              }`}
            />
          ))}
        </div>

        <ThemeToggle isDark={isDark} toggle={toggle} />
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl">
            {isReconfiguring && currentStepIndex === 1 && (
              <div className="mb-6 p-3 rounded-xl bg-warning/[0.08] text-sm text-warning flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                Reconfiguring SV2 setup — this will replace your current configuration.
              </div>
            )}
            {currentStep === 'template-mode'  && <TemplateModeSelection {...stepProps} />}
            {currentStep === 'pool'            && <PoolConfigStep {...stepProps} />}
            {currentStep === 'bitcoin-prereq'  && <BitcoinPrereqStep {...stepProps} />}
            {currentStep === 'bitcoin'         && <BitcoinSetup {...stepProps} />}
            {currentStep === 'hashrate'        && <HashrateStep {...stepProps} />}
            {currentStep === 'identity'        && <MiningIdentityStep {...stepProps} />}
            {currentStep === 'review'          && <ReviewStart {...stepProps} onComplete={handleComplete} />}
          </div>
        </div>
      </div>
    </div>
  );
}
