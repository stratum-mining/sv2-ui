// Utility functions for wizard framework

import React from "react";
import { Asterisk as Icons } from "lucide-react";
import type { WizardOption } from "./types";

/**
 * Get icon component from name or direct reference
 */
export const getIcon = (name?: string, direct?: React.ElementType): React.ElementType | null => {
  if (direct) return direct;
  if (name && (Icons as any)[name]) return (Icons as any)[name];
  return null;
};

/**
 * Get badge CSS classes based on color
 */
export const getBadgeClasses = (color?: WizardOption["badgeColor"]) => {
  switch (color) {
    case "green":
      return "bg-success/10 text-success-foreground border-success/20";
    case "blue":
      return "bg-info/10 text-info-foreground border-info/20";
    case "orange":
    default:
      return "bg-warning/10 text-warning-foreground border-warning/20";
  }
};
