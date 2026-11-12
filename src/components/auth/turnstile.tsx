"use client"

import { useEffect, useRef } from "react"

import { TURNSTILE_RESPONSE_FIELD, TURNSTILE_SCRIPT_URL, validTurnstileSiteKey } from "@/lib/auth/captcha"

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

// Inlined at build time; the widget is off when it is unset or malformed.
const SITE_KEY = validTurnstileSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

let scriptPromise: Promise<TurnstileApi | null> | null = null

/** Loads Cloudflare's script once per page. Resolves null if it cannot load (the form still submits). */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve) => {
    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.turnstile ?? null)
    script.onerror = () => {
      scriptPromise = null
      resolve(null)
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Cloudflare Turnstile inside an auth form. It writes its token into a hidden
 * `cf-turnstile-response` field, which the server action passes to Supabase. `resetSignal`
 * changes after every submit, because a token can be used only once.
 */
export function Turnstile({ action, resetSignal }: { action: "login" | "signup" | "password_reset"; resetSignal: unknown }) {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)

  useEffect(() => {
    if (!SITE_KEY || !container.current) return
    const element = container.current
    let cancelled = false
    void loadTurnstile().then((api) => {
      if (cancelled || !api || widget.current) return
      widget.current =
        api.render(element, {
          sitekey: SITE_KEY,
          action,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          size: "flexible",
          "response-field-name": TURNSTILE_RESPONSE_FIELD,
          language: "auto",
        }) ?? null
    })
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [action])

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [resetSignal])

  if (!SITE_KEY) return null
  // Turnstile's widget is 65px tall; reserving the space keeps the button from jumping.
  return <div ref={container} className="min-h-[65px] w-full" data-testid="turnstile" />
}
