"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { RelatedFields } from "@/components/tracker/related-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/records/constants"
import { formText, initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { fieldErrorsFrom, taskFormSchema } from "@/lib/records/schemas"
import type { ApplicationOption } from "@/lib/records/tracker"

export type TaskFormValues = {
  title: string
  description: string
  status: string
  priority: string
  dueDate: string
  companyId: string
  applicationId: string
}

export const emptyTaskForm: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: "",
  companyId: "",
  applicationId: "",
}

export function TaskForm({
  action,
  values,
  companies,
  applications,
  id,
  submitLabel,
  cancelHref,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  values: TaskFormValues
  companies: Array<{ id: string; name: string }>
  applications: ApplicationOption[]
  id?: string
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const parsed = taskFormSchema.safeParse({
        title: formText(formData, "title"),
        description: formText(formData, "description"),
        status: formText(formData, "status"),
        priority: formText(formData, "priority"),
        dueDate: formText(formData, "dueDate"),
        companyId: formText(formData, "companyId"),
        applicationId: formText(formData, "applicationId"),
      })
      if (!parsed.success) {
        return {
          status: "error" as const,
          message: "Check the form and try again.",
          fieldErrors: fieldErrorsFrom(parsed.error),
        }
      }
      return action(previous, formData)
    },
    initialRecordFormState,
  )

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormStatus state={state} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="sm:col-span-2">
        <Field name="title" label="Title" error={state.fieldErrors.title}>
          <Input id="title" name="title" defaultValue={values.title} required aria-invalid={Boolean(state.fieldErrors.title)} aria-describedby={state.fieldErrors.title ? "title-error" : undefined} />
        </Field>
      </div>
      <Field name="status" label="Status" error={state.fieldErrors.status}>
        <NativeSelect id="status" name="status" defaultValue={values.status}>
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="priority" label="Priority" error={state.fieldErrors.priority}>
        <NativeSelect id="priority" name="priority" defaultValue={values.priority}>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="dueDate" label="Due date" error={state.fieldErrors.dueDate}>
        <Input id="dueDate" name="dueDate" type="date" defaultValue={values.dueDate} />
      </Field>
      <RelatedFields
        companies={companies}
        applications={applications}
        companyId={values.companyId}
        applicationId={values.applicationId}
        companyError={state.fieldErrors.companyId}
        applicationError={state.fieldErrors.applicationId}
      />
      <div className="sm:col-span-2">
        <Field name="description" label="Description" error={state.fieldErrors.description}>
          <Textarea id="description" name="description" defaultValue={values.description} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  )
}
