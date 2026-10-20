"use client"

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { kgToDisplay, type WeightUnit } from "@/lib/daily/health"

export function WeightHistoryChart({
  points,
  unit,
}: {
  points: Array<{ date: string; kg: number }>
  unit: WeightUnit
}) {
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const data = [...points]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({ date: point.date.slice(5), fullDate: point.date, value: kgToDisplay(point.kg, unit) }))

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No weight measurements yet.</p>
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={36} domain={["auto", "auto"]} />
          <Tooltip
            content={({ payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!row) return null
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs">
                  <p>{row.fullDate}</p>
                  <p>{row.value} {unit}</p>
                </div>
              )
            }}
          />
          <Line type="monotone" dataKey="value" name={`Weight (${unit})`} stroke="var(--metric-weight)" strokeWidth={1.75} dot={{ r: 2 }} connectNulls={false} isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
