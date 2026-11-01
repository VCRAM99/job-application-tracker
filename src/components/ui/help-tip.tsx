"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { cn } from "cn"

/**
 * A small "?" button whose help text opens on hover, keyboard focus, and tap,
 * and closes on Escape, blur, or a tap outside. The text is linked with
 * aria-describedby, so screen readers announce it with the button.
 */
export function HelpTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  const open = hover || focus || pinned

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
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        className="inline-flex size-5 items-center justify-center rounded-full border text-[11px] leading-none text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
      <span
        id={id}
        role="tooltip"
        className={cn(
          "absolute top-full left-1/2 z-50 mt-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-md",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </span>
    </span>
  )
}
