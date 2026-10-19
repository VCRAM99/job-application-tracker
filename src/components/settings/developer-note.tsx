import { ExternalLink } from "lucide-react"

import { DEVELOPER_CREDIT, PORTFOLIO_URL } from "@/lib/branding"

export function DeveloperNote() {
  return (
    <div className="space-y-3 text-sm leading-6">
      <p>{DEVELOPER_CREDIT}</p>
      <a
        href={PORTFOLIO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
      >
        Visit developer portfolio
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  )
}
