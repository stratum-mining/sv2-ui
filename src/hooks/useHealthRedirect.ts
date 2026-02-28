import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

export function useHealthRedirect() {
  const [location, navigate] = useLocation();
  // null = still fetching, false = not complete, true = complete
  const [wizardComplete, setWizardComplete] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/wizard-data')
      .then((res) => (res.ok ? res.json() : null))
      .then((wd) => {
        if (!wd || Object.keys(wd).length === 0) {
          setWizardComplete(false);
          return;
        }
        setWizardComplete(true);
      })
      .catch(() => setWizardComplete(false));
  }, []);

  // Wizard never completed — go to setup immediately
  useEffect(() => {
    if (wizardComplete === false && location === '/') {
      navigate('/setup');
    }
  }, [wizardComplete, location, navigate]);

  // Block content until we know where to go (prevents any flash of wrong page)
  const isDeciding = wizardComplete === null;

  return { isDeciding };
}
