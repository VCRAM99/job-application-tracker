"use client"

import { cn } from "cn"
import Link from "next/link"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

/**
 * The ⋯ menu for secondary actions. A disclosure (button with aria-expanded and a list),
 * not a full ARIA menu, so it costs a few hundred bytes instead of a menu library.
 * Opens on click or Enter/Space, closes on Escape, a click outside, or choosing an item.
 * The panel stays mounted while closed, so an item that opens a dialog keeps it open.
 */
export function MoreActions({ label = "More actions", children, align = "end", className }: { label?: string; children: ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  return (
    <div ref={root} className={cn("relative inline-flex", className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="pressable inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-background px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <div
        id={id}
        hidden={!open}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a,button")) setOpen(false)
        }}
        className={cn(
          "absolute top-full z-50 mt-1 flex min-w-48 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </div>
  )
}

const ITEM =
  "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"

export function MoreActionsLink({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  return external ? (
    <a href={href} className={ITEM}>
      {children}
    </a>
  ) : (
    <Link href={href} className={ITEM}>
      {children}
    </Link>
  )
}

export function MoreActionsButton({ onClick, children, destructive = false, disabled, type = "button" }: { onClick?: () => void; children: ReactNode; destructive?: boolean; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(ITEM, destructive && "text-destructive")}>
      {children}
    </button>
  )
}

/** Class for a menu item rendered by another component (such as a dialog trigger). */
export const moreActionsItemClass = ITEM
