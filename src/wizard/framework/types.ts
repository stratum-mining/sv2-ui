// Types and interfaces for wizard framework

import React from "react";

export type StepId = string;

export interface WizardOption {
  id: string;
  label: string;
  subLabel?: string;
  value: string;
  nextStepId: StepId;
  iconName?: string;
  icon?: React.ElementType;
  iconUrl?: string; // URL to custom icon/image
  badge?: string;
  badgeColor?: "green" | "orange" | "blue" | "default";
  warning?: string;
  disabled?: boolean;
  url?: string; // URL to open when option is clicked (for disabled options)
}

export interface WizardStep {
  id: StepId;
  type: 'question' | 'result' | 'instruction' | 'custom';
  title: string;
  description?: string;
  options?: WizardOption[];
  nextStepId?: StepId;
  skipStepId?: StepId;
  skipLabel?: string;
  component?: React.ReactNode;
  wide?: boolean;
}

export interface WizardConfig {
  initialStepId: StepId;
  steps: Record<StepId, WizardStep>;
  title?: string;
  subtitle?: string;
}
