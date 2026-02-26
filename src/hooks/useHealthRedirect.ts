import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTranslatorHealth, useJdcHealth } from './usePoolData';

export function useHealthRedirect() {
  const [location, navigate] = useLocation();
  // null = still fetching, false = not complete, true = complete
  const [wizardComplete, setWizardComplete] = useState<boolean | null>(null);
  const [deployedTproxy, setDeployedTproxy] = useState(false);
  const [deployedJdc, setDeployedJdc] = useState(false);

  useEffect(() => {
    fetch('/api/wizard-data')
      .then((res) => (res.ok ? res.json() : null))
      .then((wd) => {
        if (!wd || Object.keys(wd).length === 0) {
          setWizardComplete(false);
          return;
        }
        setDeployedTproxy(
          !(wd.constructTemplates === true && wd.skipped_translator_proxy_configuration === true)
        );
        setDeployedJdc(wd.constructTemplates === true);
        setWizardComplete(true);
      })
      .catch(() => setWizardComplete(false));
  }, []);

  const { data: translatorOk, isLoading: tLoading } = useTranslatorHealth(
    wizardComplete === true && deployedTproxy
  );
  const { data: jdcOk, isLoading: jLoading } = useJdcHealth(
    wizardComplete === true && deployedJdc
  );

  const isHealthy = Boolean(translatorOk || jdcOk);
  const healthChecksLoading =
    wizardComplete === true &&
    ((deployedTproxy && tLoading) || (deployedJdc && jLoading));

  // Wizard never completed — go to setup immediately
  useEffect(() => {
    if (wizardComplete === false && location === '/') {
      navigate('/setup');
    }
  }, [wizardComplete, location, navigate]);

  // Wizard complete but all services down — go to setup
  useEffect(() => {
    if (wizardComplete === true && !healthChecksLoading && !isHealthy && location === '/') {
      navigate('/setup');
    }
  }, [wizardComplete, healthChecksLoading, isHealthy, location, navigate]);

  // Block content until we know where to go (prevents any flash of wrong page)
  const isDeciding = wizardComplete === null || healthChecksLoading;

  return { isDeciding };
}
