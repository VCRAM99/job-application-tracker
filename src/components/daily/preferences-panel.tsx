"use client"

import { Settings2, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { CLOSE_RATIO, HEALTH_METRICS, LIMITS, METRIC_LABELS, type GoalMode, type HealthMetric, type ProteinDirection } from "@/lib/daily/goals"
import type { DailyGoals } from "@/lib/daily/model"

type NumberKey = "calorieTarget" | "proteinTarget" | "waterGoalMl" | "waterIncrementMl" | "sleepTargetMinutes" | "stepTarget"

const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; unit: string; decimal?: boolean; metric: HealthMetric; required?: boolean; min?: number; max: number }> = [
  { key: "calorieTarget", label: "Calorie target", unit: "kcal", metric: "food", max: LIMITS.calories },
  { key: "proteinTarget", label: "Protein target", unit: "g", decimal: true, metric: "food", max: LIMITS.protein },
  { key: "waterGoalMl", label: "Water goal", unit: "mL", metric: "water", max: LIMITS.waterGoal },
  { key: "waterIncrementMl", label: "Water button", unit: "mL", metric: "water", required: true, min: 1, max: LIMITS.waterIncrement },
  { key: "sleepTargetMinutes", label: "Sleep target", unit: "min", metric: "sleep", min: 1, max: LIMITS.sleepMinutes },
  { key: "stepTarget", label: "Step target", unit: "steps", metric: "steps", max: LIMITS.steps },
]

