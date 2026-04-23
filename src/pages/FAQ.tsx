import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { faqData, type FaqItem } from '@/data/faq-data';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

function FaqAccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-foreground/5 transition-colors duration-150"
        aria-expanded={isOpen}
      >
        <span className="font-medium text-foreground pr-4">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4 pt-0 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const { status: connectionStatus, statusLabel: connectionLabel, poolName, uptime } = useConnectionStatus();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <Shell
      connectionStatus={connectionStatus}
      connectionLabel={connectionLabel ?? undefined}
      poolName={poolName ?? undefined}
      uptime={uptime}
    >
        <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Support & FAQ</h2>
          <p className="text-muted-foreground">
            Common questions about the SV2 UI.
          </p>
        </div>

        <Card className="shadow-md bg-gradient-to-br from-[#5865F2]/10 to-[#5865F2]/5 border-[#5865F2]/30">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-semibold text-lg text-foreground">Join our Community</h3>
                <p className="text-sm text-muted-foreground">
                  Can't find your answer below? Connect with our community on Discord for real-time support.
                </p>
              </div>
              <a
                href="https://discord.com/invite/fsEW23wFYs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                Join Discord
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-md">
          <CardContent className="pt-6 space-y-3">
            {faqData.map((item, index) => (
              <FaqAccordionItem
                key={index}
                item={item}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </CardContent>
        </Card>

      </div>
    </Shell>
  );
}
