import { Check } from "lucide-react"

import { toggleCompletion } from "@/lib/daily/actions"

export function Checklist({
  date,
  items,
}: {
  date: string
  items: Array<{ id: string; title: string; description: string | null; completed: boolean }>
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is scheduled for this date.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <form action={toggleCompletion}>
            <input type="hidden" name="taskId" value={item.id} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="completed" value={item.completed ? "false" : "true"} />
            <button
              type="submit"
              className={`pressable flex min-h-11 w-full items-start gap-3 rounded-xl border px-3 py-3 text-left ${
                item.completed ? "border-emerald-700/30 bg-emerald-500/10" : "pressable-quiet"
              }`}
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                  item.completed ? "border-emerald-700 bg-emerald-600 text-white" : "border-border"
                }`}
                aria-hidden="true"
              >
                {item.completed ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.title}</span>
                {item.description ? (
                  <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                ) : null}
                <span className="sr-only">{item.completed ? "Completed. Mark incomplete." : "Mark complete."}</span>
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  )
}
