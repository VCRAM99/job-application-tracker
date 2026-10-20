"use client"

import { Beef, Flame, Footprints, Moon, Scale } from "lucide-react"

import { Disclosure } from "@/components/daily/disclosure"
import { EntryEditor } from "@/components/daily/entry-editor"
import { HealthChart } from "@/components/daily/health-chart"
import { MetricTotal } from "@/components/daily/metric"
import { SubmitButton } from "@/components/daily/controls"
import { TargetsForm } from "@/components/daily/targets-form"
import { WaterCard } from "@/components/daily/water-card"
import { WeightHistoryChart } from "@/components/daily/weight-history"
import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { addWaterAmount, deleteOwned, saveFood, saveSleep, saveSteps, saveWeight } from "@/lib/daily/actions"
import { formatCount, formatSleep, kgToDisplay, sumNumbers, waterTotal, type WeightUnit } from "@/lib/daily/health"

type Food = { id: string; description: string | null; calories: number; protein: number; entryTime: string | null }
type Entry = { id: string; amount: number }

export function HealthPanel({
  date,
  today,
  defaultOpen,
  goals,
  food,
  water,
  sleep,
  steps,
  weight,
  chart,
}: {
  date: string
  today: string
  defaultOpen: boolean
  goals: {
    calorieTarget: number | null
    proteinTarget: number | null
    waterGoalMl: number | null
    waterIncrementMl: number
    sleepTargetMinutes: number | null
    stepTarget: number | null
    weightUnit: WeightUnit
  }
  food: Food[]
  water: Entry[]
  sleep: Entry[]
  steps: Entry[]
  weight: Array<{ id: string; measuredOn: string; weightKg: number }>
  chart: {
    calories: Array<{ date: string; value: number }>
    protein: Array<{ date: string; value: number }>
    water: Array<{ date: string; value: number }>
    sleep: Array<{ date: string; value: number }>
    steps: Array<{ date: string; value: number }>
    weight: Array<{ date: string; value: number }>
  }
}) {
  const calories = sumNumbers(food.map((item) => item.calories))
  const protein = sumNumbers(food.map((item) => item.protein))
  const waterSum = waterTotal(water.map((item) => item.amount))
  const sleepSum = sumNumbers(sleep.map((item) => item.amount))
  const stepSum = sumNumbers(steps.map((item) => item.amount))
  const unit = goals.weightUnit
  const latest = [...weight].sort((left, right) => right.measuredOn.localeCompare(left.measuredOn))[0]
  const summary = `${formatCount(calories)} kcal · ${formatCount(waterSum)} mL water`

  return (
    <Disclosure
      title="Health Tracking"
      badge={<span className="pill">Beta</span>}
      summary={`${date} · ${summary}`}
      defaultOpen={defaultOpen}
      persistKey="daily_health_open"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Personal notes for this date. Targets are optional, and passing one is not a problem.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="surface space-y-4 p-4 md:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTotal label="Calories" icon={Flame} accent="var(--metric-calories)" value={calories} unit="kcal" target={goals.calorieTarget} />
              <MetricTotal label="Protein" icon={Beef} accent="var(--metric-protein)" value={protein} unit="g" target={goals.proteinTarget} />
            </div>
            <ul className="space-y-2">
              {food.map((item) => (
                <li key={item.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{item.description || "Entry"}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{formatCount(item.calories)} kcal · {formatCount(item.protein)} g protein{item.entryTime ? ` · ${item.entryTime.slice(0, 5)}` : ""}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <EntryEditor label={`Edit ${item.description || "food entry"}`}>
                        <form action={saveFood} className="grid w-56 gap-2">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="date" value={date} />
                          <input name="description" aria-label="Description" defaultValue={item.description ?? ""} className="field-control" />
                          <input name="calories" aria-label="Calories" defaultValue={item.calories} inputMode="numeric" required className="field-control" />
                          <input name="protein" aria-label="Protein" defaultValue={item.protein} inputMode="decimal" required className="field-control" />
                          <input name="entryTime" aria-label="Time" type="time" defaultValue={item.entryTime?.slice(0, 5) ?? ""} className="field-control" />
                          <SubmitButton pendingLabel="Saving…">Save food</SubmitButton>
                        </form>
                      </EntryEditor>
                      <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this food entry?" description="This removes the entry for this date." fields={{ table: "food_entries" }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <form action={saveFood} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="date" value={date} />
              <input name="description" aria-label="Food description" placeholder="Description" className="field-control sm:col-span-2" />
              <input name="calories" aria-label="Calories" placeholder="Calories" inputMode="numeric" required className="field-control" />
              <input name="protein" aria-label="Protein grams" placeholder="Protein (g)" inputMode="decimal" required className="field-control" />
              <input name="entryTime" aria-label="Time" type="time" className="field-control" />
              <SubmitButton pendingLabel="Adding…">Add food</SubmitButton>
            </form>
          </article>
          <WaterCard date={date} serverTotal={waterSum} increment={goals.waterIncrementMl} goal={goals.waterGoalMl} add={addWaterAmount} />
          <article className="surface space-y-4 p-4">
            <MetricTotal
              label="Sleep"
              icon={Moon}
              accent="var(--metric-sleep)"
              value={sleepSum}
              unit="min"
              target={goals.sleepTargetMinutes}
              display={sleep.length ? formatSleep(sleepSum) : "0h 0m"}
              targetText={goals.sleepTargetMinutes != null ? `of ${formatSleep(goals.sleepTargetMinutes)}` : undefined}
            />
            <form action={saveSleep} className="flex flex-wrap gap-2">
              <input type="hidden" name="date" value={date} />
              <input name="hours" aria-label="Hours slept" inputMode="numeric" placeholder="Hours" required className="field-control w-24" />
              <input name="minutes" aria-label="Minutes slept" inputMode="numeric" placeholder="Minutes" required className="field-control w-24" />
              <SubmitButton pendingLabel="Adding…">Add sleep</SubmitButton>
            </form>
            {sleep.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="tabular-nums">{formatSleep(item.amount)}</span>
                <div className="flex items-start gap-2">
                  <EntryEditor label="Edit sleep">
                    <form action={saveSleep} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="date" value={date} />
                      <input name="hours" aria-label="Hours" inputMode="numeric" defaultValue={Math.floor(item.amount / 60)} required className="field-control w-20" />
                      <input name="minutes" aria-label="Minutes" inputMode="numeric" defaultValue={item.amount % 60} required className="field-control w-20" />
                      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                    </form>
                  </EntryEditor>
                  <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this sleep entry?" description="This removes the recorded sleep." fields={{ table: "sleep_entries" }} />
                </div>
              </div>
            ))}
          </article>
          <article className="surface space-y-4 p-4">
            <MetricTotal label="Steps" icon={Footprints} accent="var(--metric-steps)" value={stepSum} unit="steps" target={goals.stepTarget} />
            <form action={saveSteps} className="flex flex-wrap gap-2">
              <input type="hidden" name="date" value={date} />
              <input name="steps" aria-label="Steps" inputMode="numeric" placeholder="Steps" required className="field-control w-32" />
              <SubmitButton pendingLabel="Adding…">Add steps</SubmitButton>
            </form>
            {steps.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="tabular-nums">{formatCount(item.amount)} steps</span>
                <div className="flex items-start gap-2">
                  <EntryEditor label="Edit steps">
                    <form action={saveSteps} className="flex gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="date" value={date} />
                      <input name="steps" aria-label="Steps" inputMode="numeric" defaultValue={item.amount} required className="field-control w-28" />
                      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                    </form>
                  </EntryEditor>
                  <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this step entry?" description="This removes the recorded steps." fields={{ table: "step_entries" }} />
                </div>
              </div>
            ))}
          </article>
          <article className="surface space-y-4 p-4">
            <div className="flex items-center gap-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              <Scale className="size-3.5" style={{ color: "var(--metric-weight)" }} aria-hidden="true" />
              Weight
            </div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {latest ? kgToDisplay(latest.weightKg, unit) : "—"}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>
            </p>
            <p className="text-sm text-muted-foreground">{latest ? `Latest on ${latest.measuredOn}` : "No measurement yet"}</p>
            <form action={saveWeight} className="flex flex-wrap gap-2">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="unit" value={unit} />
              <input name="weight" aria-label={`Weight in ${unit}`} inputMode="decimal" placeholder={unit} required className="field-control w-32" />
              <SubmitButton pendingLabel="Adding…">Add weight</SubmitButton>
            </form>
            <Disclosure title="Weight history" summary={weight.length === 1 ? "1 measurement" : `${weight.length} measurements`} plain>
              <WeightHistoryChart points={weight.map((item) => ({ date: item.measuredOn, kg: item.weightKg }))} unit={unit} />
              <ul className="mt-3 space-y-2 text-sm">
                {weight.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-2">
                    <span className="tabular-nums">{item.measuredOn} · {kgToDisplay(item.weightKg, unit)} {unit}</span>
                    <div className="flex items-start gap-2">
                      <EntryEditor label={`Edit weight on ${item.measuredOn}`}>
                        <form action={saveWeight} className="flex gap-2">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="date" value={item.measuredOn} />
                          <input type="hidden" name="unit" value={unit} />
                          <input name="weight" aria-label="Weight" inputMode="decimal" defaultValue={kgToDisplay(item.weightKg, unit)} required className="field-control w-28" />
                          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                        </form>
                      </EntryEditor>
                      <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this weight?" description="This removes the measurement." fields={{ table: "weight_entries" }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </article>
        </div>
        <Disclosure title="Health Insights" summary="Relative trends" plain>
          <HealthChart today={today} weightUnit={unit} {...chart} />
        </Disclosure>
        <Disclosure title="Targets & Preferences" summary="Optional daily targets" plain>
          <TargetsForm goals={goals} />
        </Disclosure>
      </div>
    </Disclosure>
  )
}
