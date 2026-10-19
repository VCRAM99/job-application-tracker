"use client"

import { usePathname } from "next/navigation"

import { sectionKey } from "@/lib/navigation"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const section = sectionKey(pathname)

  return (
    <div key={section} className="page-enter">
      {children}
    </div>
  )
}
