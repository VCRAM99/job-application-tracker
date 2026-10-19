"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  PREPARATION_CATEGORIES,
  PREPARATION_CATEGORY_LABELS,
  PREPARATION_STATUSES,
  PREPARATION_STATUS_LABELS,
} from "@/lib/records/constants"
import { formText, initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { fieldErrorsFrom, preparationFormSchema } from "@/lib/records/schemas"

export type PreparationFormValues = {
  title: string
  category: string
  status: string
  targetDate: string
  resourceUrl: string
  notes: string
}

export const emptyPreparationForm: PreparationFormValues = {
  title: "",
  category: "other",
  status: "not_started",
  targetDate: "",
  resourceUrl: "",
  notes: "",
}

export function PreparationForm({
  action,
  values,
  id,
  submitLabel,
  cancelHref,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  values: PreparationFormValues
  id?: string
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const parsed = preparationFormSchema.safeParse({
        title: formText(formData, "title"),
        category: formText(formData, "category"),
        status: formText(formData, "status"),
        targetDate: formText(formData, "targetDate"),
        resourceUrl: formText(formData, "resourceUrl"),
        notes: formText(formData, "notes"),
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
      <Field name="category" label="Category" error={state.fieldErrors.category}>
        <NativeSelect id="category" name="category" defaultValue={values.category}>
          {PREPARATION_CATEGORIES.map((value) => (
            <option key={value} value={value}>{PREPARATION_CATEGORY_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="status" label="Status" error={state.fieldErrors.status}>
        <NativeSelect id="status" name="status" defaultValue={values.status}>
          {PREPARATION_STATUSES.map((value) => (
            <option key={value} value={value}>{PREPARATION_STATUS_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="targetDate" label="Target date" error={state.fieldErrors.targetDate}>
        <Input id="targetDate" name="targetDate" type="date" defaultValue={values.targetDate} />
      </Field>
      <Field name="resourceUrl" label="Resource link" error={state.fieldErrors.resourceUrl}>
        <Input id="resourceUrl" name="resourceUrl" type="url" placeholder="https://" defaultValue={values.resourceUrl} aria-invalid={Boolean(state.fieldErrors.resourceUrl)} aria-describedby={state.fieldErrors.resourceUrl ? "resourceUrl-error" : undefined} />
      </Field>
      <div className="sm:col-span-2">
        <Field name="notes" label="Notes" error={state.fieldErrors.notes}>
          <Textarea id="notes" name="notes" defaultValue={values.notes} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  )
}
