// User identity form component

import { useState } from "react";
import { ArrowRight, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const UserIdentityForm = ({ data, updateData, onContinue }: { data?: any, updateData?: (newData: any) => void, onContinue?: () => void }) => {
  const [username, setUsername] = useState(data?.userIdentity || "");
  const [signature, setSignature] = useState(data?.userSignature || "");
  const [address, setAddress] = useState(data?.coinbaseRewardScript || "");
  const needsAddress = !!data?.bitcoinSocketPath;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateData) {
      updateData({
        userIdentity: username,
        userSignature: signature,
        ...(needsAddress && address ? { coinbaseRewardScript: address } : {})
      });
    }
    if (onContinue) {
      onContinue();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-md mx-auto">
      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
         <h3 className="text-primary font-semibold flex items-center gap-2 mb-2">
           <Cpu className="w-4 h-4" /> Pool Account Configuration
         </h3>
         <p className="text-sm text-muted-foreground">
           Provide your pool account details. Your signature will appear on found blocks alongside the pool's signature.
         </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Pool Username <span className="text-primary">*</span></Label>
        <Input
          id="username"
          placeholder="your_username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required

        />
        <p className="text-xs text-muted-foreground">Your account username on the pool (user_identity field).</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signature">Block Signature <span className="text-primary">*</span></Label>
        <Input
          id="signature"
          placeholder="Your signature"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          required

        />
        <p className="text-xs text-muted-foreground">Your signature that will appear on found blocks.</p>
      </div>

      {needsAddress && (
        <div className="space-y-2">
          <Label htmlFor="address">Solo Mining Address (Last Resort) <span className="text-primary">*</span></Label>
          <Input
            id="address"
            placeholder="bc1q..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required

          />
          <p className="text-xs text-muted-foreground">Bitcoin address used only as last resort for solo-mining (coinbase_reward_script in JDC config).</p>
        </div>
      )}

      <div className="pt-4 flex justify-end">
        <Button type="submit" className="w-full md:w-auto">
          Continue <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
