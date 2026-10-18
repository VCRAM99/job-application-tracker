import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { cn } from "cn"
import type { RecordFormState } from "@/lib/records/form-state"

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  )
}

export function FormStatus({ state }: { state: RecordFormState }) {
  if (!state.message) return null
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}

export function Field({
  name,
  label,
  error,
  children,
}: {
  name: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

export function RecordState({
  title,
  description,
  action,
  tone = "empty",
}: {
  title: string
  description: string
  action?: ReactNode
  tone?: "empty" | "error"
}) {
  return (
    <div
      className="rounded-xl border px-4 py-8"
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function DetailList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="text-sm break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
