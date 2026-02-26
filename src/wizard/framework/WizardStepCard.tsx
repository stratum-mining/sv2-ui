// Wizard step card component - renders different step types

import React from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WizardStep, StepId } from "./types";
import { getIcon, getBadgeClasses } from "./utils";

interface WizardStepCardProps {
  step: WizardStep;
  onOptionSelect: (nextStepId: StepId, value?: string) => void;
  onContinue: () => void;
  onSkip?: () => void;
  data: any;
  updateData: (newData: any) => void;
}

export const WizardStepCard: React.FC<WizardStepCardProps> = ({
  step,
  onOptionSelect,
  onContinue,
  onSkip,
  data,
  updateData
}) => {
  // Question Step
  if (step.type === 'question') {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{step.title}</h2>
          <p className="text-muted-foreground text-lg">{step.description}</p>
        </div>

        {(() => {
          const isPoolSelection = step.options?.some(o => o.iconUrl);
          return isPoolSelection ? (
            /* Pool selection: horizontal rows stacked vertically */
            <div className="flex flex-col gap-3 mt-8">
              {step.options?.map((option) => {
                const Icon = getIcon(option.iconName, option.icon);
                const isDisabled = option.disabled;
                const hasUrl = !!option.url;
                const Component = isDisabled && hasUrl ? 'div' : 'button';
                return (
                  <Component
                    key={option.value}
                    {...(Component === 'button' ? { type: 'button', disabled: isDisabled } : {})}
                    onClick={() => {
                      if (!isDisabled) {
                        onOptionSelect(option.nextStepId, option.value);
                      } else if (hasUrl) {
                        window.open(option.url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className={cn(
                      "group relative flex flex-row items-center gap-4 p-4 rounded-2xl border border-border bg-card transition-all duration-200 text-left w-full",
                      isDisabled && !hasUrl
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-accent hover:border-primary/50 cursor-pointer"
                    )}
                  >
                    <div className="shrink-0 p-3 rounded-full bg-primary/5 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                      <img
                        src={option.iconUrl}
                        alt={option.label}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          if (Icon) {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            const iconDiv = e.currentTarget.parentElement?.querySelector('.icon-fallback') as HTMLElement | null;
                            if (iconDiv) iconDiv.style.display = 'block';
                          }
                        }}
                      />
                      {Icon && (
                        <div className="icon-fallback hidden">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {option.label}
                      </span>
                      {option.subLabel && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {option.subLabel}
                        </span>
                      )}
                      {option.warning && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {option.warning}
                        </p>
                      )}
                    </div>

                    {option.badge && (
                      <div
                        className={cn(
                          "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                          getBadgeClasses(option.badgeColor ?? (option.badge === "Easy" ? "green" : "orange"))
                        )}
                      >
                        {option.badge}
                      </div>
                    )}

                    <div className="absolute inset-0 border border-transparent group-hover:border-primary/20 rounded-2xl transition-colors pointer-events-none" />
                  </Component>
                );
              })}
            </div>
          ) : (
            /* All other question steps: original card layout */
            <div className={cn(
              "grid gap-4 mt-8",
              step.options && step.options.length > 2 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
            )}>
              {step.options?.map((option) => {
                const Icon = getIcon(option.iconName, option.icon);
                const isDisabled = option.disabled;
                const hasUrl = !!option.url;
                const Component = isDisabled && hasUrl ? 'div' : 'button';
                return (
                  <Component
                    key={option.value}
                    {...(Component === 'button' ? { type: 'button', disabled: isDisabled } : {})}
                    onClick={() => {
                      if (!isDisabled) {
                        onOptionSelect(option.nextStepId, option.value);
                      } else if (hasUrl) {
                        window.open(option.url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-8 rounded-2xl border border-border bg-card transition-all duration-200 text-left md:text-center h-full",
                      isDisabled && !hasUrl
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-accent hover:border-primary/50 cursor-pointer"
                    )}
                  >
                    {option.badge && (
                      <div
                        className={cn(
                          "pointer-events-none absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                          getBadgeClasses(option.badgeColor ?? (option.badge === "Easy" ? "green" : "orange"))
                        )}
                      >
                        {option.badge}
                      </div>
                    )}

                    {Icon && (
                      <div className="mb-4 p-4 rounded-full bg-primary/5 group-hover:bg-primary/20 text-primary transition-colors">
                        <Icon className="w-8 h-8" />
                      </div>
                    )}
                    <span className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                      {option.label}
                    </span>
                    {option.subLabel && (
                      <span className="mt-2 text-sm text-muted-foreground">
                        {option.subLabel}
                      </span>
                    )}
                    {option.warning && (
                      <span className="pointer-events-none mt-4 inline-flex items-center justify-center rounded-full border border-border bg-muted px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {option.warning}
                      </span>
                    )}
                    <div className="absolute inset-0 border border-transparent group-hover:border-primary/20 rounded-2xl transition-colors pointer-events-none" />
                  </Component>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  }

  // Instruction Step
  if (step.type === 'instruction') {
    return (
      <div className="space-y-6">
        {step.component ? React.cloneElement(step.component as React.ReactElement<any>, { data, updateData, onContinue }) : (
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">{step.title}</h2>
            <p className="text-muted-foreground">{step.description}</p>
          </div>
        )}

        {step.nextStepId && !step.component && (
          <div className="mt-8 flex justify-end">
            <Button onClick={onContinue} className="group">
              Continue <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Custom Step (e.g. Forms)
  if (step.type === 'custom') {
     return (
       <div className="space-y-6">
         <div className="text-center mb-8">
           <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">{step.title}</h2>
           {step.description && <p className="text-muted-foreground">{step.description}</p>}
         </div>
         {step.component ? React.cloneElement(step.component as React.ReactElement<any>, { data, updateData, onContinue }) : null}
         {step.skipStepId && onSkip && (
           <div className="flex justify-center pt-2">
             <button
               onClick={onSkip}
               className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
             >
               {step.skipLabel || 'Skip this step'}
             </button>
           </div>
         )}
       </div>
     )
  }

  // Result Step
  if (step.type === 'result') {
    return (
      <div className="space-y-6">
         <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4 ring-1 ring-primary/30">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">{step.title}</h2>
          <p className="text-muted-foreground">{step.description || "Configuration Ready"}</p>
        </div>

        {step.component ? React.cloneElement(step.component as React.ReactElement<any>, { data }) : null}
      </div>
    );
  }

  return null;
};
