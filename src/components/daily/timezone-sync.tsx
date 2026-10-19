"use client"

import { useEffect } from "react"

import { saveTimezone } from "@/lib/daily/actions"

export function TimezoneSync({ timezone }: { timezone: string | null }) {
  useEffect(() => {
    if (timezone) return
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected) void saveTimezone(detected)
  }, [timezone])
  return null
}
