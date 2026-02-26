import { ArrowRight, ShieldCheck, Layers, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WizardIntro({ onContinue }: { onContinue?: () => void }) {
  return (
    <div className="space-y-12 py-4">

      {/* Logo + headline */}
      <div className="flex flex-col items-center text-center space-y-5">
        <img
          src="/stratum-logo.png"
          alt="Stratum V2"
          className="h-28 w-auto"
        />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          Welcome to the SRI Stack Setup
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl leading-relaxed">
          Stratum V2 is the next-generation Bitcoin mining protocol — faster, more secure,
          and designed to give miners back their sovereignty. This wizard gets you running
          in a few minutes.
        </p>
      </div>

      {/* Two path cards */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Path 1 — Sovereignty */}
        <div className="relative rounded-2xl border border-primary/30 bg-card p-8 space-y-4 shadow-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 text-primary font-semibold text-lg">
            <Layers className="w-6 h-6 shrink-0" />
            Own block templates
          </div>
          <p className="text-base text-muted-foreground leading-relaxed">
            Run a <strong className="text-foreground">Bitcoin Core node</strong> alongside
            the JD Client. Your miner selects its own transactions and builds its own
            block templates — the pool never touches that decision.
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 mt-2">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Full sovereignty over block contents</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Pool cannot censor your transactions</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Eliminates empty-block attacks</li>
            <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">→</span> Requires a synced Bitcoin Core node</li>
          </ul>
        </div>

        {/* Path 2 — Pool templates */}
        <div className="relative rounded-2xl border border-primary/30 bg-card p-8 space-y-4 shadow-md overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 text-primary font-semibold text-lg">
            <Plug className="w-6 h-6 shrink-0" />
            Pool templates — easy setup
          </div>
          <p className="text-base text-muted-foreground leading-relaxed">
            Connect your existing SV1 miners through the <strong className="text-foreground">Translator Proxy</strong>.
            Your miner keeps working as normal — the proxy bridges it to an SV2 pool,
            no Bitcoin Core needed.
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 mt-2">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Works with any existing SV1 miner</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Encrypted connection to the pool</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> No node to run or maintain</li>
            <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">→</span> Block contents decided by the pool</li>
          </ul>
        </div>

      </div>

      {/* SV2 advantages banner */}
      <div className="rounded-2xl border border-border bg-muted/30 px-6 py-5">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground mb-4">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          Both paths share these SV2 advantages
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="text-primary mt-0.5">✓</span>
            <span><strong className="text-foreground">Encrypted channel</strong> — protects against man-in-the-middle attacks and hashrate hijacking</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary mt-0.5">✓</span>
            <span><strong className="text-foreground">Faster share submission</strong> — binary protocol reduces latency vs. SV1 JSON</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary mt-0.5">✓</span>
            <span><strong className="text-foreground">Open standard</strong> — no vendor lock-in, auditable implementation</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-center pt-2">
        <Button size="lg" onClick={onContinue} className="group px-10 text-base h-12">
          Get Started
          <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>

    </div>
  );
}
