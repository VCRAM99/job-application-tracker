import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { cn } from "cn"
import type { ApplicationStatus, PriorityTier } from "@/lib/records/constants"
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
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">{description}</p>
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
      className="surface px-4 py-10"
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
    <dl className="surface grid gap-4 p-4 sm:grid-cols-2">
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

export function StatusPill({ status, label }: { status: ApplicationStatus; label: string }) {
  const tone =
    status === "offer"
      ? "pill-offer"
      : status === "recruiter_screen" || status === "technical_interview" || status === "final_interview"
        ? "pill-interview"
        : status === "applied"
          ? "pill-active"
          : status === "rejected" || status === "withdrawn"
            ? "pill-overdue"
            : ""
  return <span className={`pill ${tone}`}>{label}</span>
}

export function PriorityPill({ tier, label }: { tier: PriorityTier; label: string }) {
  const tone = tier === "A" ? "pill-offer" : tier === "B" ? "pill-active" : ""
  return <span className={`pill ${tone}`}>{label}</span>
}
