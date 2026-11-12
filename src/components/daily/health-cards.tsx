"use client"

import { ArrowDown, ArrowUp, Beef, Check, Droplets, Flame, Footprints, Moon, Pencil, Scale, TriangleAlert, X, type LucideIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useId, useState, type FormEvent, type ReactNode } from "react"

import { isPending } from "@/components/daily/store"
import { LIMITS, targetStatus, type TargetDirection, type TargetTone } from "@/lib/daily/goals"
import { canAddWater, formatCount, formatSleep, kgToDisplay, sleepMinutes, sumNumbers, waterTotal, type WeightUnit } from "@/lib/daily/health"
import type { AmountEntry, FoodEntry, WeightEntry } from "@/lib/daily/model"

const WeightHistoryChart = dynamic(() => import("@/components/daily/weight-history").then((module) => module.WeightHistoryChart), {
  ssr: false,
  loading: () => <div className="h-44 w-full" aria-hidden="true" />,
})

const TONE_COLOR: Record<TargetTone, string> = {
  good: "var(--tone-good)",
  close: "var(--tone-close)",
  over: "var(--tone-over)",
  below: "var(--muted-foreground)",
  none: "var(--muted-foreground)",
}
const TONE_ICON: Record<TargetTone, LucideIcon | null> = { good: Check, close: TriangleAlert, over: ArrowUp, below: ArrowDown, none: null }

