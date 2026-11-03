"use client"

import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from "react"

const GAP = 4
const EDGE = 8

function hide(popup: HTMLElement) {
  popup.style.visibility = "hidden"
}

function place(anchor: HTMLElement, popup: HTMLElement, align: "start" | "end" | "center") {
  const target = anchor.getBoundingClientRect()
  const width = popup.offsetWidth
  const height = popup.offsetHeight
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = window.innerHeight
  const preferred = align === "end" ? target.right - width : align === "center" ? target.left + target.width / 2 - width / 2 : target.left
  const left = Math.min(Math.max(EDGE, preferred), Math.max(EDGE, viewportWidth - width - EDGE))
  const below = target.bottom + GAP
  const top = below + height > viewportHeight - EDGE && target.top - GAP - height >= EDGE ? target.top - GAP - height : below
  popup.style.top = `${top}px`
  popup.style.left = `${left}px`
  popup.style.visibility = "visible"
}

/**
 * Keeps a fixed, portaled popup next to `anchor` while `open`: below it, or above when there is
 * no room below, aligned to the anchor's start, end, or center, and inside the viewport. A fixed
 * popup in a portal is never clipped by a card's or a list's `overflow-hidden`. The position is
 * written to the popup's style (it is a DOM measurement, not React state).
 */
export function useAnchoredPosition(open: boolean, anchor: RefObject<HTMLElement | null>, popup: RefObject<HTMLElement | null>, align: "start" | "end" | "center") {
  useLayoutEffect(() => {
    const target = anchor.current
    const panel = popup.current
    if (!panel) return
    if (!open || !target) {
      hide(panel)
      return
    }
    place(target, panel, align)
  }, [open, anchor, popup, align])

  useEffect(() => {
    if (!open) return
    const update = () => {
      if (anchor.current && popup.current) place(anchor.current, popup.current, align)
    }
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, anchor, popup, align])
}

const noop = () => () => {}

/** True on the client after hydration, so a portal target exists; false during server render. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}
