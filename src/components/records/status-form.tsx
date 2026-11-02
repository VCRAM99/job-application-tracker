"use client"

import { createContext, startTransition, useActionState, useContext, useOptimistic, useState } from "react"

import { FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/records/constants"
import { initialRecordFormState } from "@/lib/records/form-state"
import { updateApplicationStatus } from "@/lib/records/actions"

type Scope = { status: ApplicationStatus; show: (status: ApplicationStatus) => void }

const StatusScope = createContext<Scope | null>(null)

/**
 * Shares the application's status between the status form and the status shown
 * elsewhere on the page. A change shows at once; if the server rejects it, React
 * drops the optimistic value when the action finishes and the saved status returns.
 */
export function ApplicationStatusScope({ status, children }: { status: ApplicationStatus; children: React.ReactNode }) {
  const [optimistic, show] = useOptimistic(status)
  return <StatusScope.Provider value={{ status: optimistic, show }}>{children}</StatusScope.Provider>
}

/** The status label, updated optimistically inside ApplicationStatusScope. */
export function ApplicationStatusLabel({ status }: { status: ApplicationStatus }) {
  const scope = useContext(StatusScope)
  return <>{APPLICATION_STATUS_LABELS[scope?.status ?? status]}</>
}

export function StatusForm({ id, status }: { id: string; status: ApplicationStatus }) {
  const [state, formAction, pending] = useActionState(updateApplicationStatus, initialRecordFormState)
  const scope = useContext(StatusScope)
  // A rejected change puts the select back on the saved status, as the form reset did before.
  const [seen, setSeen] = useState(state)
  const [resets, setResets] = useState(0)
  if (state !== seen) {
    setSeen(state)
    if (state.status === "error") setResets((count) => count + 1)
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // With JavaScript the change shows before the server answers; without it, the form posts as before.
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const next = String(data.get("status"))
        startTransition(() => {
          if (scope && (APPLICATION_STATUSES as readonly string[]).includes(next)) scope.show(next as ApplicationStatus)
          formAction(data)
        })
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="status-change" className="text-sm font-medium">
            Status
          </label>
          <NativeSelect key={`${status}-${resets}`} id="status-change" name="status" defaultValue={status}>
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
