"use client"

import { cn } from "cn"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { useAnchoredPosition, useMounted } from "@/components/ui/anchored"

/**
 * A small "?" button whose help text opens on hover, keyboard focus, and tap, and closes on
 * Escape, blur, or a tap outside. The text is linked with aria-describedby, so screen readers
 * announce it with the button. It renders in a portal at a viewport-clamped position, so a
 * card's overflow or the screen edge never cuts it off.
 */
export function HelpTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const open = hover || focus || pinned
  const mounted = useMounted()
  useAnchoredPosition(open, button, tip, "center")

  useEffect(() => {
    if (!pinned) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPinned(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [pinned])

  return (
    <span
      ref={root}
      className={cn("relative inline-flex", className)}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHover(false)}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        className="inline-flex size-6 items-center justify-center rounded-full border text-[11px] leading-none text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none sm:size-5"
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false)
          setPinned(false)
        }}
        onClick={() => setPinned((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false)
            setFocus(false)
            setHover(false)
          }
        }}
      >
        ?
      </button>
      {mounted
        ? createPortal(
            <span
              ref={tip}
              id={id}
              role="tooltip"
              style={{ top: 0, left: 0, visibility: "hidden" }}
              className={cn(
                "fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-md border bg-popover px-3 py-2 text-xs leading-5 font-normal tracking-normal text-popover-foreground normal-case shadow-md",
                open ? "block" : "hidden",
              )}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
