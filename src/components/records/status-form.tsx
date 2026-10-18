"use client"

import { useActionState } from "react"

import { FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/lib/records/constants"
import { initialRecordFormState } from "@/lib/records/form-state"
import { updateApplicationStatus } from "@/lib/records/actions"

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, formAction, pending] = useActionState(updateApplicationStatus, initialRecordFormState)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="status-change" className="text-sm font-medium">
            Status
          </label>
          <NativeSelect id="status-change" name="status" defaultValue={status}>
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {APPLICATION_STATUS_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update status"}
        </Button>
      </div>
      <FormStatus state={state} />
    </form>
  )
}
