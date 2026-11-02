import Link from "next/link"

import { listHref } from "@/lib/records/query"
import type { Paged } from "@/lib/records/pagination"

/** Previous / next links for a long list. Renders nothing when everything fits on one page. */
export function ListPager({ pathname, current, paged, noun }: { pathname: string; current: Record<string, string>; paged: Paged<unknown>; noun: string }) {
  if (paged.pages <= 1) return null
  const link = (page: number) => listHref(pathname, current, { page: page === 1 ? "" : String(page) })
  return (
    <nav aria-label={`${noun} pages`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Showing {paged.from}–{paged.to} of {paged.total} {noun}
      </p>
      <div className="flex gap-2">
        {paged.page > 1 ? (
          <Link href={link(paged.page - 1)} className="rounded-lg border px-3 py-1.5 underline-offset-4 hover:underline">
            Previous
          </Link>
        ) : null}
        {paged.page < paged.pages ? (
          <Link href={link(paged.page + 1)} className="rounded-lg border px-3 py-1.5 underline-offset-4 hover:underline">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  )
}
