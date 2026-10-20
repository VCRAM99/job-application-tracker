"use client"

import { useState } from "react"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { datesInRange } from "@/lib/daily/calendar"
import { addCalendarDays } from "@/lib/records/logic"
import { kgToDisplay, normalizeSeries, pointsByDate, type WeightUnit } from "@/lib/daily/health"

const SERIES = [
  { key: "calories", label: "Calories", color: "var(--metric-calories)", unit: "kcal" },
  { key: "protein", label: "Protein", color: "var(--metric-protein)", unit: "g" },
  { key: "water", label: "Water", color: "var(--metric-water)", unit: "mL" },
  { key: "sleep", label: "Sleep", color: "var(--metric-sleep)", unit: "min" },
  { key: "steps", label: "Steps", color: "var(--metric-steps)", unit: "steps" },
  { key: "weight", label: "Weight", color: "var(--metric-weight)", unit: "kg" },
] as const

type Row = { date: string; value: number }

export function HealthChart({
  today,
  calories,
  protein,
  water,
  sleep,
  steps,
  weight,
  weightUnit = "kg",
}: {
  today: string
  calories: Row[]
  protein: Row[]
  water: Row[]
  sleep: Row[]
  steps: Row[]
  weight: Row[]
  weightUnit?: WeightUnit
}) {
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const [visible, setVisible] = useState<Record<string, boolean>>({
    calories: true,
    protein: true,
    water: true,
    sleep: true,
    steps: true,
    weight: true,
  })
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const dates = datesInRange(addCalendarDays(today, -(range - 1)), today)
  const raw = {
    calories: pointsByDate(dates, calories),
    protein: pointsByDate(dates, protein),
    water: pointsByDate(dates, water),
    sleep: pointsByDate(dates, sleep),
    steps: pointsByDate(dates, steps),
    weight: pointsByDate(dates, weight),
  }
  const normalized = {
    calories: normalizeSeries(raw.calories.map((point) => point.value)),
    protein: normalizeSeries(raw.protein.map((point) => point.value)),
    water: normalizeSeries(raw.water.map((point) => point.value)),
    sleep: normalizeSeries(raw.sleep.map((point) => point.value)),
    steps: normalizeSeries(raw.steps.map((point) => point.value)),
    weight: normalizeSeries(raw.weight.map((point) => point.value)),
  }
  const data = dates.map((date, index) => ({
        date: date.slice(5),
        fullDate: date,
        calories: normalized.calories[index],
        protein: normalized.protein[index],
        water: normalized.water[index],
        sleep: normalized.sleep[index],
        steps: normalized.steps[index],
        weight: normalized.weight[index],
        caloriesRaw: raw.calories[index]?.value,
        proteinRaw: raw.protein[index]?.value,
        waterRaw: raw.water[index]?.value,
        sleepRaw: raw.sleep[index]?.value,
        stepsRaw: raw.steps[index]?.value,
        weightRaw: raw.weight[index]?.value,
      }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {([7, 30, 90] as const).map((days) => (
          <button
            key={days}
            type="button"
            className={`pressable pressable-quiet rounded-full border px-3 py-1 text-xs ${range === days ? "bg-foreground text-background" : ""}`}
            aria-pressed={range === days}
            onClick={() => setRange(days)}
          >
            {days} days
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {SERIES.map((series) => (
          <label key={series.key} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={visible[series.key]}
              onChange={() => setVisible((current) => ({ ...current, [series.key]: !current[series.key] }))}
            />
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: series.color }} aria-hidden="true" />
              {series.label}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Relative trends (normalized 0–100). Tooltips show the recorded values and units. Missing days are gaps, and weight is only plotted on days you measured it.
      </p>
      {data.every((row) => SERIES.every((series) => row[series.key] == null)) ? (
        <p className="text-sm text-muted-foreground">No health entries in this range.</p>
      ) : null}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={28} />
            <Tooltip
              content={({ payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!row) return null
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs">
                    <p className="font-medium">{row.fullDate}</p>
                    {SERIES.filter((series) => visible[series.key]).map((series) => {
                      const value = row[`${series.key}Raw` as keyof typeof row]
                      const shown = series.key === "weight" && typeof value === "number"
                        ? `${kgToDisplay(value, weightUnit)} ${weightUnit}`
                        : value == null ? "No entry" : `${value} ${series.unit}`
                      return (
                        <p key={series.key}>
                          {series.label}: {shown}
                        </p>
                      )
                    })}
                  </div>
                )
              }}
            />
            <Legend />
            {SERIES.filter((series) => visible[series.key]).map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={1.75}
                dot={false}
                connectNulls={false}
                isAnimationActive={!reduced}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
