/** Rows per page on long record lists. Lists at or under this size show no pager. */
export const LIST_PAGE_SIZE = 100

export type Paged<T> = { items: T[]; page: number; pages: number; total: number; from: number; to: number }

/** `?page=` as a whole number from 1; anything else is page 1. */
export function parsePage(params: URLSearchParams): number {
  const raw = params.get("page") ?? ""
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1
}

/** One page of already filtered and sorted rows. A page past the end shows the last page. */
export function paginate<T>(rows: T[], page: number, size = LIST_PAGE_SIZE): Paged<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  const items = rows.slice(start, start + size)
  return { items, page: current, pages, total: rows.length, from: rows.length ? start + 1 : 0, to: start + items.length }
}
