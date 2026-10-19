import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { HealthChart } from "@/components/daily/health-chart"
import { addWater, deleteOwned, saveFood, saveHealthGoals, saveSleep, saveSteps, saveWeight } from "@/lib/daily/actions"
import { formatSleep, kgToDisplay, sumNumbers, waterTotal, type WeightUnit } from "@/lib/daily/health"

type Food = { id: string; description: string | null; calories: number; protein: number; entryTime: string | null }
type Entry = { id: string; amount: number }

export function HealthPanel({
  date,
  today,
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Health tracking</h2>
        <p className="text-sm text-muted-foreground">Optional personal notes for this date. Targets are yours to set, and going past one is not a problem.</p>
      </header>
      <form action={saveHealthGoals} className="surface grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-sm">Calorie target<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="calorieTarget" defaultValue={goals.calorieTarget ?? ""} inputMode="numeric" /></label>
        <label className="text-sm">Protein target (g)<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="proteinTarget" defaultValue={goals.proteinTarget ?? ""} inputMode="decimal" /></label>
        <label className="text-sm">Water goal (mL)<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="waterGoalMl" defaultValue={goals.waterGoalMl ?? ""} inputMode="numeric" /></label>
        <label className="text-sm">Water increment (mL)<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="waterIncrementMl" defaultValue={goals.waterIncrementMl} inputMode="numeric" /></label>
        <label className="text-sm">Sleep target (minutes)<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="sleepTargetMinutes" defaultValue={goals.sleepTargetMinutes ?? ""} inputMode="numeric" /></label>
        <label className="text-sm">Step target<input className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" name="stepTarget" defaultValue={goals.stepTarget ?? ""} inputMode="numeric" /></label>
        <label className="text-sm">Weight display
          <select name="weightUnit" defaultValue={unit} className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1">
            <option value="kg">Kilograms</option>
            <option value="lb">Pounds</option>
          </select>
        </label>
        <button className="h-8 self-end rounded-lg bg-primary px-3 text-sm text-primary-foreground" type="submit">Save targets</button>
      </form>
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="surface space-y-3 p-4">
          <h3 className="text-sm font-medium">Food</h3>
          <p className="text-sm text-muted-foreground">{calories} kcal · {protein} g protein{goals.calorieTarget != null ? ` · target ${goals.calorieTarget} kcal` : ""}{goals.proteinTarget != null ? ` · target ${goals.proteinTarget} g` : ""}</p>
          <ul className="space-y-1 text-sm">
            {food.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words">{item.description || "Entry"} · {item.calories} kcal · {item.protein} g</span>
                <details>
                  <summary className="cursor-pointer">Edit</summary>
                  <form action={saveFood} className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="date" value={date} />
                    <input name="description" defaultValue={item.description ?? ""} className="rounded-lg border bg-transparent px-2 py-1" />
                    <input name="calories" defaultValue={item.calories} inputMode="numeric" required className="rounded-lg border bg-transparent px-2 py-1" />
                    <input name="protein" defaultValue={item.protein} inputMode="decimal" required className="rounded-lg border bg-transparent px-2 py-1" />
                    <input name="entryTime" type="time" defaultValue={item.entryTime ?? ""} className="rounded-lg border bg-transparent px-2 py-1" />
                    <button className="rounded-lg border px-3 py-1" type="submit">Save food</button>
                  </form>
                </details>
                <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this food entry?" description="This removes the entry for this date." fields={{ table: "food_entries" }} />
              </li>
            ))}
          </ul>
          <form action={saveFood} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="date" value={date} />
            <input name="description" placeholder="Description" className="rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <input name="calories" placeholder="Calories" inputMode="numeric" required className="rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <input name="protein" placeholder="Protein (g)" inputMode="decimal" required className="rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <input name="entryTime" type="time" className="rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <button className="rounded-lg border px-3 py-1 text-sm" type="submit">Add food</button>
          </form>
        </article>
        <article className="surface space-y-3 p-4">
          <h3 className="text-sm font-medium">Water</h3>
          <p className="text-sm text-muted-foreground">{waterSum} mL{goals.waterGoalMl != null ? ` · goal ${goals.waterGoalMl} mL` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <form action={addWater}><input type="hidden" name="date" value={date} /><input type="hidden" name="amount" value={goals.waterIncrementMl} /><button className="rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground" type="submit">+ {goals.waterIncrementMl} mL</button></form>
            <form action={addWater}><input type="hidden" name="date" value={date} /><input type="hidden" name="amount" value={-goals.waterIncrementMl} /><button className="rounded-lg border px-3 py-1 text-sm" type="submit">Undo {goals.waterIncrementMl} mL</button></form>
          </div>
          <form action={addWater} className="flex gap-2">
            <input type="hidden" name="date" value={date} />
            <input name="amount" inputMode="numeric" placeholder="mL" className="w-28 rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <button className="rounded-lg border px-3 py-1 text-sm" type="submit">Add amount</button>
          </form>
        </article>
        <article className="surface space-y-3 p-4">
          <h3 className="text-sm font-medium">Sleep</h3>
          <p className="text-sm text-muted-foreground">{sleep.length ? formatSleep(sleepSum) : "No sleep recorded"}{goals.sleepTargetMinutes != null ? ` · target ${formatSleep(goals.sleepTargetMinutes)}` : ""}</p>
          <form action={saveSleep} className="flex flex-wrap gap-2">
            <input type="hidden" name="date" value={date} />
            <input name="hours" inputMode="numeric" placeholder="Hours" required className="w-24 rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <input name="minutes" inputMode="numeric" placeholder="Minutes" required className="w-24 rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <button className="rounded-lg border px-3 py-1 text-sm" type="submit">Add sleep</button>
          </form>
          {sleep.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{formatSleep(item.amount)}</span>
              <details>
                <summary className="cursor-pointer">Edit</summary>
                <form action={saveSleep} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="date" value={date} />
                  <input name="hours" inputMode="numeric" defaultValue={Math.floor(item.amount / 60)} required className="w-20 rounded-lg border bg-transparent px-2 py-1" />
                  <input name="minutes" inputMode="numeric" defaultValue={item.amount % 60} required className="w-20 rounded-lg border bg-transparent px-2 py-1" />
                  <button className="rounded-lg border px-3 py-1" type="submit">Save</button>
                </form>
              </details>
              <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this sleep entry?" description="This removes the recorded sleep." fields={{ table: "sleep_entries" }} />
            </div>
          ))}
        </article>
        <article className="surface space-y-3 p-4">
          <h3 className="text-sm font-medium">Steps</h3>
          <p className="text-sm text-muted-foreground">{stepSum} steps{goals.stepTarget != null ? ` · target ${goals.stepTarget}` : ""}</p>
          <form action={saveSteps} className="flex gap-2">
            <input type="hidden" name="date" value={date} />
            <input name="steps" inputMode="numeric" placeholder="Steps" required className="w-32 rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <button className="rounded-lg border px-3 py-1 text-sm" type="submit">Add steps</button>
          </form>
          {steps.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{item.amount} steps</span>
              <details>
                <summary className="cursor-pointer">Edit</summary>
                <form action={saveSteps} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="date" value={date} />
                  <input name="steps" inputMode="numeric" defaultValue={item.amount} required className="w-28 rounded-lg border bg-transparent px-2 py-1" />
                  <button className="rounded-lg border px-3 py-1" type="submit">Save</button>
                </form>
              </details>
              <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this step entry?" description="This removes the recorded steps." fields={{ table: "step_entries" }} />
            </div>
          ))}
        </article>
        <article className="surface space-y-3 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium">Weight</h3>
          <form action={saveWeight} className="flex flex-wrap gap-2">
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="unit" value={unit} />
            <input name="weight" inputMode="decimal" placeholder={unit} required className="w-32 rounded-lg border bg-transparent px-2 py-1 text-sm" />
            <button className="rounded-lg border px-3 py-1 text-sm" type="submit">Add weight</button>
          </form>
          <details>
            <summary className="cursor-pointer text-sm">Weight history</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {weight.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{item.measuredOn} · {kgToDisplay(item.weightKg, unit)} {unit}</span>
                  <details>
                    <summary className="cursor-pointer">Edit</summary>
                    <form action={saveWeight} className="mt-2 flex gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="date" value={item.measuredOn} />
                      <input type="hidden" name="unit" value={unit} />
                      <input name="weight" inputMode="decimal" defaultValue={kgToDisplay(item.weightKg, unit)} required className="w-28 rounded-lg border bg-transparent px-2 py-1" />
                      <button className="rounded-lg border px-3 py-1" type="submit">Save</button>
                    </form>
                  </details>
                  <DeleteRecordButton action={deleteOwned} id={item.id} label="Delete" title="Delete this weight?" description="This removes the measurement." fields={{ table: "weight_entries" }} />
                </li>
              ))}
            </ul>
          </details>
        </article>
      </div>
      <details className="surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Health insights</summary>
        <div className="mt-4">
          <HealthChart today={today} weightUnit={unit} {...chart} />
        </div>
      </details>
    </section>
  )
}
