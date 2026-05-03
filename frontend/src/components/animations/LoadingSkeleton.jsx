import React from "react";
import { cn } from "@/lib/utils";

/** Lightweight placeholder for loading KPI values */
export default function LoadingSkeleton({ className = "", height = "h-8" }) {
  return <div className={cn("animate-pulse rounded-sm bg-gov-border/80", height, className)} aria-hidden />;
}
