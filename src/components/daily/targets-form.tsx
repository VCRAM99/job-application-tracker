"use client"

import { useActionState } from "react"

import { SubmitButton } from "@/components/daily/controls"
import { saveHealthGoals, type ActionFeedback } from "@/lib/daily/actions"
import type { WeightUnit } from "@/lib/daily/health"

export function TargetsForm({
  goals,
}: {
  goals: {
    calorieTarget: number | null
    proteinTarget: number | null
    waterGoalMl: number | null
    waterIncrementMl: number
    sleepTargetMinutes: number | null
    stepTarget: number | null
    weightUnit: WeightUnit
  }
}) {
  const [state, action] = useActionState(
    async (_previous: ActionFeedback | null, formData: FormData) => saveHealthGoals(formData),
    null,
  )

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Calorie target
        <input className="field-control mt-1" name="calorieTarget" defaultValue={goals.calorieTarget ?? ""} inputMode="numeric" />
      </label>
      <label className="text-sm">Protein target (g)
        <input className="field-control mt-1" name="proteinTarget" defaultValue={goals.proteinTarget ?? ""} inputMode="decimal" />
      </label>
      <label className="text-sm">Water goal (mL)
        <input className="field-control mt-1" name="waterGoalMl" defaultValue={goals.waterGoalMl ?? ""} inputMode="numeric" />
      </label>
      <label className="text-sm">Water increment (mL)
        <input className="field-control mt-1" name="waterIncrementMl" defaultValue={goals.waterIncrementMl} inputMode="numeric" />
      </label>
      <label className="text-sm">Sleep target (minutes)
        <input className="field-control mt-1" name="sleepTargetMinutes" defaultValue={goals.sleepTargetMinutes ?? ""} inputMode="numeric" />
      </label>
      <label className="text-sm">Step target
        <input className="field-control mt-1" name="stepTarget" defaultValue={goals.stepTarget ?? ""} inputMode="numeric" />
      </label>
      <label className="text-sm">Weight display
        <select name="weightUnit" defaultValue={goals.weightUnit} className="field-control mt-1">
          <option value="kg">Kilograms</option>
          <option value="lb">Pounds</option>
        </select>
      </label>
      <div className="flex items-end">
        <SubmitButton variant="primary" pendingLabel="Saving…">Save targets</SubmitButton>
      </div>
      {state ? (
        <p className={`text-sm sm:col-span-2 ${state.ok ? "text-muted-foreground" : "text-destructive"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
