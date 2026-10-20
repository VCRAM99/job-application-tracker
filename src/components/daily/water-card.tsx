"use client"

import { Droplets } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { MetricTotal } from "@/components/daily/metric"
import type { ActionFeedback } from "@/lib/daily/actions"
import { canAddWater, createMutationQueue, displayedWater, queueWater, reconcileWaterExtra, rollbackWater, type WaterLedger } from "@/lib/daily/health"

export function WaterCard({
  date,
  serverTotal,
  increment,
  goal,
  add,
}: {
  date: string
  serverTotal: number
  increment: number
  goal: number | null
  add: (date: string, amount: number) => Promise<ActionFeedback>
}) {
  const [ledger, setLedger] = useState<WaterLedger>({ server: serverTotal, extra: 0 })
  const [error, setError] = useState<string | null>(null)
  const queue = useRef(createMutationQueue())
  const visible = ledger.server === serverTotal
    ? ledger
    : { server: serverTotal, extra: reconcileWaterExtra(ledger.extra, serverTotal - ledger.server) }
  const ledgerRef = useRef(visible)
  if (ledger.server !== serverTotal) setLedger(visible)
  useEffect(() => {
    ledgerRef.current = visible
  })
  const shown = displayedWater(visible)

  function apply(amount: number) {
    const current = ledgerRef.current.server === serverTotal
      ? ledgerRef.current
      : { server: serverTotal, extra: reconcileWaterExtra(ledgerRef.current.extra, serverTotal - ledgerRef.current.server) }
    const next = queueWater(current, amount)
    if (!next) return
    ledgerRef.current = next
    setLedger(next)
    setError(null)
    void queue.current(async () => {
      try {
        const result = await add(date, amount)
        if (!result.ok) {
          ledgerRef.current = rollbackWater(ledgerRef.current, amount)
          setLedger(ledgerRef.current)
          setError(result.message)
        }
      } catch {
        ledgerRef.current = rollbackWater(ledgerRef.current, amount)
        setLedger(ledgerRef.current)
        setError("Water could not be saved.")
      }
    })
  }

  return (
    <article className="surface space-y-4 p-4">
      <MetricTotal label="Water" icon={Droplets} accent="var(--metric-water)" value={shown} unit="mL" target={goal} />
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="pressable pressable-primary inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground" onClick={() => apply(increment)}>
          + {increment} mL
        </button>
        <button
          type="button"
          className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm"
          onClick={() => apply(-increment)}
          disabled={!canAddWater(shown, -increment)}
        >
          Undo {increment} mL
        </button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const amount = Number(new FormData(form).get("amount"))
          if (!Number.isInteger(amount) || amount === 0) {
            setError("Enter a whole number of milliliters.")
            return
          }
          apply(amount)
          form.reset()
        }}
      >
        <label className="sr-only" htmlFor={`water-amount-${date}`}>Water amount in milliliters</label>
        <input id={`water-amount-${date}`} name="amount" inputMode="numeric" placeholder="mL" className="field-control w-28" />
        <button type="submit" className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm">Add amount</button>
      </form>
    </article>
  )
}
