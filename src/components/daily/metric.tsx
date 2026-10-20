import type { LucideIcon } from "lucide-react"

import { formatCount, progressBand, progressRatio, type ProgressBand } from "@/lib/daily/health"

const BAND_CLASS: Record<Exclude<ProgressBand, "none">, string> = {
  low: "bg-[var(--progress-low)]",
  mid: "bg-[var(--progress-mid)]",
  met: "bg-[var(--progress-met)]",
}

export function MetricTotal({
  label,
  icon: Icon,
  accent,
  value,
  unit,
  target,
  targetLabel,
  display,
  targetText,
}: {
  label: string
  icon: LucideIcon
  accent: string
  value: number
  unit: string
  target: number | null
  targetLabel?: string
  display?: string
  targetText?: string
}) {
  const ratio = progressRatio(value, target)
  const band = progressBand(ratio)
  const width = ratio == null ? 0 : Math.min(100, ratio * 100)
  const percent = ratio == null ? null : Math.round(ratio * 100)

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" style={{ color: accent }} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {display ?? formatCount(value)}
        {display ? null : <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {target == null ? "No target set" : targetText ?? `of ${formatCount(target)} ${targetLabel ?? unit}`}
      </p>
      {ratio != null && target != null ? (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`${label} progress`}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(value, target)}
            aria-valuetext={`${percent}% of ${formatCount(target)} ${targetLabel ?? unit}`}
          >
            <div className={`h-full rounded-full ${BAND_CLASS[band === "none" ? "low" : band]}`} style={{ width: `${width}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{percent}%</p>
        </div>
      ) : null}
    </div>
  )
}
