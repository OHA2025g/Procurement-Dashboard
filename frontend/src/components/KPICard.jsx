import React from "react";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { fmtCr, fmtNum, fmtPct } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import LoadingSkeleton from "@/components/animations/LoadingSkeleton";
import AnimatedNumber from "@/components/animations/AnimatedNumber";

const TONE = {
  default: { ring: "border-gov-border", bar: "bg-gov-navy", text: "text-gov-navy" },
  gold: { ring: "border-gov-gold/40", bar: "bg-gov-gold", text: "text-gov-navy" },
  crit: { ring: "border-gov-crit/30", bar: "bg-gov-crit", text: "text-gov-crit" },
  high: { ring: "border-gov-high/30", bar: "bg-gov-high", text: "text-gov-high" },
  med: { ring: "border-gov-med/30", bar: "bg-gov-med", text: "text-gov-med" },
  low: { ring: "border-gov-low/30", bar: "bg-gov-low", text: "text-gov-low" },
};

export default function KPICard({
  label,
  value,
  unit = "",
  prefix = "",
  suffix = "",
  format = "num",
  tone = "default",
  trend,
  caption,
  testId,
  icon: Icon,
  onClick,
  loading = false,
  deltaValue,
  deltaPct,
  deltaDirection,
  formula,
  whyThisMatters,
  tooltip,
  animateValue = false,
}) {
  const t = TONE[tone] || TONE.default;
  const interactive = typeof onClick === "function";

  const displayRaw =
    value === null || value === undefined
      ? null
      : format === "cr"
        ? fmtCr(value)
        : format === "pct"
          ? fmtPct(value).replace("%", "")
          : fmtNum(value);

  const showAnimated = animateValue && format === "num" && typeof value === "number" && Number.isFinite(value);

  const display = showAnimated ? <AnimatedNumber value={value} decimals={0} /> : displayRaw ?? "—";

  const deltaLine =
    deltaPct != null && deltaPct !== undefined ? (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-data ${
          deltaDirection === "up" ? "text-gov-med" : deltaDirection === "down" ? "text-gov-crit" : "text-gov-muted"
        }`}
      >
        {deltaDirection === "up" ? <TrendingUp size={11} /> : deltaDirection === "down" ? <TrendingDown size={11} /> : <Minus size={11} />}
        {deltaPct > 0 ? "+" : ""}
        {typeof deltaPct === "number" ? deltaPct.toFixed(1) : deltaPct}%
        {deltaValue != null && <span className="ml-1 opacity-80">vs prior</span>}
      </span>
    ) : null;

  const tooltipBody = [tooltip, formula && `Formula: ${formula}`, whyThisMatters && `Why this matters: ${whyThisMatters}`]
    .filter(Boolean)
    .join("\n\n");

  const cardInner = (
    <>
      <div className={`absolute top-0 left-0 w-1 h-full ${t.bar}`} />
      <div className="px-4 py-4 pl-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.12em] font-data text-gov-muted leading-snug flex items-center gap-1">
            {label}
            {(tooltip || formula || whyThisMatters) && (
              <Info size={12} className="text-gov-muted/70 shrink-0" aria-hidden />
            )}
          </span>
          {Icon && <Icon size={14} className="text-gov-muted" />}
        </div>
        {loading ? (
          <LoadingSkeleton height="h-10" className="max-w-[140px]" />
        ) : (
          <div className="flex items-baseline gap-1">
            {prefix && <span className="text-[11px] font-data text-gov-muted">{prefix}</span>}
            <span className={`stat-num text-[22px] font-semibold leading-none ${t.text}`} data-testid={`${testId}-value`}>
              {display}
            </span>
            {(unit || suffix || format === "pct") && (
              <span className="text-[11px] font-data text-gov-muted">
                {unit || suffix || (format === "pct" ? "%" : "")}
              </span>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {deltaLine}
          {!deltaLine && trend !== undefined && trend !== null && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-data ${
                trend > 0 ? "text-gov-med" : trend < 0 ? "text-gov-crit" : "text-gov-muted"
              }`}
            >
              {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
          {caption && <span className="text-[10px] text-gov-muted font-data tracking-wide">{caption}</span>}
        </div>
      </div>
    </>
  );

  const card = (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      className={`bg-white border ${t.ring} rounded-sm shadow-card relative overflow-hidden group ${
        interactive ? "cursor-pointer hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-gov-gold/50" : ""
      }`}
      data-testid={`kpi-card-${testId || label?.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {cardInner}
    </div>
  );

  if (tooltipBody) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="outline-none">{card}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-left font-data text-[11px] leading-snug bg-gov-navy text-white border-gov-border whitespace-pre-wrap">
            {tooltipBody}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
}
