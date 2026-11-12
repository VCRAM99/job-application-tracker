"use client"

import dynamic from "next/dynamic"

import { HelpTip } from "@/components/ui/help-tip"
import { SCHEDULE_CHANGE_NOTE } from "@/lib/daily/calendar"
import type { HealthMetric } from "@/lib/daily/goals"
import type { WeightUnit } from "@/lib/daily/health"
import type { insightsFor } from "@/lib/daily/model"

// recharts loads only when health insights render, in its own chunk.
const HealthChart = dynamic(() => import("@/components/daily/health-chart").then((module) => module.HealthChart), {
  ssr: false,
  loading: () => <div className="h-80 w-full" aria-hidden="true" />,
})

type Series = Array<{ date: string; value: number }>

function Panel({ title, help, children, className = "" }: { title: string; help: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.06] ${className}`} aria-label={title}>
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <HelpTip label={`About ${title.toLowerCase()}`}>{help}</HelpTip>
      </div>
      {children}
    </section>
  )
}

export function WeeklyInsights({ insights, className }: { insights: ReturnType<typeof insightsFor>; className?: string }) {
  return (
    <Panel title="Weekly Insights" help={SCHEDULE_CHANGE_NOTE} className={className}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {insights.week.start} – {insights.week.end}
        {insights.items.length ? ` · ${insights.completed}/${insights.scheduled} done` : ""}
      </p>
      {insights.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing was scheduled this week.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.items.map((item) => (
            <li key={item.taskId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{item.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {item.completed}/{item.scheduled}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label={`${item.title} completed`}
                aria-valuemin={0}
                aria-valuemax={item.scheduled}
                aria-valuenow={item.completed}
                aria-valuetext={`${item.completed} of ${item.scheduled} scheduled days`}
              >
                <div className="h-full rounded-full bg-foreground/70 transition-[width] duration-300" style={{ width: `${item.scheduled === 0 ? 0 : (item.completed / item.scheduled) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function HealthInsights({
  today,
  weightUnit,
  hidden,
  series,
}: {
  today: string
  weightUnit: WeightUnit
  hidden: HealthMetric[]
  series: { calories: Series; protein: Series; water: Series; sleep: Series; steps: Series; weight: Series }
}) {
  return (
    <Panel title="Health Insights" help="Relative trends for the last 7, 30, or 90 days, each scaled 0–100. Tooltips show the recorded values.">
      <HealthChart today={today} weightUnit={weightUnit} hidden={hidden} {...series} />
    </Panel>
  )
}
