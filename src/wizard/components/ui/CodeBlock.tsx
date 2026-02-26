// Code block component with copy functionality

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const CodeBlock = ({ label, code }: { label: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-accent px-6 py-3 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground font-mono">{label}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-primary/10 hover:text-primary" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="bg-card overflow-x-auto px-6 py-4">
        <pre className="font-mono text-sm text-foreground"><code>{code}</code></pre>
      </div>
    </div>
  );
};
