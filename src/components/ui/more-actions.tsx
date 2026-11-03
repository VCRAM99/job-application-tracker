"use client"

import { cn } from "cn"
import Link from "next/link"
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

import { useAnchoredPosition, useMounted } from "@/components/ui/anchored"

/** The ⋯ button of the enclosing menu, so a dialog opened from an item can return focus to it. */
const MoreActionsTrigger = createContext<RefObject<HTMLButtonElement | null> | null>(null)

export function useMoreActionsTrigger() {
  return useContext(MoreActionsTrigger)
}

/**
 * The ⋯ menu for secondary actions. A disclosure (button with aria-expanded and a list of
 * links and buttons), not a full ARIA menu, so it costs a few hundred bytes instead of a menu
 * library. The panel renders in a portal at a fixed, viewport-clamped position, so a card's
 * overflow never clips it.
 * - Opens on click, Enter, or Space; the first item takes focus.
 * - Arrow keys move between items. Escape or Tab closes it and returns focus to the button.
 * - Closes on a click outside, on choosing an item, or when focus leaves it.
 * - The panel stays mounted while closed, so an item that opens a dialog keeps it open.
 */
export function MoreActions({ label = "More actions", children, align = "end", className }: { label?: string; children: ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const mounted = useMounted()
  useAnchoredPosition(open, button, panel, align)

  const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a,button:not(:disabled)") ?? [])
  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!button.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("a,button:not(:disabled)")?.focus()
  }, [open])

  return (
    <MoreActionsTrigger.Provider value={button}>
      <div className={cn("relative inline-flex", className)}>
        <button
          ref={button}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="pressable inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border bg-background px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none sm:h-8 sm:min-w-8"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        {mounted
          ? createPortal(
              <div
                ref={panel}
                id={id}
                hidden={!open}
                style={{ top: 0, left: 0, visibility: "hidden" }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a,button")) setOpen(false)
                }}
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null
                  if (next && !panel.current?.contains(next) && !button.current?.contains(next)) setOpen(false)
                }}
                onKeyDown={(event) => {
                  const list = items()
                  const index = list.indexOf(document.activeElement as HTMLElement)
                  if (event.key === "Escape" || event.key === "Tab") {
                    event.preventDefault()
                    close(true)
                  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault()
                    const step = event.key === "ArrowDown" ? 1 : -1
                    list[(index + step + list.length) % list.length]?.focus()
                  }
                }}
                className="fixed z-50 flex min-w-48 flex-col rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
              >
                {children}
              </div>,
              document.body,
            )
          : null}
      </div>
    </MoreActionsTrigger.Provider>
  )
}

const ITEM =
  "flex min-h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:min-h-8"

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
