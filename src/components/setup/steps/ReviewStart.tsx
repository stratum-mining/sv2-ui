import { useState, useEffect, useRef } from "react";
import { SetupStep, StepProps } from "../types";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { MinerConnectionInfo } from "../MinerConnectionInfo";
import { ConfigurationEditor } from "@/components/settings/ConfigurationEditor";
import { shouldAggregateTranslatorChannelsForPools } from "../poolRules";
import { isBitcoinSocketError } from "@/lib/bitcoinSocketErrors";

interface ReviewStartProps extends StepProps {
  onComplete: () => void;
  onGoToStep: (step: SetupStep) => void;
}

async function confirmStackStarted(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch("/api/status", { signal: controller.signal });
    if (!response.ok) return false;

    const status = await response.json();
    return status.configured === true && status.running === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function ReviewStart({ data, updateData, onComplete, onGoToStep }: ReviewStartProps) {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const isJdMode = data.mode === "jd";
  const isSoloMode = data.miningMode === "solo";
  const isAggregatedTproxy =
    !isSoloMode && shouldAggregateTranslatorChannelsForPools([
      data.pool,
      ...(data.fallbackPools ?? []),
    ]);
  const showBitcoinSetupButton = isJdMode && isBitcoinSocketError(error);

  // Start Mining stays pinned at the bottom, so a start error can appear out of view.
  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000);

      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const errorData = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          errorData.error || errorData.message || `Failed (${response.status})`,
        );
      await queryClient.invalidateQueries({ queryKey: ["setup-status"] });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setStarted(true);
      setIsStarting(false);
    } catch (err) {
      let message = "Failed to start services";
      if (err instanceof Error) {
        const mayHaveStarted =
          err.name === "AbortError" ||
          err.message.includes("fetch") ||
          err.message.includes("Network");

        if (mayHaveStarted && await confirmStackStarted()) {
          await queryClient.invalidateQueries({ queryKey: ["setup-status"] });
          setStarted(true);
          setIsStarting(false);
          return;
        }

        if (err.name === "AbortError") {
          message =
            "Request timed out. The containers may still be starting — check the terminal.";
        } else if (
          err.message.includes("fetch") ||
          err.message.includes("Network")
        ) {
          message =
            "Cannot reach the server. Make sure the backend is running.";
        } else {
          message = err.message;
        }
      }
      setError(message);
      setIsStarting(false);
    }
  };

  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!started) return;
    if (countdown === 0) {
      onComplete();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [started, countdown, onComplete]);

  if (started) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
            Client is running!
          </h2>
          <p className="text-lg text-muted-foreground">
            Point your mining devices to the addresses below
          </p>
        </div>
        <MinerConnectionInfo isJdMode={isJdMode} centered />
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onComplete}
            className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
          >
            Go to Dashboard
          </button>
          <p className="text-xs text-muted-foreground">
            Redirecting in {countdown}s…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Review & Start
        </h2>
        <p className="text-lg text-muted-foreground">
          Click the edit icon to change a setting.
        </p>
      </div>

      {error && (
        <Alert ref={errorRef} variant="destructive">
          <div>
            <div className="font-medium text-sm text-red-600 dark:text-red-500 mb-1">
              Error
            </div>
            <div className="text-sm text-muted-foreground">{error}</div>
            {showBitcoinSetupButton && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  onGoToStep("bitcoin");
                }}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
              >
                Open Bitcoin Setup
              </button>
            )}
          </div>
        </Alert>
      )}

      <div className="space-y-4">
        <ConfigurationEditor
          config={data}
          onSave={(updated) => {
            updateData(updated);
            return true;
          }}
          onSetupRequired={() => onGoToStep("mining-mode")}
          isSaving={isStarting}
          saveLabel="Save"
          onEditingChange={setIsEditing}
        />
        {isAggregatedTproxy && (
          <Alert variant="warning" className="text-xs leading-relaxed">
            Translator aggregation is enabled for Braiins compatibility.
            The Translator Proxy will aggregate all SV1 workers into one
            single SV2 upstream channel, so the Braiins Pool dashboard
            will not track workers individually.
          </Alert>
        )}
      </div>

      <div className="sticky bottom-0 flex justify-center bg-background py-4">
        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting || isEditing}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 transition-colors font-medium"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting (this may take a minute)...
            </span>
          ) : (
            "Start Mining"
          )}
        </button>
      </div>
    </div>
  );
}
