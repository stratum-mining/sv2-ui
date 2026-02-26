import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard } from 'lucide-react';
import { PoolConnectionWizard } from '@/wizard/PoolConnectionWizard';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const LS_KEY = STORAGE_KEYS.WIZARD_DRAFT;

export function Setup() {
  const [, navigate] = useLocation();
  const [initialData, setInitialData] = useState<Record<string, any> | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSavedData() {
      // Clear any in-progress wizard state so it always starts fresh
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }

      let backendData: Record<string, any> = {};

      // Load defaults from last completed run
      try {
        const res = await fetch('/api/wizard-data');
        if (res.ok) {
          backendData = await res.json();
        }
      } catch { /* ignore */ }

      setInitialData(Object.keys(backendData).length > 0 ? backendData : undefined);
      setLoading(false);
    }

    loadSavedData();
  }, []);

  const handleComplete = async () => {
    // Save completed wizard data to backend
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.data) {
          await fetch('/api/wizard-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
          });
        }
      }
    } catch { /* ignore */ }

    // Clear localStorage draft
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }

    navigate('/');
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex justify-end px-4 pt-4">
        <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors">
          <LayoutDashboard className="w-4 h-4" />
          Go to Dashboard
        </Link>
      </div>
      <PoolConnectionWizard className="px-4 pb-12" onComplete={handleComplete} initialData={initialData} />
    </div>
  );
}