function Segmented<T extends string>({ legend, value, options, onChange, name }: { legend: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; name: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
        {options.map((option) => (
          <label key={option.value} className={`pressable relative cursor-pointer rounded-md px-2 py-1.5 text-center text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${value === option.value ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
            {/* Transparent over the whole option, so a tap anywhere on it selects it. */}
            <input type="radio" name={name} className="absolute inset-0 m-0 cursor-pointer opacity-0" value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Gear button fixed at the bottom right; opens a non-modal panel above it (full width on phones).
 * Closes on Esc, a click outside, or the close button, and returns focus to the gear. Toggles and
 * modes save as soon as they change; number fields save on blur or Enter.
 */
export function PreferencesPanel({ goals, healthEnabled, onChange }: { goals: DailyGoals; healthEnabled: boolean; onChange: (goals: DailyGoals) => void }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>("input, button:not([data-close])")?.focus()
    // Blur first: a target being typed saves on blur, and closing would otherwise unmount it unsaved.
    const commitFocused = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && panel.current?.contains(active)) active.blur()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        commitFocused()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) {
        commitFocused()
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointer)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  const commit = (next: Partial<DailyGoals>) => onChange({ ...goals, ...next })
  const hidden = new Set(goals.hiddenMetrics)

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Daily Tasks preferences"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="pressable fixed right-4 bottom-4 z-30 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg pressable-primary sm:right-6 sm:bottom-6"
      >
        <Settings2 className="size-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="daily-fade-in fixed inset-x-3 bottom-20 z-30 flex max-h-[75svh] flex-col overflow-y-auto rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-22 sm:w-[22rem]"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-sm font-semibold">Preferences</h2>
            <button
              type="button"
              data-close
              className="pressable pressable-quiet rounded-md p-1 text-muted-foreground"
              aria-label="Close preferences"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {!healthEnabled ? (
            <p className="text-sm text-muted-foreground">
              Health tracking is off.{" "}
              <Link href="/settings" className="text-foreground underline underline-offset-4">
                Turn it on in Settings
              </Link>{" "}
              to log calories, water, sleep, steps, and weight here.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <Section title="Show">
                <ul className="flex flex-col gap-1">
                  {HEALTH_METRICS.map((metric) => (
                    <li key={metric}>
                      <label className="relative flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm">
                        {METRIC_LABELS[metric]}
                        <input
                          type="checkbox"
                          role="switch"
                          className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                          checked={!hidden.has(metric)}
                          onChange={(event) =>
                            commit({ hiddenMetrics: HEALTH_METRICS.filter((item) => (item === metric ? !event.currentTarget.checked : hidden.has(item))) })
                          }
                        />
                        {/* Off: outlined track and a muted knob (3:1 or more against the panel); on: filled. */}
                        <span
                          aria-hidden="true"
                          className="relative h-5 w-9 shrink-0 rounded-full border-2 border-muted-foreground bg-transparent transition-colors peer-checked:border-[var(--tone-good)] peer-checked:bg-[var(--tone-good)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-muted-foreground after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-background"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Hidden metrics keep their entries; turn one back on to see them.</p>
              </Section>
              <Section title="Goal">
                <Segmented<GoalMode>
                  legend="Goal mode"
                  name="goalMode"
                  value={goals.goalMode}
                  onChange={(goalMode) => commit({ goalMode })}
                  options={[
                    { value: "cut", label: "Cutting" },
                    { value: "bulk", label: "Bulking" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {goals.goalMode === "cut"
                    ? `Cutting: the calorie target is a limit. Under ${Math.round(CLOSE_RATIO * 100)}% is fine, close is a heads-up, over is flagged.`
                    : `Bulking: the calorie target is a minimum. From ${Math.round(CLOSE_RATIO * 100)}% you are close; reaching it is the goal.`}
                </p>
                <Segmented<ProteinDirection>
                  legend="Protein"
                  name="proteinDirection"
                  value={goals.proteinDirection}
                  onChange={(proteinDirection) => commit({ proteinDirection })}
                  options={[
                    { value: "follow", label: "Follow goal mode" },
                    { value: "reach", label: "Always reach" },
                  ]}
                />
              </Section>
              <Section title="Targets">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {NUMBER_FIELDS.filter((item) => !hidden.has(item.metric)).map((item) => (
                    <NumberField key={item.key} label={item.label} unit={item.unit} decimal={item.decimal} required={item.required} min={item.min ?? 0} max={item.max} value={goals[item.key]} onCommit={(value) => commit({ [item.key]: value } as Partial<DailyGoals>)} />
                  ))}
                  {hidden.has("weight") ? null : (
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Weight unit
                      <select className="h-9 rounded-lg bg-muted/60 px-2 text-sm text-foreground" value={goals.weightUnit} onChange={(event) => commit({ weightUnit: event.currentTarget.value === "lb" ? "lb" : "kg" })}>
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                      </select>
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Leave a target empty for none. Changes save as you go.</p>
              </Section>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

/** Saves on blur or Enter when the value changed and is valid; an invalid entry reverts. */
function NumberField({ label, unit, value, decimal, required, min, max, onCommit }: { label: string; unit: string; value: number | null; decimal?: boolean; required?: boolean; min: number; max: number; onCommit: (value: number | null) => void }) {
  const [invalid, setInvalid] = useState(false)
  const id = useId()
  const [draft, setDraft] = useState(value == null ? "" : String(value))
  const [shown, setShown] = useState(value)
  // A saved value from elsewhere (or a rollback) replaces the draft.
  if (shown !== value) {
    setShown(value)
    setDraft(value == null ? "" : String(value))
  }
  const save = () => {
    const trimmed = draft.trim()
    if (trimmed === "" && !required) {
      if (value !== null) onCommit(null)
      return
    }
    const parsed = Number(trimmed)
    const valid = trimmed !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max && (decimal || Number.isInteger(parsed))
    setInvalid(!valid)
    if (!valid) return
    if (parsed !== value) onCommit(decimal ? Math.round(parsed * 10) / 10 : parsed)
  }
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <span className="flex items-center gap-1.5">
        <input
          aria-label={label}
          className="h-9 w-full min-w-0 rounded-lg bg-muted/60 px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          inputMode={decimal ? "decimal" : "numeric"}
          value={draft}
          placeholder="None"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setInvalid(false)
          }}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              save()
            }
          }}
        />
        <span className="shrink-0">{unit}</span>
      </span>
      {invalid ? (
        <span id={`${id}-error`} className="text-[var(--tone-over)]">
          {decimal ? "" : "Whole number, "}
          {min}–{max.toLocaleString("en-US")}
          {required ? "" : ", or empty"}
        </span>
      ) : null}
    </label>
  )
}
