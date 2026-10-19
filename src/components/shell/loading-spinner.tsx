"use client"

import { useEffect, useState } from "react"

export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50" role="status">
      <span className="sr-only">{label}</span>
      {visible ? (
        <span
          data-testid="loading-spinner"
          className="block size-5 rounded-full border-2 border-muted-foreground/30 border-t-foreground motion-safe:animate-spin"
        />
      ) : null}
    </div>
  )
}