/** Total, target, and a status that never relies on color alone: an icon and a word go with it. */
export function TargetMeter({
  label,
  icon: Icon,
  accent,
  value,
  display,
  unit,
  target,
  targetDisplay,
  direction,
}: {
  label: string
  icon: LucideIcon
  accent: string
  value: number
  display?: string
  unit: string
  target: number | null
  targetDisplay?: string
  direction: TargetDirection
}) {
  const status = targetStatus(value, target, direction)
  const StatusIcon = TONE_ICON[status.tone]
  const color = TONE_COLOR[status.tone]
  const width = status.ratio == null ? 0 : Math.min(100, status.ratio * 100)
  return (
    <div className="min-w-0" data-metric={label.toLowerCase()} data-tone={status.tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" style={{ color: accent }} aria-hidden="true" />
          {label}
        </span>
        {status.tone === "none" ? null : (
          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }} data-status>
            {StatusIcon ? <StatusIcon className="size-3.5" aria-hidden="true" /> : null}
            {status.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {display ?? formatCount(value)}
        {display ? null : <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">{status.tone === "none" || target == null ? "No target" : `of ${targetDisplay ?? `${formatCount(target)} ${unit}`}`}</p>
      {status.ratio != null && target != null ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={`${label}: ${status.label}`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(Math.max(0, value), target)}
          aria-valuetext={`${Math.round(status.ratio * 100)}% of target, ${status.label.toLowerCase()}`}
        >
          <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${width}%`, background: color }} />
        </div>
      ) : null}
    </div>
  )
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.06] ${className}`}>{children}</section>
}

const field = "h-9 min-w-0 rounded-lg bg-muted/60 px-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
const addButton = "pressable inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground pressable-primary"
const quietButton = "pressable pressable-quiet inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm"

function numberFrom(form: HTMLFormElement, name: string): number {
  const value = String(new FormData(form).get(name) ?? "").trim()
  return value === "" ? Number.NaN : Number(value)
}

/** Edit and delete for one entry. Pending (unsaved) entries cannot be changed yet. */
function EntryRow({ id, children, editLabel, onDelete, editor }: { id: string; children: ReactNode; editLabel: string; onDelete: () => void; editor: (close: () => void) => ReactNode }) {
  const [editing, setEditing] = useState(false)
  const pending = isPending(id)
  return (
    <li className={`daily-fade-in rounded-lg px-2 py-1.5 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm">{children}</div>
        <div className="flex shrink-0 items-center">
          <button type="button" className="pressable pressable-quiet rounded-md p-1.5 text-muted-foreground" aria-label={editLabel} aria-expanded={editing} disabled={pending} onClick={() => setEditing((open) => !open)}>
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
          <button type="button" className="pressable pressable-quiet rounded-md p-1.5 text-muted-foreground" aria-label={`Delete ${editLabel.replace(/^Edit /, "")}`} disabled={pending} onClick={onDelete}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {editing ? <div className="mt-2">{editor(() => setEditing(false))}</div> : null}
    </li>
  )
}

export type FoodSave = { id?: string; description: string; calories: number; protein: number; entryTime: string }

function FoodFields({ initial, idPrefix }: { initial?: FoodEntry; idPrefix: string }) {
  return (
    <>
      <label className="sr-only" htmlFor={`${idPrefix}-description`}>Food</label>
      <input id={`${idPrefix}-description`} name="description" placeholder="Food" defaultValue={initial?.description ?? ""} className={`${field} col-span-2 sm:col-span-1 sm:flex-1`} aria-label="Food" />
      <label className="sr-only" htmlFor={`${idPrefix}-calories`}>Calories</label>
      <input id={`${idPrefix}-calories`} name="calories" placeholder="kcal" inputMode="numeric" required defaultValue={initial?.calories ?? ""} className={`${field} w-full sm:w-20`} aria-label="Calories" />
      <label className="sr-only" htmlFor={`${idPrefix}-protein`}>Protein</label>
      <input id={`${idPrefix}-protein`} name="protein" placeholder="Protein g" inputMode="decimal" required defaultValue={initial?.protein ?? ""} className={`${field} w-full sm:w-24`} aria-label="Protein" />
      <label className="sr-only" htmlFor={`${idPrefix}-time`}>Time</label>
      <input id={`${idPrefix}-time`} name="entryTime" type="time" defaultValue={initial?.entryTime ?? ""} className={`${field} w-full sm:w-28`} aria-label="Time" />
    </>
  )
}

function readFood(form: HTMLFormElement): FoodSave | string {
  const calories = numberFrom(form, "calories")
  const protein = numberFrom(form, "protein")
  if (!Number.isInteger(calories) || calories < 0 || calories > 20000) return "Enter calories as a whole number."
  if (!Number.isFinite(protein) || protein < 0 || protein > 1000) return "Enter protein in grams."
  const data = new FormData(form)
  return { description: String(data.get("description") ?? ""), calories, protein, entryTime: String(data.get("entryTime") ?? "") }
}

export function FoodCard({
  entries,
  calorieTarget,
  proteinTarget,
  calorieDirection,
  proteinDirection,
  onSave,
  onDelete,
  onInvalid,
}: {
  entries: FoodEntry[]
  calorieTarget: number | null
  proteinTarget: number | null
  calorieDirection: TargetDirection
  proteinDirection: TargetDirection
  onSave: (input: FoodSave) => void
  onDelete: (entry: FoodEntry) => void
  onInvalid: (message: string) => void
}) {
  const id = useId()
  const sorted = [...entries].sort((a, b) => (a.entryTime ?? "99").localeCompare(b.entryTime ?? "99"))
  function submit(event: FormEvent<HTMLFormElement>, existing?: FoodEntry, close?: () => void) {
    event.preventDefault()
    const form = event.currentTarget
    const input = readFood(form)
    if (typeof input === "string") return onInvalid(input)
    onSave({ ...input, id: existing?.id })
    if (existing) close?.()
    else {
      form.reset()
      ;(form.elements.namedItem("description") as HTMLInputElement | null)?.focus()
    }
  }
  return (
    <Card className="md:col-span-2">
      <div className="grid grid-cols-2 gap-4">
        <TargetMeter label="Calories" icon={Flame} accent="var(--metric-calories)" value={sumNumbers(entries.map((entry) => entry.calories))} unit="kcal" target={calorieTarget} direction={calorieDirection} />
        <TargetMeter label="Protein" icon={Beef} accent="var(--metric-protein)" value={sumNumbers(entries.map((entry) => entry.protein))} unit="g" target={proteinTarget} direction={proteinDirection} />
      </div>
      {sorted.length ? (
        <ul className="-mx-2 flex flex-col">
          {sorted.map((entry) => (
            <EntryRow
              key={entry.id}
              id={entry.id}
              editLabel={`Edit ${entry.description || "food entry"}`}
              onDelete={() => onDelete(entry)}
              editor={(close) => (
                <form className="grid grid-cols-2 gap-2 sm:flex" onSubmit={(event) => submit(event, entry, close)} aria-label={`Edit ${entry.description || "food entry"}`}>
                  <FoodFields initial={entry} idPrefix={`${id}-${entry.id}`} />
                  <button type="submit" className={quietButton}>Save</button>
                </form>
              )}
            >
              <span className="font-medium">{entry.description || "Entry"}</span>
              <span className="ml-2 text-muted-foreground tabular-nums">
                {formatCount(entry.calories)} kcal · {formatCount(entry.protein)} g{entry.entryTime ? ` · ${entry.entryTime}` : ""}
              </span>
            </EntryRow>
          ))}
        </ul>
      ) : null}
      <form className="grid grid-cols-2 gap-2 sm:flex" onSubmit={(event) => submit(event)} aria-label="Add food">
        <FoodFields idPrefix={`${id}-new`} />
        <button type="submit" className={`${addButton} col-span-2 sm:col-span-1`}>Add</button>
      </form>
    </Card>
  )
}

export function WaterCard({ entries, goal, increment, onAdd, onInvalid }: { entries: AmountEntry[]; goal: number | null; increment: number; onAdd: (amount: number) => void; onInvalid: (message: string) => void }) {
  const total = waterTotal(entries.map((entry) => entry.amount))
  const id = useId()
  return (
    <Card>
      <TargetMeter label="Water" icon={Droplets} accent="var(--metric-water)" value={total} unit="mL" target={goal} direction="reach" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={addButton} onClick={() => onAdd(increment)}>+ {increment} mL</button>
        <button type="button" className={quietButton} disabled={!canAddWater(total, -increment)} onClick={() => onAdd(-increment)}>Undo {increment} mL</button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const amount = numberFrom(event.currentTarget, "amount")
          if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > LIMITS.waterEntry) return onInvalid("Enter a whole number of milliliters, up to 5,000 at a time.")
          if (!canAddWater(total, amount)) return onInvalid("That would make the day's water total negative.")
          onAdd(amount)
          event.currentTarget.reset()
        }}
        aria-label="Add water"
      >
        <label className="sr-only" htmlFor={`${id}-water`}>Water amount in milliliters</label>
        <input id={`${id}-water`} name="amount" inputMode="numeric" placeholder="mL" className={`${field} w-24`} />
        <button type="submit" className={quietButton}>Add</button>
      </form>
    </Card>
  )
}

export function SleepCard({ entries, target, onSave, onDelete, onInvalid }: { entries: AmountEntry[]; target: number | null; onSave: (minutes: number, id?: string) => void; onDelete: (entry: AmountEntry) => void; onInvalid: (message: string) => void }) {
  const id = useId()
  const total = sumNumbers(entries.map((entry) => entry.amount))
  function submit(event: FormEvent<HTMLFormElement>, existing?: AmountEntry, close?: () => void) {
    event.preventDefault()
    const form = event.currentTarget
    const minutes = sleepMinutes(numberFrom(form, "hours") || 0, numberFrom(form, "minutes") || 0)
    if (minutes == null || minutes < 1) return onInvalid("Enter between 1 minute and 24 hours.")
    onSave(minutes, existing?.id)
    if (existing) close?.()
    else form.reset()
  }
  const fields = (prefix: string, initial?: AmountEntry) => (
    <>
      <input id={`${prefix}-h`} name="hours" inputMode="numeric" placeholder="h" aria-label="Hours slept" defaultValue={initial ? Math.floor(initial.amount / 60) : ""} className={`${field} w-16`} />
      <input id={`${prefix}-m`} name="minutes" inputMode="numeric" placeholder="min" aria-label="Minutes slept" defaultValue={initial ? initial.amount % 60 : ""} className={`${field} w-16`} />
    </>
  )
  return (
    <Card>
      <TargetMeter label="Sleep" icon={Moon} accent="var(--metric-sleep)" value={total} display={formatSleep(total)} unit="min" target={target} targetDisplay={target != null ? formatSleep(target) : undefined} direction="reach" />
      {entries.length ? (
        <ul className="-mx-2 flex flex-col">
          {entries.map((entry) => (
            <EntryRow key={entry.id} id={entry.id} editLabel="Edit sleep" onDelete={() => onDelete(entry)} editor={(close) => (
              <form className="flex gap-2" onSubmit={(event) => submit(event, entry, close)} aria-label="Edit sleep">
                {fields(`${id}-${entry.id}`, entry)}
                <button type="submit" className={quietButton}>Save</button>
              </form>
            )}>
              <span className="tabular-nums">{formatSleep(entry.amount)}</span>
            </EntryRow>
          ))}
        </ul>
      ) : null}
      <form className="flex gap-2" onSubmit={(event) => submit(event)} aria-label="Add sleep">
        {fields(`${id}-new`)}
        <button type="submit" className={quietButton}>Add</button>
      </form>
    </Card>
  )
}

export function StepsCard({ entries, target, onSave, onDelete, onInvalid }: { entries: AmountEntry[]; target: number | null; onSave: (steps: number, id?: string) => void; onDelete: (entry: AmountEntry) => void; onInvalid: (message: string) => void }) {
  const id = useId()
  function submit(event: FormEvent<HTMLFormElement>, existing?: AmountEntry, close?: () => void) {
    event.preventDefault()
    const form = event.currentTarget
    const steps = numberFrom(form, "steps")
    if (!Number.isInteger(steps) || steps < 1 || steps > 200000) return onInvalid("Enter a whole number of steps.")
    onSave(steps, existing?.id)
    if (existing) close?.()
    else form.reset()
  }
  return (
    <Card>
      <TargetMeter label="Steps" icon={Footprints} accent="var(--metric-steps)" value={sumNumbers(entries.map((entry) => entry.amount))} unit="steps" target={target} direction="reach" />
      {entries.length ? (
        <ul className="-mx-2 flex flex-col">
          {entries.map((entry) => (
            <EntryRow key={entry.id} id={entry.id} editLabel="Edit steps" onDelete={() => onDelete(entry)} editor={(close) => (
              <form className="flex gap-2" onSubmit={(event) => submit(event, entry, close)} aria-label="Edit steps">
                <input name="steps" inputMode="numeric" aria-label="Steps" defaultValue={entry.amount} className={`${field} w-28`} />
                <button type="submit" className={quietButton}>Save</button>
              </form>
            )}>
              <span className="tabular-nums">{formatCount(entry.amount)} steps</span>
            </EntryRow>
          ))}
        </ul>
      ) : null}
      <form className="flex gap-2" onSubmit={(event) => submit(event)} aria-label="Add steps">
        <label className="sr-only" htmlFor={`${id}-steps`}>Steps</label>
        <input id={`${id}-steps`} name="steps" inputMode="numeric" placeholder="Steps" className={`${field} w-28`} />
        <button type="submit" className={quietButton}>Add</button>
      </form>
    </Card>
  )
}

export function WeightCard({ entries, date, unit, onSave, onDelete, onInvalid }: { entries: WeightEntry[]; date: string; unit: WeightUnit; onSave: (value: number, id?: string, onDate?: string) => void; onDelete: (entry: WeightEntry) => void; onInvalid: (message: string) => void }) {
  const id = useId()
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const upToDay = sorted.filter((entry) => entry.date <= date)
  const latest = upToDay[0]
  const [showHistory, setShowHistory] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>, existing?: WeightEntry, close?: () => void) {
    event.preventDefault()
    const form = event.currentTarget
    const value = numberFrom(form, "weight")
    if (!Number.isFinite(value) || value <= 0) return onInvalid("Enter a weight above 0.")
    onSave(value, existing?.id, existing?.date)
    if (existing) close?.()
    else form.reset()
  }
  return (
    <Card>
      <div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Scale className="size-3.5" style={{ color: "var(--metric-weight)" }} aria-hidden="true" />
          Weight
        </span>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
          {latest ? kgToDisplay(latest.kg, unit) : "—"}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </p>
        <p className="text-xs text-muted-foreground">{latest ? (latest.date === date ? "This day" : `Latest on ${latest.date}`) : "No measurement yet"}</p>
      </div>
      <form className="flex gap-2" onSubmit={(event) => submit(event)} aria-label="Add weight">
        <label className="sr-only" htmlFor={`${id}-weight`}>Weight in {unit}</label>
        <input id={`${id}-weight`} name="weight" inputMode="decimal" placeholder={unit} className={`${field} w-24`} />
        <button type="submit" className={quietButton}>Add</button>
      </form>
      {sorted.length ? (
        <div>
          <button type="button" className="pressable pressable-quiet -mx-2 rounded-md px-2 py-1 text-xs text-muted-foreground" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>
            {showHistory ? "Hide history" : `History (${sorted.length})`}
          </button>
          {showHistory ? (
            <div className="mt-2 flex flex-col gap-2">
              <WeightHistoryChart points={sorted.map((entry) => ({ date: entry.date, kg: entry.kg }))} unit={unit} />
              <ul className="-mx-2 flex flex-col">
                {sorted.map((entry) => (
                  <EntryRow key={entry.id} id={entry.id} editLabel={`Edit weight on ${entry.date}`} onDelete={() => onDelete(entry)} editor={(close) => (
                    <form className="flex gap-2" onSubmit={(event) => submit(event, entry, close)} aria-label={`Edit weight on ${entry.date}`}>
                      <input name="weight" inputMode="decimal" aria-label="Weight" defaultValue={kgToDisplay(entry.kg, unit)} className={`${field} w-24`} />
                      <button type="submit" className={quietButton}>Save</button>
                    </form>
                  )}>
                    <span className="tabular-nums">
                      {entry.date} · {kgToDisplay(entry.kg, unit)} {unit}
                    </span>
                  </EntryRow>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
