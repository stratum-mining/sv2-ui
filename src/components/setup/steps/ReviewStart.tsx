import React, { useState, useEffect } from "react";
import { SetupStep, StepProps } from "../types";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { MinerConnectionInfo } from "../MinerConnectionInfo";
import { shouldAggregateTranslatorChannelsForPools } from "../poolRules";
import { isBitcoinSocketError } from "@/lib/bitcoinSocketErrors";
import { getPoolUserIdentityDisplay } from "@/lib/miningIdentity";
import { formatHashrate } from "@/lib/utils";
import { formatBitcoinCoreVersion, normalizeBitcoinCoreVersion } from "@sv2-ui/shared";

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

export function ReviewStart({ data, onComplete, onGoToStep }: ReviewStartProps) {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isJdMode = data.mode === "jd";
  const isSoloMode = data.miningMode === "solo";
  const isSovereignSolo = isSoloMode && isJdMode;
  const showBlockTemplates = data.mode !== null;
  const showPoolSection = Boolean(data.pool) && !isSovereignSolo;
  const showFallbackPools = !isSovereignSolo && (data.fallbackPools?.length ?? 0) > 0;
  const showBitcoinSection = isJdMode && Boolean(data.bitcoin);
  const bitcoinCoreVersion = normalizeBitcoinCoreVersion(data.bitcoin?.core_version);
  const templateModeLabel = isSoloMode
    ? isJdMode
      ? "Sovereign Solo Mining"
      : "Solo Pool Templates"
    : isJdMode
      ? "Custom Templates (Job Declaration)"
      : "Pool Templates";
  const isAggregatedTproxy =
    !isSoloMode && shouldAggregateTranslatorChannelsForPools([
      data.pool,
      ...(data.fallbackPools ?? []),
    ]);
  const showBitcoinSetupButton = isJdMode && isBitcoinSocketError(error);

  let sectionCount = 0;
  const nextSection = () => (++sectionCount).toString();

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

  const SectionLabel = ({
    n,
    label,
  }: {
    n: string;
    label: React.ReactNode;
  }) => (
    <div className="flex items-center gap-2 mb-2">
      <span
        className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="font-medium text-sm">{label}</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Review & Start
        </h2>
        <p className="text-lg text-muted-foreground">
          Review your configuration and start the SV2 client
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
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

      {/* Summary */}
      <div className="space-y-px">
        <div className="p-5 rounded-t-xl border border-border bg-card">
          <SectionLabel n={nextSection()} label="Mining Setup" />
          <p className="text-sm text-muted-foreground pl-7">
            {isSoloMode ? "Solo Mining" : "Pool Mining"}
          </p>
        </div>

        {showBlockTemplates && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Block Templates" />
            <p className="text-sm text-muted-foreground pl-7">
              {templateModeLabel}
            </p>
          </div>
        )}

        {showPoolSection && data.pool && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel
              n={nextSection()}
              label={isSoloMode ? "Solo Pool" : "Pool"}
            />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div>
                <span className="text-foreground">
                  {data.pool.name || "Custom"}
                </span>
              </div>
              <div className="font-mono text-xs">
                {data.pool.address}:{data.pool.port}
              </div>
              <div className="font-mono text-xs truncate text-muted-foreground/70">
                {data.pool.authority_public_key}
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  Username:
                </span>{" "}
                <span className="font-mono text-xs text-foreground break-all">
                  {getPoolUserIdentityDisplay(data.pool, data.miningMode)}
                </span>
              </div>
              {isAggregatedTproxy && (
                <Alert variant="warning" className="mt-2 py-2 px-3 text-xs leading-relaxed">
                  Translator aggregation is enabled for Braiins compatibility.
                  The Translator Proxy will aggregate all SV1 workers into one
                  single SV2 upstream channel, so the Braiins Pool dashboard
                  will not track workers individually.
                </Alert>
              )}
            </div>
          </div>
        )}

        {showFallbackPools && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Fallback Pools" />
            <div className="text-sm text-muted-foreground space-y-3 pl-7">
              {data.fallbackPools.map((pool, index) => (
                <div key={`${pool.address}:${pool.port}:${index}`} className="space-y-1">
                  <div>
                    <span className="text-foreground">
                      {pool.name || `Fallback ${index + 1}`}
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    {pool.address}:{pool.port}
                  </div>
                  <div className="font-mono text-xs truncate text-muted-foreground/70">
                    {pool.authority_public_key}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      Username:
                    </span>{" "}
                    <span className="font-mono text-xs text-foreground break-all">
                      {getPoolUserIdentityDisplay(pool, data.miningMode)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showBitcoinSection && data.bitcoin && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Bitcoin Core" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div>Bitcoin Core {bitcoinCoreVersion ? formatBitcoinCoreVersion(bitcoinCoreVersion) : "Not selected"}</div>
              <div>{data.bitcoin.network}</div>
              <div className="font-mono text-xs truncate">
                {data.bitcoin.socket_path}
              </div>
            </div>
          </div>
        )}

        {data.translator?.min_hashrate && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Lowest Worker Hashrate" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div className="font-semibold text-primary">
                {formatHashrate(data.translator.min_hashrate)}
              </div>
              <div className="text-xs">
                Used as the starting difficulty per worker. SV2 auto-tunes from here via vardiff.
              </div>
            </div>
          </div>
        )}

        {data.miner_telemetry_cidr && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Miner Telemetry" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div className="font-mono text-xs text-foreground">
                {data.miner_telemetry_cidr}
              </div>
              <div className="text-xs">
                LAN subnet scanned for miner web/API telemetry.
              </div>
            </div>
          </div>
        )}

        {data.translator && (
          <div className={`p-5 border-x border-b border-border bg-card ${!isJdMode ? "rounded-b-xl" : ""}`}>
            <SectionLabel n={nextSection()} label="Advanced Mining Config" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div>
                Shares per minute:{" "}
                <span className="font-mono text-xs text-foreground">
                  {data.translator.shares_per_minute ?? 6}
                </span>
              </div>
              <div>
                Downstream extranonce2 size:{" "}
                <span className="font-mono text-xs text-foreground">
                  {data.translator.downstream_extranonce2_size ?? 4}
                </span>
              </div>
              {data.miningMode === "solo" && data.mode === "no-jd" && (
                <div>
                  Coinbase verification:{" "}
                  <span className="font-mono text-xs text-foreground">
                    {(data.translator.verify_payout ?? true) ? "Enabled" : "Disabled"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {isJdMode && data.jdc && (
          <div className="p-5 rounded-b-xl border-x border-b border-border bg-card">
            <SectionLabel n={nextSection()} label="Job Declaration" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              {data.jdc.coinbase_reward_address && (
                <div>
                  <span className="text-muted-foreground text-xs">
                    {isSovereignSolo
                      ? "Block Reward Address:"
                      : "Fallback Address:"}
                  </span>{" "}
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {data.jdc.coinbase_reward_address}
                  </span>
                </div>
              )}
              {data.jdc.jdc_signature && (
                <div>
                  <span className="text-muted-foreground text-xs">
                    Miner Signature:
                  </span>{" "}
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {data.jdc.jdc_signature}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting}
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
