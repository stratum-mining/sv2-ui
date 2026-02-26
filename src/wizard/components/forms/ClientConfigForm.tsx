// JD Client configuration form component

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export const ClientConfigForm = ({ data, updateData, onContinue }: any) => {
  const [userIdentity, setUserIdentity] = useState(data.userIdentity || "");
  const [sharesPerMinute, setSharesPerMinute] = useState(data.clientSharesPerMinute || 6.0);
  const [shareBatchSize, setShareBatchSize] = useState(data.clientShareBatchSize || 10);
  const [jdcSignature, setJdcSignature] = useState(data.jdcSignature || "");
  const [coinbaseRewardScript, setCoinbaseRewardScript] = useState(data.coinbaseRewardScript || "");
  const [feeThreshold, setFeeThreshold] = useState(data.clientFeeThreshold || 100);
  const [minInterval, setMinInterval] = useState(data.clientMinInterval || 5);
  const [isOpen, setIsOpen] = useState(false);

  // Determine network from data or default to mainnet
  const network = data?.selectedNetwork || "mainnet";
  const addressPlaceholder = network === "testnet4" ? "tb1q..." : "bc1q...";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateData({
      userIdentity,
      clientSharesPerMinute: sharesPerMinute,
      clientShareBatchSize: shareBatchSize,
      jdcSignature,
      coinbaseRewardScript,
      clientFeeThreshold: feeThreshold,
      clientMinInterval: minInterval
    });
    onContinue();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-md mx-auto">
      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
         <h3 className="text-primary font-semibold flex items-center gap-2 mb-2">
           <Cpu className="w-4 h-4" /> Miner Configuration
         </h3>
         <p className="text-sm text-muted-foreground">
           Configure your miner settings for Job Declarator Client.
         </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="userIdentity">User Identity <span className="text-primary">*</span></Label>
        <Input
          id="userIdentity"
          placeholder="your_username_here"
          value={userIdentity}
          onChange={(e) => setUserIdentity(e.target.value)}
          required

        />
        <p className="text-xs text-muted-foreground">Username of your account with the pool, used to open channels with the Pool.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="jdcSignature">Miner Signature <span className="text-primary">*</span></Label>
        <Input
          id="jdcSignature"
          placeholder="Sv2MinerSignature"
          value={jdcSignature}
          onChange={(e) => setJdcSignature(e.target.value)}
          required

        />
        <p className="text-xs text-muted-foreground">String that will be added to the coinbase transaction.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="coinbaseRewardScript">Coinbase Reward Address (Solo Mining) <span className="text-primary">*</span></Label>
        <Input
          id="coinbaseRewardScript"
          placeholder={addressPlaceholder}
          value={coinbaseRewardScript}
          onChange={(e) => setCoinbaseRewardScript(e.target.value)}
          required

        />
        <p className="text-xs text-muted-foreground">Bitcoin address used by Job Declarator Client as last resort after fallback to solo-mining.</p>
      </div>

      <div className="w-full space-y-2 border border-border rounded-lg bg-accent/50 p-4">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex justify-between items-center text-sm font-semibold hover:text-primary transition-colors"
        >
          <span>Advanced Configuration</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4 pt-4"
          >
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="feeThreshold">Fee Threshold</Label>
                  <Input
                    id="feeThreshold"
                    type="number"
                    value={feeThreshold}
                    onChange={(e) => setFeeThreshold(parseInt(e.target.value) || 0)}

                  />
                  <p className="text-xs text-muted-foreground">Minimum fee threshold to trigger new templates from the node.</p>
               </div>
               <div className="space-y-2">
                  <Label htmlFor="minInterval">Min Interval</Label>
                  <Input
                    id="minInterval"
                    type="number"
                    value={minInterval}
                    onChange={(e) => setMinInterval(parseInt(e.target.value) || 0)}

                  />
                  <p className="text-xs text-muted-foreground">Minimum interval (seconds) for generating templates to avoid overloading clients.</p>
               </div>
             </div>

             <div className="space-y-2">
                  <Label htmlFor="shareBatchSize">Share Batch Size</Label>
                  <Input
                    id="shareBatchSize"
                    type="number"
                    value={shareBatchSize}
                    onChange={(e) => setShareBatchSize(parseInt(e.target.value))}

                  />
                  <p className="text-xs text-muted-foreground">How many shares do we want to acknowledge in a batch.</p>
             </div>

             <div className="space-y-2 pt-2">
              <div className="flex justify-between">
                <Label>Shares Per Minute (VarDiff)</Label>
                <span className="text-sm text-primary font-mono">{sharesPerMinute}</span>
              </div>
              <Slider
                value={[sharesPerMinute]}
                onValueChange={(val) => setSharesPerMinute(val[0])}
                max={20}
                step={0.5}
                className="py-2"
              />
              <p className="text-xs text-muted-foreground">Target number of shares per minute per connection.</p>
            </div>
          </motion.div>
        )}
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" className="w-full md:w-auto">
          Continue <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
