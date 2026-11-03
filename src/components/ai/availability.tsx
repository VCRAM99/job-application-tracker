"use client"

import { createContext, useContext, type ReactNode } from "react"

export type AiAvailability = {
  /** Managed AI is enabled on this server and has a platform key. Off: no UI offers it. */
  managed: boolean
  /** Providers this server accepts (AI_PROVIDERS_ENABLED). */
  providers: ReadonlyArray<"openai" | "anthropic" | "google">
}

const Availability = createContext<AiAvailability>({ managed: false, providers: ["google"] })

/** Set once in the signed-in layout from server-only flags; read by billing and provider pickers. */
export function AiAvailabilityProvider({ value, children }: { value: AiAvailability; children: ReactNode }) {
  return <Availability.Provider value={value}>{children}</Availability.Provider>
}

export function useAiAvailability() {
  return useContext(Availability)
}
