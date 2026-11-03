import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { HelpTip } from "@/components/ui/help-tip"
import { Label } from "@/components/ui/label"
import { cn } from "cn"
import type { ApplicationStatus, PriorityTier } from "@/lib/records/constants"
import type { RecordFormState } from "@/lib/records/form-state"

/**
 * Page title row: the title with an optional HelpTip, an optional visible subtitle for
 * context (company, counts, a must-see note), one primary action, and an optional ⋯ menu.
 * Explanations go in `help`, never in a paragraph under the title.
 */
export function PageHeader({
  title,
  help,
  subtitle,
  action,
  menu,
}: {
  title: string
  help?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  menu?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {help ? <HelpTip label={`About ${title}`}>{help}</HelpTip> : null}
        </div>
        {subtitle ? <p className="text-sm text-pretty text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action || menu ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action}
          {menu}
        </div>
      ) : null}
    </header>
  )
}

/** Section title with an optional HelpTip and an optional action on the right. */
export function SectionHeader({
  id,
  title,
  help,
  action,
  level = 2,
}: {
  id?: string
  title: string
  help?: ReactNode
  action?: ReactNode
  level?: 2 | 3
}) {
  const Heading = level === 2 ? "h2" : "h3"
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Heading id={id} className="text-sm font-medium tracking-tight">
          {title}
        </Heading>
        {help ? <HelpTip label={`About ${title.toLowerCase()}`}>{help}</HelpTip> : null}
      </div>
      {action}
    </div>
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
        "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
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
  description?: string
  action?: ReactNode
  tone?: "empty" | "error"
}) {
  return (
    <div
      className="surface px-4 py-10"
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className="text-base font-medium">{title}</h2>
      {description ? <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
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
